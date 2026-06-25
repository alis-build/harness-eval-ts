/**
 * Process management for the Gemini CLI adapter.
 *
 * Spawns `gemini -p … --output-format stream-json`, handles timeout/abort,
 * and optional config-directory isolation.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";

import { buildArgs } from "./flags";
import type { GeminiCliAdapterConfig } from "./types";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Grace period between SIGTERM and SIGKILL on timeout or abort. */
const KILL_GRACE_MS = 5_000;

/** Env var Gemini CLI uses for config directory isolation. */
export const GEMINI_CONFIG_DIR_ENV = "GEMINI_CONFIG_DIR";

/**
 * Handle to a spawned `gemini` process. Read `stdout` via {@link parseGeminiCliJson},
 * await `done` for exit state, `stderrCollected` for diagnostics, then call
 * `cleanup()` to remove temp `GEMINI_CONFIG_DIR` when isolation was enabled.
 */
export interface SpawnedGeminiCli {
  stdout: Readable;
  done: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>;
  stderrCollected: Promise<string>;
  timedOut: () => boolean;
  cleanup: () => Promise<void>;
}

/** Resolve config dir for isolated runs. Exported for unit tests. */
export function resolveGeminiConfigDir(
  config: Pick<GeminiCliAdapterConfig, "isolateConfig">,
  tempDir: string | null,
): string | undefined {
  if (config.isolateConfig !== true || !tempDir) return undefined;
  return tempDir;
}

export interface PreparedGeminiCliEnv {
  env: Record<string, string | undefined>;
  /** Removes temp config dir when {@link prepareGeminiCliEnv} created one. */
  cleanup: () => Promise<void>;
}

/**
 * Build subprocess env with optional `GEMINI_CONFIG_DIR` isolation.
 *
 * Shared by harness spawn ({@link spawnGeminiCli}) and the Gemini CLI judge
 * ({@link runGeminiCliGrader}) so both paths use the same config-dir semantics.
 */
export async function prepareGeminiCliEnv(
  config: Pick<GeminiCliAdapterConfig, "isolateConfig" | "env">,
  baseEnv: Record<string, string | undefined> = process.env,
): Promise<PreparedGeminiCliEnv> {
  const tempConfigDir =
    config.isolateConfig === true
      ? await mkdtemp(join(tmpdir(), "harness-eval-gemini-"))
      : null;

  const env: Record<string, string | undefined> = {
    ...baseEnv,
    ...config.env,
  };

  const configDir = resolveGeminiConfigDir(config, tempConfigDir);
  if (configDir) {
    env[GEMINI_CONFIG_DIR_ENV] = configDir;
  }

  const cleanup = async () => {
    if (!tempConfigDir) return;
    try {
      await rm(tempConfigDir, { recursive: true, force: true });
    } catch {
      // best-effort temp cleanup
    }
  };

  return { env, cleanup };
}

/**
 * Spawn `gemini -p … --output-format stream-json` with optional config-dir isolation.
 *
 * Timeout and abort both send SIGTERM to the process group, then SIGKILL after
 * {@link KILL_GRACE_MS} if the group is still alive.
 */
export async function spawnGeminiCli(
  config: GeminiCliAdapterConfig,
): Promise<SpawnedGeminiCli> {
  const binary = config.binary ?? "gemini";
  const args = buildArgs(config);

  const { env, cleanup: envCleanup } = await prepareGeminiCliEnv(config);

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

  return {
    stdout: child.stdout!,
    done,
    stderrCollected,
    timedOut: () => timedOut,
    cleanup: envCleanup,
  };
}

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
