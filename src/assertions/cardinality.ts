/**
 * Cardinality spec parser.
 *
 * A cardinality spec is a string like `">= 1"`, `"== 2"`, `"< 5"`. It
 * describes how many tool calls are acceptable. When omitted, the default
 * is `">= 1"` (at least one call).
 *
 * Why strings? They're idiomatic in YAML and read naturally in test cases:
 *
 *   called: { tool: mcp__api__load_skill, times: ">= 1" }
 *
 * The alternative — `{ op: "gte", n: 1 }` — is more typed but uglier and
 * forces YAML authors to learn an internal vocabulary.
 */

import type { Cardinality } from "../types/assertions";

/** A compiled cardinality check: takes an observed count, returns pass/fail. */
export type CardinalityCheck = (count: number) => boolean;

const CARDINALITY_PATTERN = /^\s*(==|!=|>=|<=|>|<)\s*(\d+)\s*$/;

/**
 * Parse a cardinality spec into a check function. Throws on malformed input
 * — at config-load time we want to fail loudly rather than silently match
 * nothing.
 */
export function parseCardinality(
  spec: Cardinality | undefined,
): CardinalityCheck {
  if (spec === undefined) return (count) => count >= 1;

  const match = CARDINALITY_PATTERN.exec(spec);
  if (!match) {
    throw new Error(
      `invalid cardinality spec: ${JSON.stringify(spec)}. ` +
        `Expected format: "<op> <n>" where op is one of == != >= <= > <`,
    );
  }

  const op = match[1];
  const n = parseInt(match[2], 10);

  switch (op) {
    case "==":
      return (count) => count === n;
    case "!=":
      return (count) => count !== n;
    case ">=":
      return (count) => count >= n;
    case "<=":
      return (count) => count <= n;
    case ">":
      return (count) => count > n;
    case "<":
      return (count) => count < n;
    default:
      // Unreachable — regex guarantees op is one of the above.
      throw new Error(`unreachable: ${op}`);
  }
}

/** Display string for a cardinality spec; resolves the default. */
export function describeCardinality(spec: Cardinality | undefined): string {
  return spec ?? ">= 1";
}
