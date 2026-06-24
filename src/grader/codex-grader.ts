/**
 * Grade expectations by spawning Codex as judge.
 */

import { buildJudgeArgs } from "../adapters/codex/flags";
import type { CodexOptions } from "../adapters/codex/types";
import { buildGraderPrompt } from "./prompt";
import { extractCodexResponseText, parseGraderJson } from "./parse";
import { spawnCollectStdout } from "./spawn-judge";
import type { GraderFn, GraderInput, GraderOutput } from "./types";

const DEFAULT_TIMEOUT_MS = 300_000;

/** Judge subprocess defaults — single-shot grading without persistent sessions. */
export const JUDGE_CODEX_DEFAULTS: CodexOptions = {
  ephemeral: true,
  ignoreUserConfig: true,
  skipGitRepoCheck: true,
};

/** Merge user-supplied Codex options over judge-safe defaults. */
export function mergeJudgeCodexOptions(
  codex?: CodexOptions,
): CodexOptions {
  return { ...JUDGE_CODEX_DEFAULTS, ...codex };
}

/** Options for {@link createCodexGrader} / {@link runCodexGrader}. */
export interface CodexGraderOptions {
  binary?: string;
  model?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  cwd?: string;
  codex?: CodexOptions;
}

/** Factory returning a {@link GraderFn} bound to subprocess options. */
export function createCodexGrader(
  options: CodexGraderOptions = {},
): GraderFn {
  return (input) => runCodexGrader(input, options);
}

/**
 * Spawn Codex as judge, parse JSON response, align with input expectations.
 *
 * Unparseable output fails all expectations and sets {@link GraderOutput.error}.
 */
export async function runCodexGrader(
  input: GraderInput,
  options: CodexGraderOptions = {},
): Promise<GraderOutput> {
  const binary = options.binary ?? options.codex?.binary ?? "codex";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const prompt = buildGraderPrompt(input);
  const model = options.model ?? options.codex?.model;

  const args = buildJudgeArgs(prompt, {
    ...mergeJudgeCodexOptions(options.codex),
    model,
    cwd: options.cwd,
  });

  const stdout = await spawnCollectStdout({
    binary,
    args,
    timeoutMs,
    env: { ...process.env, ...options.env },
    cwd: options.cwd,
  });
  const responseText = extractCodexResponseText(stdout);
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

