/**
 * Resolve relative paths in suite config against the suite file directory.
 */

import { isAbsolute, join } from "node:path";

import type { SuiteConfig } from "../adapters/types";

function resolvePath(value: string, suiteDir: string): string {
  if (isAbsolute(value) || value.startsWith("~/")) {
    return value;
  }
  return join(suiteDir, value);
}

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
    if (typeof value === "string" && !value.trim().startsWith("{")) {
      resolved[field] = resolvePath(value, suiteDir);
    }
  }
  if (typeof resolved.settings === "string" && !resolved.settings.trim().startsWith("{")) {
    resolved.settings = resolvePath(resolved.settings, suiteDir);
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

function configFileDir(filePath: string): string {
  return filePath.includes("/") || filePath.includes("\\")
    ? filePath.replace(/[/\\][^/\\]+$/, "")
    : ".";
}

function resolveEnvPaths(
  env: Record<string, string>,
  baseDir: string,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (
      value.startsWith("./") ||
      value.startsWith("../") ||
      (value.includes("/") && !value.startsWith("http"))
    ) {
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
