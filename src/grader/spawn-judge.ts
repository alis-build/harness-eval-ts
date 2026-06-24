/**
 * Shared subprocess utilities for judge graders (Claude + Codex).
 *
 * Owns detached spawn, process-group teardown, and SIGTERM → SIGKILL
 * escalation so both graders share one implementation.
 */

import { spawn, type ChildProcess } from "node:child_process";

const KILL_GRACE_MS = 5_000;

/** Kill the detached process group (fallback to single process if group kill fails). */
export function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // process already gone
    }
  }
}

export interface SpawnJudgeOptions {
  binary: string;
  args: string[];
  timeoutMs: number;
  env?: Record<string, string | undefined>;
  cwd?: string;
}

/**
 * Spawn a judge subprocess with process-group teardown and collect stdout.
 *
 * Non-zero exit with empty stdout is treated as failure; partial stdout on
 * non-zero exit is retained (judges sometimes exit non-zero after emitting JSON).
 */
export function spawnCollectStdout(options: SpawnJudgeOptions): Promise<string> {
  const { binary, args, timeoutMs, env, cwd } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env: env ?? process.env,
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const chunks: string[] = [];
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (c: string) => chunks.push(c));

    const stderrChunks: string[] = [];
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (c: string) => stderrChunks.push(c));

    let killEscalation: NodeJS.Timeout | null = null;

    const timer = setTimeout(() => {
      killTree(child, "SIGTERM");
      killEscalation = setTimeout(() => killTree(child, "SIGKILL"), KILL_GRACE_MS);
      const stderrHint = stderrChunks.join("").trim().slice(0, 400);
      reject(
        new Error(
          `grader timed out after ${timeoutMs}ms` +
            (stderrHint ? ` (stderr: ${stderrHint})` : ""),
        ),
      );
    }, timeoutMs);

    const finalize = (err?: Error) => {
      clearTimeout(timer);
      if (killEscalation) clearTimeout(killEscalation);
      if (err) reject(err);
      else resolve(chunks.join(""));
    };

    child.on("error", (err) => finalize(err));
    child.on("close", (code) => {
      if (code !== 0 && chunks.length === 0) {
        finalize(
          new Error(
            `grader exited ${code}: ${stderrChunks.join("").slice(0, 500)}`,
          ),
        );
      } else {
        finalize();
      }
    });
  });
}
