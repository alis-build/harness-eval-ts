/**
 * Merge grading YAML with CLI overrides for `gradeReport`.
 */

import type { ClaudeCodeOptions } from "../adapters/claude-code/types";
import type { CodexOptions } from "../adapters/codex/types";
import type { GeminiCliOptions } from "../adapters/gemini-cli/types";
import type { GradingConfig } from "../config/grading-loader";
import type { GradeReportOptions } from "./types";

/** CLI flag overrides for grading (take precedence over grading YAML). */
export interface GradeCliOverrides {
  model?: string;
  binary?: string;
  timeoutMs?: number;
  maxConcurrent?: number;
  expectationsPath?: string;
  sourceReport?: string;
}

/**
 * Merge standalone grading YAML with CLI flags (CLI wins).
 */
export function resolveGradeOptions(
  fileConfig?: GradingConfig,
  cli: GradeCliOverrides = {},
  configPath?: string,
): GradeReportOptions {
  const judge = fileConfig?.judge;

  const adapter = judge?.adapter ?? "claude-code";

  const claudeCode = (judge?.claudeCode ?? {}) as ClaudeCodeOptions;
  const codex = (judge?.codex ?? {}) as CodexOptions;
  const geminiCli = (judge?.geminiCli ?? {}) as GeminiCliOptions;
  const adapterBlock =
    adapter === "codex"
      ? codex
      : adapter === "gemini-cli"
        ? geminiCli
        : claudeCode;
  const binary = cli.binary ?? adapterBlock.binary;
  const model = cli.model ?? judge?.model ?? adapterBlock.model;

  if (adapter === "codex") {
    // Strip binary/model from nested codex block — they are promoted to top-level options.
    return {
      sourceReport: cli.sourceReport,
      expectationsPath: cli.expectationsPath,
      model,
      binary,
      timeoutMs: cli.timeoutMs ?? judge?.timeoutMs,
      maxConcurrent: cli.maxConcurrent ?? judge?.maxConcurrent,
      systemInstruction: judge?.system_instruction,
      env: judge?.env,
      cwd: judge?.cwd,
      judgeAdapter: "codex",
      codex: {
        ...codex,
        binary: undefined,
        model: undefined,
      },
      gradingConfigPath: configPath,
    };
  }

  if (adapter === "gemini-cli") {
    // Strip binary/model from nested geminiCli block — promoted to top-level options.
    return {
      sourceReport: cli.sourceReport,
      expectationsPath: cli.expectationsPath,
      model,
      binary,
      timeoutMs: cli.timeoutMs ?? judge?.timeoutMs,
      maxConcurrent: cli.maxConcurrent ?? judge?.maxConcurrent,
      systemInstruction: judge?.system_instruction,
      env: judge?.env,
      cwd: judge?.cwd,
      judgeAdapter: "gemini-cli",
      geminiCli: {
        ...geminiCli,
        binary: undefined,
        model: undefined,
      },
      gradingConfigPath: configPath,
    };
  }

  if (adapter !== "claude-code") {
    throw new Error(
      `unsupported grading adapter "${adapter}" (supported: claude-code, codex, gemini-cli)`,
    );
  }

  return {
    sourceReport: cli.sourceReport,
    expectationsPath: cli.expectationsPath,
    model,
    binary,
    timeoutMs: cli.timeoutMs ?? judge?.timeoutMs,
    maxConcurrent: cli.maxConcurrent ?? judge?.maxConcurrent,
    systemInstruction: judge?.system_instruction,
    env: judge?.env,
    cwd: judge?.cwd,
    judgeAdapter: "claude-code" as const,
    claudeCode: {
      ...claudeCode,
      binary: undefined,
      model: undefined,
    },
    gradingConfigPath: configPath,
  };
}
