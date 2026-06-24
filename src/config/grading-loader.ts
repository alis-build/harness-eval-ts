/**
 * Load standalone grading YAML for `harness-eval grade`.
 *
 * Also accepts unified suite.yaml files with an inline `judge:` block.
 */

import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";

import type { SuiteConfig } from "../adapters/types";
import { resolveGradingConfigPaths } from "./paths";
import { GradingConfigSchema } from "./grading-schema";
import {
  SuiteFileDirectorySchema,
  SuiteFileSingleSchema,
} from "./suite-file-schema";
import { ConfigError } from "./transform";

/** Runtime shape of a parsed grading config file. */
export interface GradingConfig {
  judge: SuiteConfig & {
    adapter?: string;
    maxConcurrent?: number;
    system_instruction?: string;
  };
}

/** Load grading YAML from disk and resolve relative paths. */
export async function loadGradingConfig(filePath: string): Promise<GradingConfig> {
  const absolutePath = resolve(filePath);
  let info;
  try {
    info = await stat(absolutePath);
  } catch (err) {
    throw new ConfigError(
      `failed to read grading config: ${err instanceof Error ? err.message : String(err)}`,
      filePath,
    );
  }

  if (info.isDirectory()) {
    return loadGradingFromSuiteYaml(join(absolutePath, "suite.yaml"));
  }

  let content: string;
  try {
    content = await readFile(absolutePath, "utf8");
  } catch (err) {
    throw new ConfigError(
      `failed to read grading config: ${err instanceof Error ? err.message : String(err)}`,
      filePath,
    );
  }

  if (isSuiteRoot(parseYaml(content))) {
    return parseGradingFromSuiteRaw(parseYaml(content), absolutePath);
  }

  return parseGradingConfig(content, absolutePath);
}

/**
 * Parse grading YAML from a string.
 *
 * @param sourcePath Optional path for error messages and path resolution.
 */
export function parseGradingConfig(
  yamlContent: string,
  sourcePath?: string,
): GradingConfig {
  let raw: unknown;
  try {
    raw = parseYaml(yamlContent);
  } catch (err) {
    throw new ConfigError(
      `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
      sourcePath,
    );
  }

  if (isSuiteRoot(raw)) {
    return parseGradingFromSuiteRaw(raw, sourcePath ?? "suite.yaml");
  }

  const validated = GradingConfigSchema.safeParse(raw);
  if (!validated.success) {
    throw new ConfigError(
      `validation failed:\n${formatZodError(validated.error, sourcePath)}`,
      sourcePath,
    );
  }

  const config: GradingConfig = {
    judge: { ...validated.data.judge },
  };

  if (sourcePath) {
    resolveGradingConfigPaths(config, sourcePath);
  }

  return config;
}

/** Detect unified suite.yaml by presence of suite-specific keys (vs standalone grading YAML). */
function isSuiteRoot(raw: unknown): boolean {
  if (raw === null || typeof raw !== "object") return false;
  return "cases" in raw || ("matrix" in raw && "adapter" in raw);
}

async function loadGradingFromSuiteYaml(suiteYamlPath: string): Promise<GradingConfig> {
  let content: string;
  try {
    content = await readFile(suiteYamlPath, "utf8");
  } catch (err) {
    throw new ConfigError(
      `failed to read suite file: ${err instanceof Error ? err.message : String(err)}`,
      suiteYamlPath,
    );
  }

  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    throw new ConfigError(
      `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
      suiteYamlPath,
    );
  }

  return parseGradingFromSuiteRaw(raw, suiteYamlPath);
}

function parseGradingFromSuiteRaw(
  raw: unknown,
  sourcePath: string,
): GradingConfig {
  const single = SuiteFileSingleSchema.safeParse(raw);
  if (single.success) {
    if (!single.data.judge) {
      throw new ConfigError("suite file has no judge block", sourcePath);
    }
    const config: GradingConfig = { judge: { ...single.data.judge } };
    resolveGradingConfigPaths(config, sourcePath);
    return config;
  }

  const directory = SuiteFileDirectorySchema.safeParse(raw);
  if (directory.success) {
    if (!directory.data.judge) {
      throw new ConfigError("suite file has no judge block", sourcePath);
    }
    const config: GradingConfig = { judge: { ...directory.data.judge } };
    resolveGradingConfigPaths(config, sourcePath);
    return config;
  }

  const err = directory.error ?? single.error;
  throw new ConfigError(
    `validation failed:\n${formatZodError(err, sourcePath)}`,
    sourcePath,
  );
}

/** Format a zod validation error with optional source file prefix. */
function formatZodError(err: z.ZodError, sourcePath?: string): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      const prefix = sourcePath ? `${sourcePath} → ${path}` : path;
      return `  ${prefix}: ${issue.message}`;
    })
    .join("\n");
}
