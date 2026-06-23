/**
 * Process management for the Claude Code adapter.
 *
 * This module owns spawning, timeout, abort signal handling, and process-tree
 * teardown. The orchestrator (`index.ts`) consumes the returned handle —
 * reading stdout and waiting for completion — but doesn't worry about how
 * the process gets killed or how its config gets isolated.
 *
 * Why a separate module? Process management is the one part of the adapter
 * with real I/O complexity (process groups, signal escalation, temp-dir
 * lifecycle, env merging). Isolating it makes the orchestrator easy to read
 * and lets us swap the spawning logic if we later need to, e.g., wrap claude
 * in a sandbox runner.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";

import { buildArgs } from "./flags";
import type { ClaudeCodeAdapterConfig } from "./types";

/** Default hard timeout per run. Tunable via config.timeoutMs. */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Grace period between SIGTERM and SIGKILL. Most processes shut down cleanly
 * within a few seconds; this gives them that chance while preventing CI from
 * hanging indefinitely on a stuck child.
 */
const KILL_GRACE_MS = 5_000;

/**
 * Handle to a spawned `claude` process. The orchestrator drives it:
 *   - Read `stdout` (typically via parseStreamJson).
 *   - Await `done` to learn the exit state.
 *   - Await `stderrCollected` for diagnostic stderr.
 *   - Check `timedOut()` after exit to distinguish kill-by-timeout from
 *     normal termination.
 *   - Call `cleanup()` after all of the above to remove the temp config dir.
 */
export interface SpawnedClaude {
  stdout: Readable;
  done: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>;
  stderrCollected: Promise<string>;
  timedOut: () => boolean;
  cleanup: () => Promise<void>;
}

/**
 * Spawn `claude` in headless mode with isolated config and a process-group
 * lifecycle. See {@link SpawnedClaude} for how to consume the result.
 *
 * **Kill sequence:** timeout and abort both follow the same two-step path:
 * `SIGTERM` to the process group, then `SIGKILL` after {@link KILL_GRACE_MS}
 * if the group is still alive. This avoids leaving MCP/tool subprocesses
 * running while still giving claude a chance to flush stream-json output.
 *
 * @param config - Adapter options; `timeoutMs`, `signal`, and `isolateConfig`
 *   control lifecycle and config isolation.
 */
export async function spawnClaude(
  config: ClaudeCodeAdapterConfig,
): Promise<SpawnedClaude> {
  const binary = config.binary ?? "claude";
  const args = buildArgs(config);

  const isolateConfig = config.isolateConfig !== false;

  // Isolated runs use a fresh temp dir so plugins/settings don't leak between
  // reps. Non-isolated runs inherit the caller's Claude login and plugins.
  const tempConfigDir = isolateConfig
    ? await mkdtemp(join(tmpdir(), "harness-eval-"))
    : null;

  const env: Record<string, string | undefined> = {
    ...process.env,
    ...config.env,
  };
  if (tempConfigDir) {
    // Override after ...env so callers can't accidentally un-isolate.
    env.CLAUDE_CONFIG_DIR = tempConfigDir;
  }

  const child = spawn(binary, args, {
    cwd: config.cwd ?? process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
    // detached: true means the child becomes the leader of its own process
    // group. We exploit this to kill the entire group (including any MCP
    // server subprocesses and tool processes) on timeout/abort.
    detached: true,
  });


  // `timedOut` is set only by the hard timeout timer, not by abort — callers
  // use it to distinguish "ran too long" from user cancellation or normal exit.
  let timedOut = false;
  let killEscalation: NodeJS.Timeout | null = null;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /**
   * Arm (or re-arm) the SIGKILL fallback. Each SIGTERM attempt gets its own
   * grace window so a slow shutdown doesn't leave orphaned MCP servers.
   */
  const scheduleKillEscalation = () => {
    if (killEscalation) clearTimeout(killEscalation);
    killEscalation = setTimeout(
      () => killTree(child, "SIGKILL"),
      KILL_GRACE_MS,
    );
  };

  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    killTree(child, "SIGTERM");
    scheduleKillEscalation();
  }, timeoutMs);

  // AbortSignal cancellation mirrors timeout kills but does not flip `timedOut`.
  const onAbort = () => {
    killTree(child, "SIGTERM");
    scheduleKillEscalation();
  };
  config.signal?.addEventListener("abort", onAbort, { once: true });


  // Drain stderr eagerly so the OS-level buffer never fills and stalls the
  // child (Node child processes will block on a full pipe).
  const stderrChunks: string[] = [];
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderrChunks.push(chunk);
  });

  const stderrCollected = new Promise<string>((resolve) => {
    const finalize = () => resolve(stderrChunks.join(""));
    child.stderr?.on("end", finalize);
    // Errors during stderr capture shouldn't fail the whole run; we just
    // return what we've buffered so far.
    child.stderr?.on("error", finalize);
  });


  // Resolve once the process exits or fails to spawn. Guard against double
  // settlement because both `close` and `error` can fire in edge cases.
  const done = new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    let settled = false;
    const finalize = (
      exitCode: number | null,
      signal: NodeJS.Signals | null,
    ) => {
      if (settled) return;
      settled = true;
      // Tear down timers/listeners so a late timeout cannot SIGKILL a reused PID.
      clearTimeout(timeoutTimer);
      if (killEscalation) clearTimeout(killEscalation);
      config.signal?.removeEventListener("abort", onAbort);
      resolve({ exitCode, signal });
    };

    child.on("close", (code, signal) => finalize(code, signal));
    // ENOENT and other spawn failures emit `error` — `close` may not follow.
    child.on("error", () => finalize(null, null));
  });


  const cleanup = async () => {
    if (!tempConfigDir) return;
    try {
      await rm(tempConfigDir, { recursive: true, force: true });
    } catch {
      // Best-effort. A leftover temp dir is annoying but not catastrophic;
      // we don't want to fail the run for it.
    }
  };

  // stdout is guaranteed non-null because we passed `stdio: [..., "pipe", ...]`.
  // The `!` is safe; the alternative would be a redundant runtime check that
  // could never fire.
  return {
    stdout: child.stdout!,
    done,
    stderrCollected,
    timedOut: () => timedOut,
    cleanup,
  };
}

/**
 * Kill the child's process group, then fall back to the bare PID if the
 * group is already gone. This catches MCP server subprocesses and tool
 * processes spawned by claude.
 *
 * **Signal escalation:** callers typically invoke this first with `SIGTERM`,
 * then again with `SIGKILL` after {@link KILL_GRACE_MS}. The group kill is
 * essential — a bare `child.kill()` would leave MCP servers running.
 *
 * **Platform edge case:** when the group leader exits first, `kill(-pid)`
 * throws `ESRCH`. The single-PID fallback covers that without failing the
 * adapter run.
 *
 * @param child - Spawned process handle from {@link spawn}.
 * @param signal - POSIX signal to deliver (`SIGTERM` or `SIGKILL` in practice).
 */
function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    // Negative PID targets the entire process group (requires detached spawn).
    process.kill(-child.pid, signal);
  } catch {
    try {
      // Group already reaped — try the leader PID directly.
      child.kill(signal);
    } catch {
      // Process fully gone; nothing to do.
    }
  }
}
