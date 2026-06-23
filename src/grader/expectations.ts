/**
 * Load expectations sidecar (YAML or JSON).
 */

import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import type { ExpectationsMap } from "./types";

/**
 * Load expectations sidecar (YAML or JSON).
 *
 * File format: `{ "<caseId>": ["expectation 1", ...], ... }`.
 */
export async function loadExpectationsMap(path: string): Promise<ExpectationsMap> {
  const text = await readFile(path, "utf8");
  const trimmed = path.trim().toLowerCase();

  let raw: unknown;
  if (trimmed.endsWith(".json")) {
    raw = JSON.parse(text);
  } else {
    raw = parseYaml(text);
  }

  if (!raw || typeof raw !== "object") {
    throw new Error(`expectations file must be an object mapping case ids to lists`);
  }

  const map: ExpectationsMap = {};
  for (const [caseId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      throw new Error(`expectations for case "${caseId}" must be an array of strings`);
    }
    map[caseId] = value.map(String);
  }
  return map;
}
