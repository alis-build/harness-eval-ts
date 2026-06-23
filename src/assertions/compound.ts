/**
 * Compound assertion evaluators: `any_of`, `all_of`, `not`.
 *
 * These recurse into the main evaluator. To avoid a circular import between
 * this file and `evaluator.ts`, the dispatcher is passed in as a function
 * parameter rather than imported directly. The evaluator binds itself when
 * dispatching to these.
 */

import type { Assertion, AssertionResult } from "../types/assertions";
import type { TrajectoryView } from "../types/trajectory";

/**
 * Signature of the top-level dispatcher. Passed into compound evaluators so
 * they can recursively evaluate child assertions without a circular import.
 */
export type Evaluator = (
  view: TrajectoryView,
  assertion: Assertion,
) => AssertionResult;

/** Evaluate `all_of`: every child assertion must pass. */
export function evaluateAllOf(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "all_of" }>,
  evaluate: Evaluator,
): AssertionResult {
  const children = assertion.assertions.map((a) => evaluate(view, a));
  const passed = children.every((c) => c.passed);
  const failedCount = children.filter((c) => !c.passed).length;

  return {
    passed,
    description: `all_of (${children.length} child${children.length === 1 ? "" : "ren"})`,
    details: passed
      ? "all passed"
      : `${failedCount} of ${children.length} failed`,
    children,
  };
}

/** Evaluate `any_of`: at least one child assertion must pass. */
export function evaluateAnyOf(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "any_of" }>,
  evaluate: Evaluator,
): AssertionResult {
  const children = assertion.assertions.map((a) => evaluate(view, a));
  const passedCount = children.filter((c) => c.passed).length;
  const passed = passedCount > 0;

  return {
    passed,
    description: `any_of (${children.length} child${children.length === 1 ? "" : "ren"})`,
    details: passed ? `${passedCount} passed` : "all failed",
    children,
  };
}

/** Evaluate `not`: invert the inner assertion result. */
export function evaluateNot(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "not" }>,
  evaluate: Evaluator,
): AssertionResult {
  const child = evaluate(view, assertion.assertion);
  return {
    passed: !child.passed,
    description: `not(${child.description})`,
    details: child.passed
      ? "inner passed (so outer fails)"
      : "inner failed (so outer passes)",
    children: [child],
  };
}
