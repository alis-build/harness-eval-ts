/**
 * Load a `TestSuite` from a YAML file, directory, or string.
 *
 * For unified suite.yaml with optional `judge:` and `pipeline:` blocks,
 * use {@link loadSuiteDocument}.
 */

import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import type { TestSuite } from "../runner/types";
import { parseCasesFile } from "./loader-internals";
import { resolveSuitePaths } from "./paths";
import { SuiteDirectorySchema, TestSuiteSchema } from "./schema";
import { loadSuiteDocument } from "./suite-document-loader";
import { ConfigError, transformSuite, transformSuiteDirectory } from "./transform";

export { ConfigError } from "./transform";
export {
  loadGradingConfig,
  parseGradingConfig,
  type GradingConfig,
} from "./grading-loader";
export { loadSuiteDocument, type SuiteDocument } from "./suite-document-loader";

/**
 * Load a suite from a file path or directory path (suite portion only).
 *
 * Orchestration blocks (`judge:`, `pipeline:`) are silently stripped — callers
 * that only need the `TestSuite` are not broken by malformed orchestration YAML.
 * Use {@link loadSuiteDocument} when you need validated orchestration metadata.
 */
export async function loadSuite(filePath: string): Promise<TestSuite> {
  const doc = await loadSuiteDocument(filePath, { validateOrchestration: false });
  return doc.suite;
}

/**
 * Parse suite YAML from a string (single-file layout with inline cases).
 *
 * Unknown top-level keys such as `judge` and `pipeline` are stripped.
 */
export function parseSuite(
  yamlContent: string,
  sourcePath?: string,
): TestSuite {
  let raw: unknown;
  try {
    raw = parseYaml(yamlContent);
  } catch (err) {
    throw new ConfigError(
      `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
      sourcePath,
    );
  }

  const validated = TestSuiteSchema.safeParse(raw);
  if (!validated.success) {
    throw new ConfigError(
      `validation failed:\n${formatZodError(validated.error, sourcePath)}`,
      sourcePath,
    );
  }

  const suite = transformSuite(validated.data);
  if (sourcePath) {
    resolveSuitePaths(suite, resolve(sourcePath));
  }
  return suite;
}

/** Parse `suite.yaml` for directory layout (cases may be omitted). @internal */
export function parseSuiteDirectory(
  yamlContent: string,
  sourcePath: string,
): TestSuite {
  let raw: unknown;
  try {
    raw = parseYaml(yamlContent);
  } catch (err) {
    throw new ConfigError(
      `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
      sourcePath,
    );
  }

  const validated = SuiteDirectorySchema.safeParse(raw);
  if (!validated.success) {
    throw new ConfigError(
      `validation failed:\n${formatZodError(validated.error, sourcePath)}`,
      sourcePath,
    );
  }

  return transformSuiteDirectory(validated.data);
}

export { parseCasesFile } from "./loader-internals";

function formatZodError(err: z.ZodError, sourcePath?: string): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      const prefix = sourcePath ? `${sourcePath} → ${path}` : path;
      return `  ${prefix}: ${issue.message}`;
    })
    .join("\n");
}
