/**
 * Behavior and response-text assertions.
 *
 * Cover everything that isn't a tool-call query:
 *   - Did the agent answer without using any tool? (the "blind answer" case)
 *   - Did it stay within iteration / cost / time budget?
 *   - What did it say its stop reason was?
 *   - Does the response text contain expected substrings or match a regex?
 *   - Arbitrary user-supplied predicate (escape hatch).
 */

import type { Assertion, AssertionResult } from "../types/assertions";
import type { TrajectoryView } from "../types/trajectory";

// behavior

/**
 * Was the response delivered without using any tool? This is the primary
 * failure mode detector for the skills-loading problem: when the harness
 * ignores the MCP, the trace shows zero tool calls and one terminal
 * assistant turn with finish reason `end_turn`.
 *
 * "Without tool calls" is defined as `toolCalls.length === 0` AND the
 * response text is non-empty (so we don't confuse "answered blind" with
 * "session died before producing anything").
 */
export function evaluateRespondedWithoutToolCalls(
  view: TrajectoryView,
  _assertion: Extract<Assertion, { type: "responded_without_tool_calls" }>,
): AssertionResult {
  const passed = view.toolCalls.length === 0 && view.finalResponse.length > 0;
  return {
    passed,
    description: "responded_without_tool_calls",
    details: passed
      ? "no tools called, response non-empty"
      : view.toolCalls.length > 0
        ? `${view.toolCalls.length} tool call(s) made`
        : "response was empty (session probably aborted)",
  };
}

/** Assert the session stayed within the reported turn count. */
export function evaluateIterationsWithin(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "iterations_within" }>,
): AssertionResult {
  const n = view.usage.numTurns;
  const passed = n <= assertion.max;
  return {
    passed,
    description: `iterations_within(${assertion.max})`,
    details: `used ${n} turn(s)`,
  };
}

/** Assert total session cost in USD is within budget. */
export function evaluateCostWithinUsd(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "cost_within_usd" }>,
): AssertionResult {
  const cost = view.usage.totalCostUsd;
  const passed = cost <= assertion.max;
  return {
    passed,
    description: `cost_within_usd(${assertion.max.toFixed(4)})`,
    details: `used $${cost.toFixed(4)}`,
  };
}

/** Assert wall-clock session duration is within budget. */
export function evaluateDurationWithinMs(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "duration_within_ms" }>,
): AssertionResult {
  const ms = view.usage.durationMs;
  const passed = ms <= assertion.max;
  return {
    passed,
    description: `duration_within_ms(${assertion.max})`,
    details: `took ${ms}ms`,
  };
}

/** Assert the final stop reason matches one of the allowed values. */
export function evaluateFinishedWith(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "finished_with" }>,
): AssertionResult {
  const allowed = Array.isArray(assertion.reasons)
    ? assertion.reasons
    : [assertion.reasons];
  const actual = view.finalStopReason;
  const passed = actual !== null && allowed.includes(actual);
  return {
    passed,
    description: `finished_with(${allowed.join("|")})`,
    details: `actual: ${actual ?? "(none)"}`,
  };
}

// response text

/** Assert `finalResponse` contains the given substring. */
export function evaluateResponseContains(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "response_contains" }>,
): AssertionResult {
  const passed = view.finalResponse.includes(assertion.text);
  return {
    passed,
    description: `response_contains(${JSON.stringify(assertion.text)})`,
    details: passed ? "text found" : "text not in response",
  };
}

/** Assert `finalResponse` does not contain the given substring. */
export function evaluateResponseNotContains(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "response_not_contains" }>,
): AssertionResult {
  const passed = !view.finalResponse.includes(assertion.text);
  return {
    passed,
    description: `response_not_contains(${JSON.stringify(assertion.text)})`,
    details: passed ? "text absent" : "forbidden text found",
  };
}

/** Assert `finalResponse` matches a regular expression. */
export function evaluateResponseMatches(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "response_matches" }>,
): AssertionResult {
  // Construction may throw on a malformed regex; surface that as a failure
  // rather than crashing the whole eval run.
  let passed: boolean;
  let details: string;
  try {
    const re = new RegExp(assertion.pattern, assertion.flags);
    passed = re.test(view.finalResponse);
    details = passed ? "pattern matched" : "pattern did not match";
  } catch (err) {
    passed = false;
    details = `invalid regex: ${err instanceof Error ? err.message : String(err)}`;
  }
  return {
    passed,
    description: `response_matches(/${assertion.pattern}/${assertion.flags ?? ""})`,
    details,
  };
}

// escape hatch

/**
 * Run an arbitrary user-supplied predicate against the view.
 *
 * Only available from programmatic test definition (the YAML loader cannot
 * produce functions). Catches thrown errors and reports them as failures so
 * one bad predicate doesn't take down a whole eval run.
 */
export function evaluatePredicate(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "predicate" }>,
): AssertionResult {
  let passed = false;
  let details: string;
  try {
    passed = assertion.fn(view);
    details = passed ? "predicate returned true" : "predicate returned false";
  } catch (err) {
    details = `predicate threw: ${err instanceof Error ? err.message : String(err)}`;
  }
  return {
    passed,
    description: assertion.description ?? "predicate(...)",
    details,
  };
}
