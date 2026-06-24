/**
 * Resolve relative paths in suite config against the suite file directory.
 *
 * YAML authors write paths relative to the suite file; this module absolutizes
 * them at load time so the runner and adapters receive filesystem-ready values.
 * Tilde-prefixed paths and inline JSON blobs (settings starting with `{`) are
 * left unchanged.
 */

import { isAbsolute, join } from "node:path";

import type { SuiteConfig } from "../adapters/types";
import type {
  PipelineConfig,
  PipelineEnvelopeStep,
  PipelineGradeStep,
  PipelineRunStep,
} from "./pipeline-schema";
import { DEFAULT_PIPELINE_OUTPUTS } from "./pipeline-schema";

/** Resolve a single path relative to `suiteDir` unless already absolute or `~/`. */
function resolvePath(value: string, suiteDir: string): string {
  if (isAbsolute(value) || value.startsWith("~/")) {
    return value;
  }
  return join(suiteDir, value);
}

/** Resolve Claude Code-specific path fields within a config block. */
function resolveClaudeCodePaths(
  block: Record<string, unknown>,
  suiteDir: string,
): Record<string, unknown> {
  const resolved = { ...block };
  if (typeof resolved.mcpConfig === "string") {
    resolved.mcpConfig = resolvePath(resolved.mcpConfig, suiteDir);
  }
  if (Array.isArray(resolved.pluginDirs)) {
    resolved.pluginDirs = resolved.pluginDirs.map((p) =>
      typeof p === "string" ? resolvePath(p, suiteDir) : p,
    );
  }
  if (Array.isArray(resolved.addDirs)) {
    resolved.addDirs = resolved.addDirs.map((p) =>
      typeof p === "string" ? resolvePath(p, suiteDir) : p,
    );
  }
  const filePathFields = [
    "systemPromptFile",
    "appendSystemPromptFile",
    "debugFile",
  ] as const;
  for (const field of filePathFields) {
    const value = resolved[field];
    // Inline JSON settings blobs start with `{` and are not filesystem paths.
    if (typeof value === "string" && !value.trim().startsWith("{")) {
      resolved[field] = resolvePath(value, suiteDir);
    }
  }
  if (typeof resolved.settings === "string" && !resolved.settings.trim().startsWith("{")) {
    resolved.settings = resolvePath(resolved.settings, suiteDir);
  }
  return resolved;
}

/** Resolve Codex-specific path fields within a config block. */
function resolveCodexPaths(
  block: Record<string, unknown>,
  suiteDir: string,
): Record<string, unknown> {
  const resolved = { ...block };
  if (Array.isArray(resolved.addDirs)) {
    resolved.addDirs = resolved.addDirs.map((p) =>
      typeof p === "string" ? resolvePath(p, suiteDir) : p,
    );
  }
  for (const field of ["outputSchema", "outputLastMessage"] as const) {
    const value = resolved[field];
    if (typeof value === "string") {
      resolved[field] = resolvePath(value, suiteDir);
    }
  }
  return resolved;
}

/** Resolve relative paths in a config layer relative to `suiteDir`. */
export function resolveConfigPaths(
  config: SuiteConfig | undefined,
  suiteDir: string,
): SuiteConfig | undefined {
  if (!config) return undefined;

  const resolved: SuiteConfig = { ...config };
  if (typeof resolved.cwd === "string") {
    resolved.cwd = resolvePath(resolved.cwd, suiteDir);
  }
  if (
    resolved.claudeCode &&
    typeof resolved.claudeCode === "object" &&
    !Array.isArray(resolved.claudeCode)
  ) {
    resolved.claudeCode = resolveClaudeCodePaths(
      resolved.claudeCode as Record<string, unknown>,
      suiteDir,
    );
  }
  if (
    resolved.codex &&
    typeof resolved.codex === "object" &&
    !Array.isArray(resolved.codex)
  ) {
    resolved.codex = resolveCodexPaths(
      resolved.codex as Record<string, unknown>,
      suiteDir,
    );
  }
  return resolved;
}

/** Resolve paths on an entire suite after load. */
export function resolveSuitePaths(
  suite: {
    defaultConfig?: SuiteConfig;
    matrix: Array<{ config: SuiteConfig }>;
    cases: Array<{ config?: SuiteConfig }>;
  },
  suiteFilePath: string,
): void {
  const suiteDir = configFileDir(suiteFilePath);

  suite.defaultConfig = resolveConfigPaths(suite.defaultConfig, suiteDir);
  for (const cell of suite.matrix) {
    cell.config = resolveConfigPaths(cell.config, suiteDir) ?? cell.config;
  }
  for (const testCase of suite.cases) {
    testCase.config = resolveConfigPaths(testCase.config, suiteDir);
  }
}

/** Parent directory of a suite or grading config file path. */
function configFileDir(filePath: string): string {
  return filePath.includes("/") || filePath.includes("\\")
    ? filePath.replace(/[/\\][^/\\]+$/, "")
    : ".";
}

/**
 * Heuristically resolve env var values that look like relative file paths.
 *
 * Used for grading config where credential or config paths may be expressed
 * relative to the grading YAML location.
 */
function resolveEnvPaths(
  env: Record<string, string>,
  baseDir: string,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value.startsWith("./") || value.startsWith("../")) {
      resolved[key] = resolvePath(value, baseDir);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/** Resolve relative paths in a standalone grading config file. */
export function resolveGradingConfigPaths(
  config: { judge: SuiteConfig & { maxConcurrent?: number; adapter?: string } },
  configFilePath: string,
): void {
  const baseDir = configFileDir(configFilePath);
  const { adapter, maxConcurrent, ...rest } = config.judge;
  const resolved = resolveConfigPaths(rest, baseDir) ?? rest;
  config.judge = {
    ...resolved,
    adapter,
    maxConcurrent,
  };
  if (config.judge.env) {
    config.judge.env = resolveEnvPaths(config.judge.env, baseDir);
  }
}

/** Resolve a pipeline artifact path relative to the suite.yaml directory. */
export function resolvePipelinePath(
  value: string | undefined,
  defaultRelative: string,
  suiteDir: string,
): string {
  const rel = value ?? defaultRelative;
  return resolvePath(rel, suiteDir);
}

/** Resolve relative paths in a parsed pipeline config. */
export function resolvePipelineConfigPaths(
  pipeline: PipelineConfig,
  suiteFilePath: string,
): PipelineConfig {
  const suiteDir = configFileDir(suiteFilePath);
  const resolved: PipelineConfig = {};

  if (pipeline.run) {
    resolved.run = resolvePipelineRunStep(pipeline.run, suiteDir);
  }
  if (pipeline.grade) {
    resolved.grade = resolvePipelineGradeStep(pipeline.grade, suiteDir);
  }
  if (pipeline.envelope) {
    resolved.envelope = resolvePipelineEnvelopeStep(pipeline.envelope, suiteDir);
  }

  return resolved;
}

/** Resolve one pipeline step's run output path. */
function resolvePipelineRunStep(
  step: PipelineRunStep,
  suiteDir: string,
): PipelineRunStep {
  return {
    ...step,
    output: resolvePipelinePath(step.output, DEFAULT_PIPELINE_OUTPUTS.run, suiteDir),
  };
}

/** Resolve grade step input (optional) and output paths. */
function resolvePipelineGradeStep(
  step: PipelineGradeStep,
  suiteDir: string,
): PipelineGradeStep {
  return {
    ...step,
    input: step.input
      ? resolvePipelinePath(step.input, DEFAULT_PIPELINE_OUTPUTS.run, suiteDir)
      : undefined,
    output: resolvePipelinePath(
      step.output,
      DEFAULT_PIPELINE_OUTPUTS.grade,
      suiteDir,
    ),
  };
}

/** Resolve envelope step report, grading, and output paths. */
function resolvePipelineEnvelopeStep(
  step: PipelineEnvelopeStep,
  suiteDir: string,
): PipelineEnvelopeStep {
  return {
    ...step,
    report: step.report
      ? resolvePipelinePath(step.report, DEFAULT_PIPELINE_OUTPUTS.run, suiteDir)
      : undefined,
    grading: step.grading
      ? resolvePipelinePath(
          step.grading,
          DEFAULT_PIPELINE_OUTPUTS.grade,
          suiteDir,
        )
      : undefined,
    output: resolvePipelinePath(
      step.output,
      DEFAULT_PIPELINE_OUTPUTS.envelope,
      suiteDir,
    ),
  };
}
