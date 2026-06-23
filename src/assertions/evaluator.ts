/**
 * Top-level assertion evaluator.
 *
 * Dispatches on the discriminant of the `Assertion` tagged union, delegating
 * to the per-kind evaluators in the sibling modules. This file deliberately
 * contains no logic of its own — keep it boring so adding a new assertion
 * type is just (a) extend the union in `types/assertions.ts`, (b) add an
 * evaluator function in the appropriate sibling, (c) add one case here.
 */

import type { Assertion, AssertionResult } from "../types/assertions";
import type { TrajectoryView } from "../types/trajectory";

import {
  evaluateCalled,
  evaluateCalledAllOf,
  evaluateCalledAnyOf,
  evaluateCalledBefore,
  evaluateCalledWith,
  evaluateNotCalled,
  evaluateSequence,
} from "./tool-calls";

import {
  evaluateCostWithinUsd,
  evaluateDurationWithinMs,
  evaluateFinishedWith,
  evaluateIterationsWithin,
  evaluatePredicate,
  evaluateRespondedWithoutToolCalls,
  evaluateResponseContains,
  evaluateResponseMatches,
  evaluateResponseNotContains,
} from "./behavior";

import { evaluateAllOf, evaluateAnyOf, evaluateNot } from "./compound";

/**
 * Evaluate one assertion against a trajectory view.
 *
 * The switch is exhaustive — TypeScript's `never` check at the end will
 * flag any new variant added to the `Assertion` union that hasn't been
 * wired up here.
 */
export function evaluate(
  view: TrajectoryView,
  assertion: Assertion,
): AssertionResult {
  switch (assertion.type) {
    // tool-call presence and ordering
    case "called":
      return evaluateCalled(view, assertion);
    case "not_called":
      return evaluateNotCalled(view, assertion);
    case "called_any_of":
      return evaluateCalledAnyOf(view, assertion);
    case "called_all_of":
      return evaluateCalledAllOf(view, assertion);
    case "called_before":
      return evaluateCalledBefore(view, assertion);
    case "sequence":
      return evaluateSequence(view, assertion);

    // tool-call arguments
    case "called_with":
      return evaluateCalledWith(view, assertion);

    // behavior
    case "responded_without_tool_calls":
      return evaluateRespondedWithoutToolCalls(view, assertion);
    case "iterations_within":
      return evaluateIterationsWithin(view, assertion);
    case "cost_within_usd":
      return evaluateCostWithinUsd(view, assertion);
    case "duration_within_ms":
      return evaluateDurationWithinMs(view, assertion);
    case "finished_with":
      return evaluateFinishedWith(view, assertion);

    // response text
    case "response_contains":
      return evaluateResponseContains(view, assertion);
    case "response_not_contains":
      return evaluateResponseNotContains(view, assertion);
    case "response_matches":
      return evaluateResponseMatches(view, assertion);

    // compound — pass the dispatcher in so they can recurse without
    // creating a circular import
    case "all_of":
      return evaluateAllOf(view, assertion, evaluate);
    case "any_of":
      return evaluateAnyOf(view, assertion, evaluate);
    case "not":
      return evaluateNot(view, assertion, evaluate);

    // escape hatch
    case "predicate":
      return evaluatePredicate(view, assertion);

    default: {
      // Exhaustiveness guard. If a new assertion variant is added to the
      // union and not wired into the switch above, TypeScript will fail
      // here at compile time. Don't remove this case.
      const _exhaustive: never = assertion;
      throw new Error(`unknown assertion: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Evaluate a list of assertions independently. Used at the test-case level
 * where each top-level assertion is reported separately (and thresholded
 * separately, in the runner layer).
 */
export function evaluateAll(
  view: TrajectoryView,
  assertions: Assertion[],
): AssertionResult[] {
  return assertions.map((a) => evaluate(view, a));
}
