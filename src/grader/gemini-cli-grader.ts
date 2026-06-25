/**
 * Grade expectations by spawning Gemini CLI as judge.
 */

import { buildJudgeArgs } from "../adapters/gemini-cli/flags";
import { prepareGeminiCliEnv } from "../adapters/gemini-cli/process";
import type { GeminiCliOptions } from "../adapters/gemini-cli/types";
import { buildGraderPrompt } from "./prompt";
import { extractGeminiCliResponseText, parseGraderJson } from "./parse";
import { spawnCollectStdout } from "./spawn-judge";
import type { GraderFn, GraderInput, GraderOutput } from "./types";

const DEFAULT_TIMEOUT_MS = 300_000;

/** Judge subprocess defaults — single-shot grading without interactive approval. */
export const JUDGE_GEMINI_CLI_DEFAULTS: GeminiCliOptions = {
  approvalMode: "yolo",
  /** Avoid loading user MCP servers, skills, and extensions for lightweight grading. */
  isolateConfig: true,
};

/** Merge user-supplied Gemini CLI options over judge-safe defaults. */
export function mergeJudgeGeminiCliOptions(
  geminiCli?: GeminiCliOptions,
): GeminiCliOptions {
  return { ...JUDGE_GEMINI_CLI_DEFAULTS, ...geminiCli };
}

/** Options for {@link createGeminiCliGrader} / {@link runGeminiCliGrader}. */
export interface GeminiCliGraderOptions {
  binary?: string;
  model?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  cwd?: string;
  geminiCli?: GeminiCliOptions;
}

/** Factory returning a {@link GraderFn} bound to subprocess options. */
export function createGeminiCliGrader(
  options: GeminiCliGraderOptions = {},
): GraderFn {
  return (input) => runGeminiCliGrader(input, options);
}

/**
 * Spawn Gemini CLI as judge, parse JSON response, align with input expectations.
 *
 * Uses {@link prepareGeminiCliEnv} for config isolation and {@link spawnCollectStdout}
 * which may recover JSON from stderr when stdout is empty. Unparseable output fails
 * all expectations and sets {@link GraderOutput.error}.
 */
export async function runGeminiCliGrader(
  input: GraderInput,
  options: GeminiCliGraderOptions = {},
): Promise<GraderOutput> {
  const binary = options.binary ?? options.geminiCli?.binary ?? "gemini";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const prompt = buildGraderPrompt(input);
  const model = options.model ?? options.geminiCli?.model;

  const geminiCli = mergeJudgeGeminiCliOptions(options.geminiCli);
  const args = buildJudgeArgs(prompt, {
    ...geminiCli,
    model,
  });

  const { env, cleanup } = await prepareGeminiCliEnv(
    { isolateConfig: geminiCli.isolateConfig, env: options.env },
  );

  let stdout: string;
  try {
    stdout = await spawnCollectStdout({
      binary,
      args,
      timeoutMs,
      env,
      cwd: options.cwd,
    });
  } finally {
    await cleanup();
  }

  const responseText = extractGeminiCliResponseText(stdout);
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
