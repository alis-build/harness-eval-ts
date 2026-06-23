/**
 * Assertion DSL — runtime type definitions.
 *
 * Runtime shape vs YAML shape: the on-disk YAML shape uses single-key objects for ergonomics:
 *
 *   - called: mcp__api__search_skills
 *   - called_before:
 *       first: mcp__api__search_skills
 *       then:  mcp__api__load_skill
 *
 * The runtime shape is a tagged discriminated union (`type` field), which
 * makes exhaustiveness checks work and keeps the evaluator readable. The
 * YAML loader is responsible for the transformation between the two — that
 * lives in `src/config/transform.ts`.
 *
 * Why this split? YAML shape optimizes for hand-authoring and
 * LLM-bulk-generation; runtime shape optimizes for the evaluator. Two
 * different surfaces with different design pressures.
 */

import type { ToolCall, TrajectoryView } from "./trajectory";

// tool name patterns

/**
 * A tool name pattern. Either a literal name, or a glob with `*` wildcards.
 *
 * The object form (`{ pattern: "..." }`) exists only for YAML disambiguation —
 * in YAML, a bare string is the default. Internally they are equivalent.
 *
 * @example
 *   "mcp__api__search_skills"      // literal match
 *   "mcp__api__*"                  // any tool in mcp__api namespace
 *   "mcp__*"                       // any MCP tool
 *   "*"                            // any tool at all
 */
export type ToolPattern = string | { pattern: string };

// cardinality

/**
 * Cardinality spec for `called` assertions.
 *
 * Format: `"<op> <n>"` with `op` ∈ {`==`, `!=`, `>=`, `<=`, `>`, `<`}.
 * Default (when omitted): `">= 1"`.
 *
 * Parsed lazily by `src/assertions/cardinality.ts`.
 */
export type Cardinality = string;

// predicates (for matching tool call arguments)

/**
 * Argument-matching predicate.
 *
 * The predicate language is recursive. Three flavours:
 *   - Leaf:     `{ equals: "x" }`, `{ contains: "foo" }`, etc.
 *   - Compound: `{ all_of: [...] }`, `{ any_of: [...] }`, `{ not: ... }`.
 *   - Object:   `{ field1: <predicate>, field2: <predicate>, ... }` — descend
 *               into object fields. Each field's value is itself a Predicate.
 *
 * Disambiguation: a single-key object whose key matches a known leaf or
 * compound operator is treated as a leaf/compound predicate. Otherwise it
 * is treated as an object predicate (field name = key).
 *
 * Known limitation: if your tool's arg schema has a field literally named
 * `equals`, `contains`, etc., you must wrap it: `{ equals: { equals: "x" } }`.
 * In practice this never happens for MCP tools.
 */
export type Predicate = LeafPredicate | CompoundPredicate | ObjectPredicate;

export type LeafPredicate =
  | { equals: unknown }
  | { contains: string }
  | { not_contains: string }
  | { regex: string }
  | { gte: number }
  | { lte: number }
  | { gt: number }
  | { lt: number }
  | { one_of: unknown[] };

export type CompoundPredicate =
  | { any_of: Predicate[] }
  | { all_of: Predicate[] }
  | { not: Predicate };

/** Object-shaped predicate. Field values may be sub-predicates or scalar shortcuts. */
export type ObjectPredicate = {
  [field: string]: Predicate | string | number | boolean | null;
};

// assertions

/**
 * The full assertion language. Each variant is evaluated by a corresponding
 * function in the `src/assertions/*.ts` modules.
 *
 * Grouped by concern for readability:
 *   1. Tool-call presence and ordering
 *   2. Tool-call argument matching
 *   3. Behavior (efficiency, finishing, blind-answering)
 *   4. Response text
 *   5. Compound (logical operators)
 *   6. Escape hatch (arbitrary TypeScript predicate)
 */
export type Assertion =
  // 1. Tool-call presence and ordering
  | { type: "called"; tool: ToolPattern; times?: Cardinality }
  | { type: "not_called"; tool: ToolPattern }
  | { type: "called_any_of"; tools: ToolPattern[] }
  | { type: "called_all_of"; tools: ToolPattern[] }
  | { type: "called_before"; first: ToolPattern; then: ToolPattern }
  | { type: "sequence"; tools: ToolPattern[]; strict?: boolean }

  // 2. Tool-call argument matching
  | { type: "called_with"; tool: ToolPattern; args: Predicate }

  // 3. Behavior
  | { type: "responded_without_tool_calls" }
  | { type: "iterations_within"; max: number }
  | { type: "cost_within_usd"; max: number }
  | { type: "duration_within_ms"; max: number }
  | { type: "finished_with"; reasons: string | string[] }

  // 4. Response text
  | { type: "response_contains"; text: string }
  | { type: "response_not_contains"; text: string }
  | { type: "response_matches"; pattern: string; flags?: string }

  // 5. Compound
  | { type: "all_of"; assertions: Assertion[] }
  | { type: "any_of"; assertions: Assertion[] }
  | { type: "not"; assertion: Assertion }

  // 6. Escape hatch — code-only (YAML loader cannot produce functions)
  | {
      type: "predicate";
      fn: (view: TrajectoryView) => boolean;
      description?: string;
    };

// thresholded assertions (YAML / runner)

/** An assertion plus the pass-rate threshold it must meet across repetitions. */
export interface ThresholdedAssertion {
  assertion: Assertion;
  /**
   * Minimum pass rate across repetitions for this assertion to be considered
   * passing. Range 0..1. Default 1.0 (strict — every rep must pass).
   */
  threshold?: number;
}

// evaluation results

/**
 * Result of evaluating a single assertion.
 *
 * `children` is populated for compound assertions (and/or/not) so the
 * reporter can render a tree showing which leaf caused a failure. `matches`
 * carries the tool calls that satisfied (or could have satisfied) the
 * assertion — useful for diagnostic output.
 */
export interface AssertionResult {
  passed: boolean;
  /** Short human-readable name, e.g. `"called(mcp__api__search_skills, >= 1)"`. */
  description: string;
  /** Diagnostic detail. Always populated; explains the pass/fail. */
  details: string;
  /** Tool calls that satisfied the assertion (omitted when irrelevant). */
  matches?: ToolCall[];
  /** Sub-results for compound assertions. */
  children?: AssertionResult[];
}
