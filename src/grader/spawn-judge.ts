/**
 * Shared subprocess utilities for judge graders (Claude, Codex, Gemini CLI).
 *
 * Owns detached spawn, process-group teardown, and SIGTERM → SIGKILL
 * escalation so all graders share one implementation.
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

    const finalize = (err?: Error, output?: string) => {
      clearTimeout(timer);
      if (killEscalation) clearTimeout(killEscalation);
      if (err) reject(err);
      else resolve(output ?? chunks.join(""));
    };

    child.on("error", (err) => finalize(err));
    child.on("close", (code) => {
      const stdout = chunks.join("");
      const stderr = stderrChunks.join("");
      if (stdout.length > 0) {
        finalize(undefined, stdout);
        return;
      }

      // Gemini CLI may emit --output-format json on stderr when stdout is empty
      // (e.g. warnings prefix the payload). Recover trailing `{…}` before failing.
      const stderrJson = extractJsonPayload(stderr);
      if (stderrJson) {
        finalize(undefined, stderrJson);
        return;
      }

      if (code !== 0) {
        finalize(
          new Error(
            `grader exited ${code}: ${stderr.slice(0, 500)}`,
          ),
        );
        return;
      }

      finalize(undefined, stdout);
    });
  });
}

/**
 * Return trailing JSON object from mixed stderr output.
 *
 * Gemini CLI judge runs sometimes print warnings before the JSON envelope;
 * scan from the first `{` and validate with `JSON.parse`.
 */
function extractJsonPayload(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const jsonStart = trimmed.indexOf("{");
  if (jsonStart < 0) return null;

  const candidate = trimmed.slice(jsonStart);
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
}
