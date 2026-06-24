/**
 * Grade expectations by spawning Claude as judge (skill-creator grader pattern).
 */

import { buildJudgeArgs } from "../adapters/claude-code/flags";
import type { ClaudeCodeOptions } from "../adapters/claude-code/types";
import { buildGraderPrompt } from "./prompt";
import { extractClaudeResponseText, parseGraderJson } from "./parse";
import { spawnCollectStdout } from "./spawn-judge";
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

  const stdout = await spawnCollectStdout({
    binary,
    args,
    timeoutMs,
    env: buildChildEnv(options.env),
    cwd: options.cwd,
  });
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
 * Build subprocess env, stripping CLAUDECODE to avoid nested-session guards.
 */
function buildChildEnv(extraEnv?: Record<string, string>): Record<string, string | undefined> {
  const env = { ...process.env, ...extraEnv };
  delete env.CLAUDECODE;
  return env;
}
