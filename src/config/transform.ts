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

function transformSuiteParts(raw: RawTestSuite): TestSuite {
  return {
    adapter: raw.adapter,
    defaultConfig: raw.defaultConfig,
    matrix: raw.matrix.map(transformMatrixCell),
    cases: raw.cases.map((c, i) => transformTestCase(c, `cases[${i}]`)),
  };
}

function transformMatrixCell(raw: RawMatrixCell): MatrixCell {
  return {
    label: raw.label,
    config: raw.config,
    axes: raw.axes,
  };
}

function transformTestCase(raw: RawTestCase, path: string): TestCase {
  return {
    id: raw.id,
    prompt: raw.prompt,
    category: raw.category,
    notes: raw.notes,
    expectations: raw.expectations,
    reference_trajectory: raw.reference_trajectory,
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

// per-assertion transformers

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

function transformCalledAnyOf(value: unknown, path: string): Assertion {
  const tools = requireToolPatternList(value, path);
  return { type: "called_any_of", tools };
}

function transformCalledAllOf(value: unknown, path: string): Assertion {
  const tools = requireToolPatternList(value, path);
  return { type: "called_all_of", tools };
}

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

function transformAllOf(value: unknown, path: string): Assertion {
  return { type: "all_of", assertions: transformCompoundList(value, path) };
}

function transformAnyOf(value: unknown, path: string): Assertion {
  return { type: "any_of", assertions: transformCompoundList(value, path) };
}

function transformNot(value: unknown, path: string): Assertion {
  // `not` takes a single assertion as its value (not a list). The inner
  // assertion uses the same single-key shape as top-level assertions, so
  // we recurse via the main transformer. We don't pass thresholds for
  // inner assertions — those only apply at the top level.
  return { type: "not", assertion: transformAssertion(value, path) };
}

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

function requireString(value: unknown, path: string): string {
  if (typeof value === "string") return value;
  throw new ConfigError(`expected string, got ${typeOf(value)}`, path);
}

function requireBool(value: unknown, path: string): boolean {
  if (typeof value === "boolean") return value;
  throw new ConfigError(`expected boolean, got ${typeOf(value)}`, path);
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function typeOf(x: unknown): string {
  if (x === null) return "null";
  if (Array.isArray(x)) return "array";
  return typeof x;
}
