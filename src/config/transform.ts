/**
 * Transform YAML-shape assertions into runtime tagged-union assertions.
 *
 * Why a hand-written transformer rather than zod? The YAML shape is single-key objects (`called: "foo"`) and the runtime
 * shape is a tagged union (`{ type: "called", tool: "foo" }`). zod CAN
 * express this via `z.union` with one member per assertion type, but the
 * error messages devolve into "expected one of 19 alternatives, none
 * matched" with no indication of which one the user was trying to write.
 * Hand-written transformers per-assertion give targeted errors like
 * `at cases[2].assertions[1].called: 'tool' field missing`.
 *
 * Shortcut policy: for ergonomics, four assertions accept a bare scalar in place of an
 * object: `called`, `not_called`, `response_contains`, and
 * `responded_without_tool_calls`. Everything else requires the verbose
 * object form. This keeps the transformer small without giving up the
 * 90% of YAML readability.
 */

import type {
  Assertion,
  Predicate,
  ThresholdedAssertion,
  ToolPattern,
} from "../types/assertions";
import { parseCardinality } from "../assertions/cardinality";
import type { MatrixCell, TestCase, TestSuite } from "../runner/types";
import type { ReferenceTrajectoryConfig } from "../types/eval-interchange";
import type { RawMatrixCell, RawTestCase, RawTestSuite, RawSuiteDirectory } from "./schema";

// error type

/**
 * Thrown when a YAML suite fails to validate or transform. Carries a JSON-path-
 * like trail so users can find the offending node in their config quickly.
 */
export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly path?: string,
  ) {
    super(path ? `[${path}] ${message}` : message);
    this.name = "ConfigError";
  }
}

// suite-level transformer

/** Transform a zod-validated raw suite into the runtime `TestSuite` shape. */
export function transformSuite(raw: RawTestSuite): TestSuite {
  return transformSuiteParts(raw);
}

/** Transform a directory `suite.yaml` (cases optional) into runtime shape. */
export function transformSuiteDirectory(raw: RawSuiteDirectory): TestSuite {
  return transformSuiteParts({
    ...raw,
    cases: raw.cases ?? [],
  });
}

/** Transform parsed case files into runtime test cases. */
export function transformTestCases(
  raw: RawTestCase[],
  pathPrefix: string,
): TestCase[] {
  return raw.map((c, i) => transformTestCase(c, `${pathPrefix}[${i}]`));
}

/** Merge suite-level parts shared by single-file and directory transforms. */
function transformSuiteParts(raw: RawTestSuite): TestSuite {
  return {
    adapter: raw.adapter,
    defaultConfig: raw.defaultConfig,
    matrix: raw.matrix.map(transformMatrixCell),
    cases: raw.cases.map((c, i) => transformTestCase(c, `cases[${i}]`)),
  };
}

/**
 * Normalize reference trajectory YAML into {@link ReferenceTrajectoryConfig}.
 *
 * Accepts a bare step array or `{ tool_name_mode?, steps }` object form.
 */
function normalizeReferenceTrajectory(
  raw: RawTestCase["reference_trajectory"],
  path: string,
): ReferenceTrajectoryConfig | undefined {
  if (raw === undefined) return undefined;

  if (Array.isArray(raw)) {
    return { steps: raw };
  }

  if (!isPlainObject(raw) || !Array.isArray(raw.steps)) {
    throw new ConfigError(
      "reference_trajectory must be an array of tool calls or { tool_name_mode?, steps: [...] }",
      path,
    );
  }

  return {
    tool_name_mode: raw.tool_name_mode,
    steps: raw.steps,
  };
}

/** Map raw matrix cell YAML to runtime {@link MatrixCell}. */
function transformMatrixCell(raw: RawMatrixCell): MatrixCell {
  return {
    label: raw.label,
    config: raw.config,
    axes: raw.axes,
  };
}

/** Map one raw test case to runtime {@link TestCase}, transforming assertions. */
function transformTestCase(raw: RawTestCase, path: string): TestCase {
  return {
    id: raw.id,
    prompt: raw.prompt,
    category: raw.category,
    notes: raw.notes,
    expectations: raw.expectations,
    reference_trajectory: normalizeReferenceTrajectory(
      raw.reference_trajectory,
      `${path}.reference_trajectory`,
    ),
    human_ratings: raw.human_ratings,
    repetitions: raw.repetitions,
    config: raw.config,
    assertions: raw.assertions.map((a, i) =>
      transformThresholdedAssertion(a, `${path}.assertions[${i}]`),
    ),
  };
}

// thresholded assertion

/** Keys that may appear alongside an assertion-type key. Not assertion types themselves. */
const SIBLING_KEYS = new Set(["threshold"]);

/**
 * Parse optional `threshold` sibling and delegate the assertion body to
 * {@link transformAssertion}.
 *
 * @throws {ConfigError} When the wrapper is not an object, threshold is out of
 *   `[0, 1]`, or the nested assertion fails validation.
 *
 * @example
 * transformThresholdedAssertion({ called: "Read", threshold: 0.9 }, "path")
 * // → { assertion: { type: "called", tool: "Read" }, threshold: 0.9 }
 */
function transformThresholdedAssertion(
  raw: unknown,
  path: string,
): ThresholdedAssertion {
  if (!isPlainObject(raw)) {
    throw new ConfigError(`expected object, got ${typeOf(raw)}`, path);
  }

  const threshold = raw.threshold;
  if (threshold !== undefined) {
    if (typeof threshold !== "number" || threshold < 0 || threshold > 1) {
      throw new ConfigError(
        `threshold must be a number in [0, 1], got ${JSON.stringify(threshold)}`,
        `${path}.threshold`,
      );
    }
  }

  return {
    assertion: transformAssertion(raw, path),
    threshold: typeof threshold === "number" ? threshold : undefined,
  };
}

// assertion transformer (the bulk)

/**
 * Transform one assertion from YAML shape to runtime shape.
 *
 * Finds the single non-sibling key, dispatches to the per-type transformer.
 * Per-type transformers handle both verbose-object and shortcut-scalar input
 * shapes where applicable.
 *
 * @param raw - Single assertion object from parsed YAML (may include `threshold` sibling).
 * @param path - JSON-path-like location for error messages (e.g. `cases[0].assertions[1]`).
 * @returns Runtime {@link Assertion} tagged union.
 * @throws {ConfigError} When the object has no assertion key, multiple type keys, or an unknown type.
 *
 * @example
 * transformAssertion({ called: "Read" }, "cases[0].assertions[0]")
 * // → { type: "called", tool: "Read" }
 *
 * @example
 * transformAssertion({ called: { tool: "Read", times: ">= 2" } }, "path")
 * // → { type: "called", tool: "Read", times: ">= 2" }
 */
export function transformAssertion(raw: unknown, path: string): Assertion {
  if (!isPlainObject(raw)) {
    throw new ConfigError(`expected object, got ${typeOf(raw)}`, path);
  }

  const typeKeys = Object.keys(raw).filter((k) => !SIBLING_KEYS.has(k));
  if (typeKeys.length === 0) {
    throw new ConfigError(
      `no assertion type key found (got only sibling keys: ${Object.keys(raw).join(", ")})`,
      path,
    );
  }
  if (typeKeys.length > 1) {
    throw new ConfigError(
      `multiple assertion type keys; pick one: ${typeKeys.join(", ")}`,
      path,
    );
  }

  const typeKey = typeKeys[0];
  const value = raw[typeKey];
  const valuePath = `${path}.${typeKey}`;

  switch (typeKey) {
    case "called":
      return transformCalled(value, valuePath);
    case "not_called":
      return transformNotCalled(value, valuePath);
    case "called_any_of":
      return transformCalledAnyOf(value, valuePath);
    case "called_all_of":
      return transformCalledAllOf(value, valuePath);

    case "called_before":
      return transformCalledBefore(value, valuePath);
    case "sequence":
      return transformSequence(value, valuePath);

    case "called_with":
      return transformCalledWith(value, valuePath);

    case "responded_without_tool_calls":
      return transformRespondedWithoutToolCalls(value, valuePath);
    case "iterations_within":
      return transformScalarMax(value, valuePath, "iterations_within");
    case "cost_within_usd":
      return transformScalarMax(value, valuePath, "cost_within_usd");
    case "duration_within_ms":
      return transformScalarMax(value, valuePath, "duration_within_ms");
    case "finished_with":
      return transformFinishedWith(value, valuePath);

    case "response_contains":
      return transformResponseText(value, valuePath, "response_contains");
    case "response_not_contains":
      return transformResponseText(value, valuePath, "response_not_contains");
    case "response_matches":
      return transformResponseMatches(value, valuePath);

    case "all_of":
      return transformAllOf(value, valuePath);
    case "any_of":
      return transformAnyOf(value, valuePath);
    case "not":
      return transformNot(value, valuePath);

    default:
      throw new ConfigError(`unknown assertion type: ${typeKey}`, path);
  }
}

// per-assertion transformers — YAML single-key shape → runtime tagged union

/**
 * Transform `called` YAML (scalar or `{tool, times?}`) to runtime assertion.
 *
 * @throws {ConfigError} When value is neither string nor object, tool is invalid,
 *   or `times` is not a valid cardinality string.
 *
 * @example
 * // Scalar shortcut
 * transformCalled("mcp__api__search_skills", "path")
 * // → { type: "called", tool: "mcp__api__search_skills" }
 *
 * @example
 * // Verbose form with cardinality
 * transformCalled({ tool: "Read", times: ">= 1" }, "path")
 * // → { type: "called", tool: "Read", times: ">= 1" }
 */
function transformCalled(value: unknown, path: string): Assertion {
  // Scalar shortcut: bare string is the tool name.
  if (typeof value === "string") {
    return { type: "called", tool: value };
  }
  if (!isPlainObject(value)) {
    throw new ConfigError(
      `expected string or object, got ${typeOf(value)}`,
      path,
    );
  }
  const tool = requireToolPattern(value.tool, `${path}.tool`);
  let times: string | undefined;
  if (value.times !== undefined) {
    times = requireString(value.times, `${path}.times`);
    try {
      parseCardinality(times);
    } catch (err) {
      throw new ConfigError(
        err instanceof Error ? err.message : `invalid cardinality: ${times}`,
        `${path}.times`,
      );
    }
  }
  return { type: "called", tool, times };
}

/**
 * Transform `not_called` YAML (scalar or `{tool}`).
 *
 * @throws {ConfigError} When value is neither string nor object with a valid `tool`.
 *
 * @example
 * transformNotCalled("Bash", "path") // → { type: "not_called", tool: "Bash" }
 */
function transformNotCalled(value: unknown, path: string): Assertion {
  if (typeof value === "string") {
    return { type: "not_called", tool: value };
  }
  if (!isPlainObject(value)) {
    throw new ConfigError(
      `expected string or object, got ${typeOf(value)}`,
      path,
    );
  }
  return {
    type: "not_called",
    tool: requireToolPattern(value.tool, `${path}.tool`),
  };
}

/**
 * Transform `called_any_of` — bare tool list or `{tools: [...]}`.
 *
 * @throws {ConfigError} When the value is not an array or `{tools: [...]}` object.
 *
 * @example
 * transformCalledAnyOf(["Read", "Glob"], "path")
 * // → { type: "called_any_of", tools: ["Read", "Glob"] }
 */
function transformCalledAnyOf(value: unknown, path: string): Assertion {
  const tools = requireToolPatternList(value, path);
  return { type: "called_any_of", tools };
}

/**
 * Transform `called_all_of` — bare tool list or `{tools: [...]}`.
 *
 * @throws {ConfigError} When the value is not an array or `{tools: [...]}` object.
 *
 * @example
 * transformCalledAllOf({ tools: ["Read", "Grep"] }, "path")
 * // → { type: "called_all_of", tools: ["Read", "Grep"] }
 */
function transformCalledAllOf(value: unknown, path: string): Assertion {
  const tools = requireToolPatternList(value, path);
  return { type: "called_all_of", tools };
}

/**
 * Transform `called_before: {first, then}` ordering assertion.
 *
 * @throws {ConfigError} When value is not an object or `first`/`then` are invalid patterns.
 *
 * @example
 * transformCalledBefore({ first: "SearchSkills", then: "LoadSkill" }, "path")
 * // → { type: "called_before", first: "SearchSkills", then: "LoadSkill" }
 */
function transformCalledBefore(value: unknown, path: string): Assertion {
  if (!isPlainObject(value)) {
    throw new ConfigError(
      `expected object with {first, then}, got ${typeOf(value)}`,
      path,
    );
  }
  const first = requireToolPattern(value.first, `${path}.first`);
  const then = requireToolPattern(value.then, `${path}.then`);
  return { type: "called_before", first, then };
}

/**
 * Transform `sequence` — tool list with optional `strict` flag.
 *
 * @throws {ConfigError} When value is neither a pattern array nor `{tools, strict?}` object.
 *
 * @example
 * // Bare array (non-strict by default)
 * transformSequence(["Read", "Edit"], "path")
 *
 * @example
 * // Explicit strict ordering
 * transformSequence({ tools: ["Read", "Edit"], strict: true }, "path")
 */
function transformSequence(value: unknown, path: string): Assertion {
  // Two forms: bare list of patterns, or {tools: [...], strict?: bool}.
  if (Array.isArray(value)) {
    return {
      type: "sequence",
      tools: value.map((v, i) => requireToolPattern(v, `${path}[${i}]`)),
    };
  }
  if (!isPlainObject(value)) {
    throw new ConfigError(
      `expected array or object, got ${typeOf(value)}`,
      path,
    );
  }
  const tools = requireToolPatternList(value.tools, `${path}.tools`);
  const strict =
    value.strict === undefined
      ? undefined
      : requireBool(value.strict, `${path}.strict`);
  return { type: "sequence", tools, strict };
}

/**
 * Transform `called_with: {tool, args}` with predicate validation on args.
 *
 * @throws {ConfigError} When `tool` or `args` is missing/invalid, or `args` fails
 *   {@link validatePredicate}.
 *
 * @example
 * transformCalledWith(
 *   { tool: "Read", args: { path: { contains: "README" } } },
 *   "path",
 * )
 * // → { type: "called_with", tool: "Read", args: { path: { contains: "README" } } }
 */
function transformCalledWith(value: unknown, path: string): Assertion {
  if (!isPlainObject(value)) {
    throw new ConfigError(
      `expected object with {tool, args}, got ${typeOf(value)}`,
      path,
    );
  }
  const tool = requireToolPattern(value.tool, `${path}.tool`);
  if (value.args === undefined) {
    throw new ConfigError(`missing required field 'args'`, `${path}.args`);
  }
  validatePredicate(value.args, `${path}.args`);
  return { type: "called_with", tool, args: value.args as Predicate };
}

/**
 * Transform `responded_without_tool_calls` — accepts true or empty object.
 *
 * @throws {ConfigError} When value is neither `true`, null, nor an empty object.
 *
 * @example
 * transformRespondedWithoutToolCalls(true, "path")
 * // → { type: "responded_without_tool_calls" }
 */
function transformRespondedWithoutToolCalls(
  value: unknown,
  path: string,
): Assertion {
  // Accepts `true`, `{}`, or omitted (since the key being present is enough).
  if (
    value === true ||
    value === null ||
    (isPlainObject(value) && Object.keys(value).length === 0)
  ) {
    return { type: "responded_without_tool_calls" };
  }
  throw new ConfigError(
    `expected true or empty object, got ${JSON.stringify(value)}`,
    path,
  );
}

/**
 * Transform budget assertions (`iterations_within`, `cost_within_usd`, `duration_within_ms`).
 *
 * @throws {ConfigError} When `max` is missing, non-positive, or not a number.
 *
 * @example
 * transformScalarMax(5, "path", "iterations_within")
 * // → { type: "iterations_within", max: 5 }
 *
 * @example
 * transformScalarMax({ max: 2.5 }, "path", "cost_within_usd")
 * // → { type: "cost_within_usd", max: 2.5 }
 */
function transformScalarMax(
  value: unknown,
  path: string,
  type: "iterations_within" | "cost_within_usd" | "duration_within_ms",
): Assertion {
  let max: number | undefined;
  if (typeof value === "number") {
    max = value;
  } else if (isPlainObject(value) && typeof value.max === "number") {
    max = value.max;
  } else {
    throw new ConfigError(
      `expected number or {max: number}, got ${JSON.stringify(value)}`,
      path,
    );
  }
  if (max <= 0) {
    throw new ConfigError(`max must be positive, got ${max}`, path);
  }
  return { type, max };
}

/**
 * Transform `finished_with` — stop reason string, list, or `{reasons}`.
 *
 * @throws {ConfigError} When value is not a string, string array, or `{reasons}` object.
 *
 * @example
 * transformFinishedWith("end_turn", "path")
 * // → { type: "finished_with", reasons: "end_turn" }
 */
function transformFinishedWith(value: unknown, path: string): Assertion {
  // Three forms: bare string, bare array of strings, or {reasons: string | string[]}.
  if (typeof value === "string") {
    return { type: "finished_with", reasons: value };
  }
  if (Array.isArray(value)) {
    return {
      type: "finished_with",
      reasons: value.map((v, i) => requireString(v, `${path}[${i}]`)),
    };
  }
  if (isPlainObject(value)) {
    const reasons = value.reasons;
    if (typeof reasons === "string") return { type: "finished_with", reasons };
    if (Array.isArray(reasons)) {
      return {
        type: "finished_with",
        reasons: reasons.map((v, i) =>
          requireString(v, `${path}.reasons[${i}]`),
        ),
      };
    }
  }
  throw new ConfigError(
    `expected string, string[], or {reasons: ...}, got ${JSON.stringify(value)}`,
    path,
  );
}

/**
 * Transform `response_contains` / `response_not_contains` scalar or `{text}`.
 *
 * @throws {ConfigError} When value is neither a string nor `{text: string}`.
 *
 * @example
 * transformResponseText("done", "path", "response_contains")
 * // → { type: "response_contains", text: "done" }
 */
function transformResponseText(
  value: unknown,
  path: string,
  type: "response_contains" | "response_not_contains",
): Assertion {
  if (typeof value === "string") {
    return { type, text: value };
  }
  if (isPlainObject(value) && typeof value.text === "string") {
    return { type, text: value.text };
  }
  throw new ConfigError(
    `expected string or {text: string}, got ${JSON.stringify(value)}`,
    path,
  );
}

/**
 * Transform `response_matches: {pattern, flags?}`.
 *
 * @throws {ConfigError} When `pattern` is missing or not a string.
 *
 * @example
 * transformResponseMatches({ pattern: "error\\d+", flags: "i" }, "path")
 * // → { type: "response_matches", pattern: "error\\d+", flags: "i" }
 */
function transformResponseMatches(value: unknown, path: string): Assertion {
  if (!isPlainObject(value)) {
    throw new ConfigError(
      `expected object with {pattern, flags?}, got ${typeOf(value)}`,
      path,
    );
  }
  const pattern = requireString(value.pattern, `${path}.pattern`);
  const flags =
    value.flags === undefined
      ? undefined
      : requireString(value.flags, `${path}.flags`);
  return { type: "response_matches", pattern, flags };
}

/**
 * Transform compound `all_of` assertion list.
 *
 * @throws {ConfigError} When value is not an array or `{assertions: [...]}`.
 *
 * @example
 * transformAllOf([{ called: "Read" }, { not_called: "Bash" }], "path")
 */
function transformAllOf(value: unknown, path: string): Assertion {
  return { type: "all_of", assertions: transformCompoundList(value, path) };
}

/**
 * Transform compound `any_of` assertion list.
 *
 * @throws {ConfigError} When value is not an array or `{assertions: [...]}`.
 *
 * @example
 * transformAnyOf({ assertions: [{ called: "Read" }, { called: "Glob" }] }, "path")
 */
function transformAnyOf(value: unknown, path: string): Assertion {
  return { type: "any_of", assertions: transformCompoundList(value, path) };
}

/**
 * Transform compound `not` — single nested assertion, no threshold.
 *
 * The inner assertion uses the same single-key YAML shape as top-level
 * assertions; thresholds apply only at the outer {@link transformThresholdedAssertion} level.
 *
 * @throws {ConfigError} Propagates from nested {@link transformAssertion}.
 *
 * @example
 * transformNot({ called: "Bash" }, "path")
 * // → { type: "not", assertion: { type: "called", tool: "Bash" } }
 */
function transformNot(value: unknown, path: string): Assertion {
  // `not` takes a single assertion as its value (not a list). The inner
  // assertion uses the same single-key shape as top-level assertions, so
  // we recurse via the main transformer. We don't pass thresholds for
  // inner assertions — those only apply at the top level.
  return { type: "not", assertion: transformAssertion(value, path) };
}

/**
 * Parse compound assertion list from array or `{assertions: [...]}`.
 *
 * @throws {ConfigError} When value is neither form.
 */
function transformCompoundList(value: unknown, path: string): Assertion[] {
  // Two forms: bare array of assertions, or {assertions: [...]}.
  const list = Array.isArray(value)
    ? value
    : isPlainObject(value) && Array.isArray(value.assertions)
      ? value.assertions
      : null;

  if (list === null) {
    throw new ConfigError(
      `expected array or {assertions: [...]}, got ${JSON.stringify(value)}`,
      path,
    );
  }

  return list.map((a, i) => transformAssertion(a, `${path}[${i}]`));
}

// predicate validation

const LEAF_OPS = new Set([
  "equals",
  "contains",
  "not_contains",
  "regex",
  "gte",
  "lte",
  "gt",
  "lt",
  "one_of",
]);
const COMPOUND_OPS = new Set(["any_of", "all_of", "not"]);

/**
 * Validate that a predicate is well-formed. The runtime engine is tolerant
 * (returns false on bad shapes), but the loader is strict — invalid
 * predicates are far more often user typos than intentional patterns.
 *
 * Permitted shapes:
 *   - scalar (treated as `{equals: scalar}` at runtime)
 *   - single-key object whose key is a leaf op (e.g. `{contains: "x"}`)
 *   - single-key compound (`{any_of: [...]}`, `{all_of: [...]}`, `{not: ...}`)
 *   - multi-key object (descend into fields; each value is a sub-predicate)
 *
 * @throws {ConfigError} When a compound op has a non-array value or a leaf op
 *   has the wrong value type (e.g. non-string `contains`).
 */
function validatePredicate(raw: unknown, path: string): void {
  // Scalars are valid (interpreted as equals at runtime).
  if (!isPlainObject(raw)) return;

  const keys = Object.keys(raw);
  if (keys.length === 1) {
    const key = keys[0];

    if (LEAF_OPS.has(key)) {
      validateLeafOperator(key, raw[key], `${path}.${key}`);
      return;
    }

    if (COMPOUND_OPS.has(key)) {
      if (key === "not") {
        validatePredicate(raw[key], `${path}.not`);
      } else {
        const arr = raw[key];
        if (!Array.isArray(arr)) {
          throw new ConfigError(
            `${key} must be an array, got ${typeOf(arr)}`,
            `${path}.${key}`,
          );
        }
        arr.forEach((sub, i) => validatePredicate(sub, `${path}.${key}[${i}]`));
      }
      return;
    }

    // Single key but not a known op — falls through to object predicate.
  }

  // Multi-key object: each field is a sub-predicate.
  for (const [field, sub] of Object.entries(raw)) {
    validatePredicate(sub, `${path}.${field}`);
  }
}

/**
 * Validate a leaf predicate operator's value shape at config load time.
 *
 * @throws {ConfigError} When the operator's value has the wrong type or `regex`
 *   is not a valid JavaScript regular expression.
 */
function validateLeafOperator(op: string, value: unknown, path: string): void {
  switch (op) {
    case "equals":
      return;
    case "contains":
    case "not_contains":
      if (typeof value !== "string") {
        throw new ConfigError(`${op} requires a string`, path);
      }
      return;
    case "regex":
      if (typeof value !== "string") {
        throw new ConfigError("regex requires a string", path);
      }
      try {
        new RegExp(value);
      } catch {
        throw new ConfigError(`invalid regex: ${value}`, path);
      }
      return;
    case "gte":
    case "lte":
    case "gt":
    case "lt":
      if (typeof value !== "number") {
        throw new ConfigError(`${op} requires a number`, path);
      }
      return;
    case "one_of":
      if (!Array.isArray(value)) {
        throw new ConfigError("one_of requires an array", path);
      }
      return;
    default:
      return;
  }
}

// small validation helpers

/** Require a tool pattern string or `{ pattern }` object. */
function requireToolPattern(value: unknown, path: string): ToolPattern {
  if (typeof value === "string") return value;
  if (isPlainObject(value) && typeof value.pattern === "string") {
    return { pattern: value.pattern };
  }
  throw new ConfigError(
    `expected string or {pattern: string}, got ${JSON.stringify(value)}`,
    path,
  );
}

/** Require a bare tool pattern array or `{ tools: [...] }` wrapper. */
function requireToolPatternList(value: unknown, path: string): ToolPattern[] {
  // Two forms: bare array, or {tools: [...]}.
  const list = Array.isArray(value)
    ? value
    : isPlainObject(value) && Array.isArray(value.tools)
      ? value.tools
      : null;

  if (list === null) {
    throw new ConfigError(
      `expected array of tool patterns or {tools: [...]}, got ${JSON.stringify(value)}`,
      path,
    );
  }

  return list.map((v, i) => requireToolPattern(v, `${path}[${i}]`));
}

/** Require a string value at `path` or throw {@link ConfigError}. */
function requireString(value: unknown, path: string): string {
  if (typeof value === "string") return value;
  throw new ConfigError(`expected string, got ${typeOf(value)}`, path);
}

/** Require a boolean value at `path` or throw {@link ConfigError}. */
function requireBool(value: unknown, path: string): boolean {
  if (typeof value === "boolean") return value;
  throw new ConfigError(`expected boolean, got ${typeOf(value)}`, path);
}

/** True for non-null, non-array objects (YAML mapping nodes). */
function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Human-readable type name for config error messages. */
function typeOf(x: unknown): string {
  if (x === null) return "null";
  if (Array.isArray(x)) return "array";
  return typeof x;
}
