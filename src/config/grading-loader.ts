/**
 * Load standalone grading YAML for `harness-eval grade`.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";

import type { SuiteConfig } from "../adapters/types";
import { resolveGradingConfigPaths } from "./paths";
import { GradingConfigSchema, type RawGradingConfig } from "./grading-schema";
import { ConfigError } from "./transform";

export interface GradingConfig {
  judge: SuiteConfig & {
    adapter?: string;
    maxConcurrent?: number;
    system_instruction?: string;
  };
}

export async function loadGradingConfig(filePath: string): Promise<GradingConfig> {
  const absolutePath = resolve(filePath);
  let content: string;
  try {
    content = await readFile(absolutePath, "utf8");
  } catch (err) {
    throw new ConfigError(
      `failed to read grading config: ${err instanceof Error ? err.message : String(err)}`,
      filePath,
    );
  }
  return parseGradingConfig(content, absolutePath);
}

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

function formatZodError(err: z.ZodError, sourcePath?: string): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      const prefix = sourcePath ? `${sourcePath} → ${path}` : path;
      return `  ${prefix}: ${issue.message}`;
    })
    .join("\n");
}
