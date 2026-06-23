/**
 * Merge grading YAML with CLI overrides for `gradeReport`.
 */

import type { ClaudeCodeOptions } from "../adapters/claude-code/types";
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
  if (adapter !== "claude-code") {
    throw new Error(
      `unsupported grading adapter "${adapter}" (only claude-code today)`,
    );
  }

  const claudeCode = (judge?.claudeCode ?? {}) as ClaudeCodeOptions;
  const binary = cli.binary ?? claudeCode.binary;
  const model = cli.model ?? judge?.model ?? claudeCode.model;

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
    claudeCode: {
      ...claudeCode,
      binary: undefined,
      model: undefined,
    },
    gradingConfigPath: configPath,
  };
}
