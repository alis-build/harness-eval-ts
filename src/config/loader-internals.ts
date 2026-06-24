/**
 * Shared suite loader helpers (case file collection and parsing).
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import type { TestCase } from "../runner/types";
import { TestCaseSchema, type RawTestCase } from "./schema";
import { ConfigError, transformTestCases } from "./transform";

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

/** Recursively collect `.yaml` / `.yml` files under `casesDir`. */
export async function collectCaseYamlFiles(casesDir: string): Promise<string[]> {
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