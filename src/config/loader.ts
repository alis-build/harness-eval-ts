/**
 * Load a `TestSuite` from a YAML file, directory, or string.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import type { TestCase, TestSuite } from "../runner/types";
import { resolveSuitePaths } from "./paths";
import {
  SuiteDirectorySchema,
  TestCaseSchema,
  TestSuiteSchema,
  type RawTestCase,
} from "./schema";
import {
  ConfigError,
  transformSuite,
  transformSuiteDirectory,
  transformTestCases,
} from "./transform";

export { ConfigError } from "./transform";
export {
  loadGradingConfig,
  parseGradingConfig,
  type GradingConfig,
} from "./grading-loader";

export async function loadSuite(filePath: string): Promise<TestSuite> {
  const absolutePath = resolve(filePath);
  let info;
  try {
    info = await stat(absolutePath);
  } catch (err) {
    throw new ConfigError(
      `failed to read suite path: ${err instanceof Error ? err.message : String(err)}`,
      filePath,
    );
  }

  if (info.isDirectory()) {
    return loadSuiteDirectory(absolutePath);
  }
  return loadSuiteFile(absolutePath);
}

async function loadSuiteFile(absolutePath: string): Promise<TestSuite> {
  let content: string;
  try {
    content = await readFile(absolutePath, "utf8");
  } catch (err) {
    throw new ConfigError(
      `failed to read suite file: ${err instanceof Error ? err.message : String(err)}`,
      absolutePath,
    );
  }

  return parseSuite(content, absolutePath);
}

async function loadSuiteDirectory(dir: string): Promise<TestSuite> {
  const suiteYamlPath = join(dir, "suite.yaml");
  let content: string;
  try {
    content = await readFile(suiteYamlPath, "utf8");
  } catch (err) {
    throw new ConfigError(
      `missing suite.yaml in suite directory: ${err instanceof Error ? err.message : String(err)}`,
      dir,
    );
  }

  const base = parseSuiteDirectory(content, suiteYamlPath);
  const casesDir = join(dir, "cases");
  const caseFiles = await collectCaseYamlFiles(casesDir);

  type TaggedCase = { relPath: string; index: number; testCase: TestCase };
  const tagged: TaggedCase[] = base.cases.map((testCase, index) => ({
    relPath: "suite.yaml",
    index,
    testCase,
  }));

  for (const filePath of caseFiles) {
    const fileContent = await readFile(filePath, "utf8");
    const cases = parseCasesFile(fileContent, filePath);
    const relPath = relative(casesDir, filePath);
    for (const [index, testCase] of cases.entries()) {
      tagged.push({ relPath, index, testCase });
    }
  }

  tagged.sort((a, b) => {
    const pathCmp = a.relPath.localeCompare(b.relPath);
    if (pathCmp !== 0) return pathCmp;
    return a.index - b.index;
  });

  const cases = tagged.map((entry) => entry.testCase);
  if (cases.length === 0) {
    throw new ConfigError("suite directory has no test cases", dir);
  }

  const suite: TestSuite = { ...base, cases };
  resolveSuitePaths(suite, suiteYamlPath);
  return suite;
}

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

function parseSuiteDirectory(
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

/** Parse one case file: single case, array, or `{ cases: [...] }`. */
export function parseCasesFile(
  yamlContent: string,
  sourcePath?: string,
): TestCase[] {
  let raw: unknown;
  try {
    raw = parseYaml(yamlContent);
  } catch (err) {
    throw new ConfigError(
      `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
      sourcePath,
    );
  }

  const rawCases = extractRawCases(raw, sourcePath);
  return transformTestCases(rawCases, sourcePath ?? "cases");
}

function extractRawCases(raw: unknown, sourcePath?: string): RawTestCase[] {
  if (Array.isArray(raw)) {
    return raw.map((item, index) => validateRawCase(item, sourcePath, index));
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.cases)) {
      return obj.cases.map((item, index) =>
        validateRawCase(item, sourcePath, index),
      );
    }
    if ("id" in obj && "prompt" in obj && "assertions" in obj) {
      return [validateRawCase(raw, sourcePath, 0)];
    }
  }

  throw new ConfigError(
    "expected a case object, array of cases, or { cases: [...] }",
    sourcePath,
  );
}

function validateRawCase(
  raw: unknown,
  sourcePath: string | undefined,
  index: number,
): RawTestCase {
  const validated = TestCaseSchema.safeParse(raw);
  if (!validated.success) {
    throw new ConfigError(
      `validation failed:\n${formatZodError(validated.error, sourcePath)}`,
      sourcePath,
    );
  }

  return validated.data;
}

async function collectCaseYamlFiles(casesDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return;
      }
      throw err;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))
      ) {
        files.push(fullPath);
      }
    }
  }

  await walk(casesDir);
  return files.sort();
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
