/**
 * Predicate engine for matching tool call arguments.
 *
 * Conceptually similar to MongoDB query selectors: a predicate is a tree
 * of conditions, applied recursively to a value. Examples:
 *
 *   matches("hello world", { contains: "world" })           // true
 *   matches({ a: 1 }, { a: { gte: 0 } })                    // true
 *   matches({ a: { b: "x" } }, { a: { b: "x" } })           // true (scalar shortcut)
 *   matches({ q: "ab" }, { any_of: [{equals:"x"}, {contains:"a"}] }) // ???
 *
 * Last example: the `any_of` applies to the value (`{q:"ab"}`), not to a
 * field. `equals:"x"` and `contains:"a"` are both leaf predicates that
 * apply to the whole value. `contains` requires a string, so it returns
 * false for the object. The whole thing returns false. That's deliberate.
 *
 * Disambiguation rule (single-key objects): a single-key object is interpreted as a leaf or compound predicate IF
 * the key matches a known operator name. Otherwise it falls through to
 * being treated as an object predicate (field name = key).
 *
 * This means a tool argument schema cannot have a top-level field named
 * `equals`, `contains`, `regex`, `any_of`, `all_of`, `not`, etc. — those
 * fields would be shadowed by predicate operators. For MCP tools, this
 * has never been a problem in practice; document it and move on.
 */

import type { Predicate } from "../types/assertions";

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
 * Apply a predicate to a value. Returns true if the value satisfies the
 * predicate, false otherwise.
 *
 * The `predicate` parameter is typed as `unknown` because YAML deserialization
 * produces unconstrained shapes; runtime dispatch is the validation.
 */
export function matches(value: unknown, predicate: unknown): boolean {
  // Scalar shortcut: anything that isn't a plain object (or is an array) is
  // treated as an equality target.
  if (!isPlainObject(predicate)) {
    return deepEquals(value, predicate);
  }

  const obj = predicate as Record<string, unknown>;
  const keys = Object.keys(obj);

  // Single-key object: check if it's a known operator.
  if (keys.length === 1) {
    const key = keys[0];

    if (COMPOUND_OPS.has(key)) {
      switch (key) {
        case "any_of":
          return (obj.any_of as Predicate[]).some((sub) => matches(value, sub));
        case "all_of":
          return (obj.all_of as Predicate[]).every((sub) =>
            matches(value, sub),
          );
        case "not":
          return !matches(value, obj.not);
      }
    }

    if (LEAF_OPS.has(key)) {
      return matchesLeaf(value, key, obj[key]);
    }

    // Single key but not a known operator → object predicate (field match).
  }

  // Object predicate: every key is a field on `value`, every key's value is
  // a sub-predicate that must hold for the corresponding field.
  if (!isPlainObject(value)) return false;
  const valueObj = value as Record<string, unknown>;

  for (const [field, subPred] of Object.entries(obj)) {
    if (!matches(valueObj[field], subPred)) return false;
  }
  return true;
}

/** Apply a single leaf operator. Caller guarantees `op` is in LEAF_OPS. */
function matchesLeaf(value: unknown, op: string, target: unknown): boolean {
  switch (op) {
    case "equals":
      return deepEquals(value, target);
    case "contains":
      return typeof value === "string" && value.includes(target as string);
    case "not_contains":
      return typeof value === "string" && !value.includes(target as string);
    case "regex":
      if (typeof value !== "string" || typeof target !== "string") {
        return false;
      }
      try {
        return new RegExp(target).test(value);
      } catch {
        return false;
      }
    case "gte":
      return typeof value === "number" && value >= (target as number);
    case "lte":
      return typeof value === "number" && value <= (target as number);
    case "gt":
      return typeof value === "number" && value > (target as number);
    case "lt":
      return typeof value === "number" && value < (target as number);
    case "one_of":
      return (target as unknown[]).some((t) => deepEquals(value, t));
    default:
      throw new Error(`unknown leaf operator: ${op}`);
  }
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Structural equality for unknown values. Used by `equals` and `one_of`.
 * Strict — no coercions, no NaN-equals-NaN special case (matches `===`).
 */
function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEquals(v, b[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => deepEquals(aObj[k], bObj[k]));
}
