/**
 * Process management for the Codex CLI adapter.
 *
 * Owns spawning, timeout, abort handling, and process-group teardown for
 * `codex exec --json`. The orchestrator (`index.ts`) reads stdout and awaits
 * completion; this module handles isolation via `$CODEX_HOME` and the
 * SIGTERM → SIGKILL escalation path.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";

import { buildArgs, ensureHarnessOutputLastMessage } from "./flags";
import type { CodexAdapterConfig } from "./types";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Grace period between SIGTERM and SIGKILL on timeout or abort. */
const KILL_GRACE_MS = 5_000;

/**
 * Handle to a spawned `codex` process. Read `stdout` via {@link parseCodexJson},
 * await `done` for exit state, `stderrCollected` for diagnostics, then call
 * `cleanup()` to remove temp `$CODEX_HOME` and auto-generated last-message files.
 */
export interface SpawnedCodex {
  stdout: Readable;
  done: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>;
  stderrCollected: Promise<string>;
  timedOut: () => boolean;
  cleanup: () => Promise<void>;
}

/** Resolve `$CODEX_HOME` for isolated runs. Exported for unit tests. */
export function resolveCodexHome(
  config: Pick<CodexAdapterConfig, "isolateConfig">,
  tempDir: string | null,
): string | undefined {
  if (config.isolateConfig !== true || !tempDir) return undefined;
  return tempDir;
}

/**
 * Spawn `codex exec --json` with optional `$CODEX_HOME` isolation.
 *
 * Timeout and abort both send SIGTERM to the process group, then SIGKILL after
 * {@link KILL_GRACE_MS} if the group is still alive.
 */
export async function spawnCodex(
  config: CodexAdapterConfig,
): Promise<SpawnedCodex> {
  const binary = config.binary ?? "codex";
  const autoLastMessagePath = ensureHarnessOutputLastMessage(config);
  const args = buildArgs(config);

  // Isolated runs use a fresh temp dir so auth and config do not leak between reps.
  const tempConfigDir =
    config.isolateConfig === true
      ? await mkdtemp(join(tmpdir(), "harness-eval-codex-"))
      : null;

  const env: Record<string, string | undefined> = {
    ...process.env,
    ...config.env,
  };

  const codexHome = resolveCodexHome(config, tempConfigDir);
  if (codexHome) {
    env.CODEX_HOME = codexHome;
  }

  const child = spawn(binary, args, {
    cwd: config.cwd ?? process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  let timedOut = false;
  let killEscalation: NodeJS.Timeout | null = null;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

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

  const onAbort = () => {
    killTree(child, "SIGTERM");
    scheduleKillEscalation();
  };
  config.signal?.addEventListener("abort", onAbort, { once: true });

  const stderrChunks: string[] = [];
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderrChunks.push(chunk);
  });

  const stderrCollected = new Promise<string>((resolve) => {
    const finalize = () => resolve(stderrChunks.join(""));
    child.stderr?.on("end", finalize);
    child.stderr?.on("error", finalize);
  });

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
      clearTimeout(timeoutTimer);
      if (killEscalation) clearTimeout(killEscalation);
      config.signal?.removeEventListener("abort", onAbort);
      resolve({ exitCode, signal });
    };

    child.on("close", (code, signal) => finalize(code, signal));
    child.on("error", () => finalize(null, null));
  });

  const cleanup = async () => {
    if (autoLastMessagePath) {
      try {
        await rm(autoLastMessagePath, { force: true });
      } catch {
        // best-effort temp cleanup
      }
    }
    if (!tempConfigDir) return;
    try {
      await rm(tempConfigDir, { recursive: true, force: true });
    } catch {
      // best-effort temp cleanup
    }
  };

  return {
    stdout: child.stdout!,
    done,
    stderrCollected,
    timedOut: () => timedOut,
    cleanup,
  };
}

/** Kill the detached process group (fallback to single process if group kill fails). */
function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // process gone
    }
  }
}
