/**
 * Grade expectations by spawning Claude as judge (skill-creator grader pattern).
 */

import { spawn } from "node:child_process";

import { buildJudgeArgs } from "../adapters/claude-code/flags";
import type { ClaudeCodeOptions } from "../adapters/claude-code/types";
import { buildGraderPrompt } from "./prompt";
import { extractClaudeResponseText, parseGraderJson } from "./parse";
import type { GraderFn, GraderInput, GraderOutput } from "./types";

const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Judge subprocess defaults — grading is a single-shot JSON response, not an agent session.
 * Without these, Claude Code may load plugins/MCP and loop on tools until timeout.
 */
export const JUDGE_CLAUDE_DEFAULTS: ClaudeCodeOptions = {
  maxTurns: 1,
  bare: true,
  disableSlashCommands: true,
  noSessionPersistence: true,
};

/** Merge user-supplied Claude Code options over judge-safe defaults. */
export function mergeJudgeClaudeOptions(
  claudeCode?: ClaudeCodeOptions,
): ClaudeCodeOptions {
  return { ...JUDGE_CLAUDE_DEFAULTS, ...claudeCode };
}

/** Options for {@link createClaudeGrader} / {@link runClaudeGrader}. */
export interface ClaudeGraderOptions {
  binary?: string;
  model?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  cwd?: string;
  claudeCode?: ClaudeCodeOptions;
}

/** Factory returning a {@link GraderFn} bound to subprocess options. */
export function createClaudeGrader(
  options: ClaudeGraderOptions = {},
): GraderFn {
  return (input) => runClaudeGrader(input, options);
}

/**
 * Spawn Claude as judge, parse JSON response, align with input expectations.
 *
 * Unparseable output fails all expectations and sets {@link GraderOutput.error}.
 */
export async function runClaudeGrader(
  input: GraderInput,
  options: ClaudeGraderOptions = {},
): Promise<GraderOutput> {
  const binary = options.binary ?? options.claudeCode?.binary ?? "claude";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const prompt = buildGraderPrompt(input);
  const model = options.model ?? options.claudeCode?.model;

  const args = buildJudgeArgs(prompt, {
    ...mergeJudgeClaudeOptions(options.claudeCode),
    model,
  });

  const stdout = await spawnCollectStdout(
    binary,
    args,
    timeoutMs,
    options.env,
    options.cwd,
  );
  const responseText = extractClaudeResponseText(stdout);
  const parsed = parseGraderJson(responseText);

  if (!parsed) {
    return {
      expectations: input.expectations.map((text) => ({
        text,
        passed: false,
        evidence: "Grader returned unparseable output",
      })),
      summary: {
        passed: 0,
        failed: input.expectations.length,
        total: input.expectations.length,
        passRate: 0,
      },
      error: `failed to parse grader JSON from response: ${responseText.slice(0, 200)}`,
    };
  }

  // Align expectation text with input order when grader omits text field
  const expectations = input.expectations.map((text, i) => {
    const graded = parsed.expectations[i];
    return {
      text,
      passed: graded?.passed ?? false,
      evidence: graded?.evidence ?? "No evidence returned",
    };
  });

  const passed = expectations.filter((e) => e.passed).length;
  const total = expectations.length;

  return {
    expectations,
    summary: {
      passed,
      failed: total - passed,
      total,
      passRate: total === 0 ? 0 : passed / total,
    },
    evalFeedback: parsed.evalFeedback,
  };
}

/**
 * Spawn a child process and collect stdout until exit or timeout.
 *
 * Non-zero exit with empty stdout is treated as failure; partial stdout on
 * non-zero exit is retained (Claude sometimes exits non-zero after emitting JSON).
 */
function spawnCollectStdout(
  binary: string,
  args: string[],
  timeoutMs: number,
  extraEnv?: Record<string, string>,
  cwd?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env: buildChildEnv(extraEnv),
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: string[] = [];
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (c: string) => chunks.push(c));

    const stderrChunks: string[] = [];
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (c: string) => stderrChunks.push(c));

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
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

/**
 * Build subprocess env, stripping CLAUDECODE to avoid nested-session guards.
 */
function buildChildEnv(extraEnv?: Record<string, string>): Record<string, string | undefined> {
  const env = { ...process.env, ...extraEnv };
  delete env.CLAUDECODE;
  return env;
}
