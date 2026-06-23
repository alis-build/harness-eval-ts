/**
 * Tool-call assertion evaluators.
 *
 * These assertions query the `toolCalls` array on the trajectory view:
 * presence, cardinality, ordering, and argument matching.
 *
 * Ordering is done on `turnIndex`, not wall-clock time. Parallel tool calls
 * within a single assistant turn share a turnIndex, which means "A came
 * before B" requires A's turn to *strictly precede* B's turn — calls within
 * the same turn are considered unordered. This is the right default
 * because Claude Code dispatches parallel calls concurrently and the
 * wall-clock ordering is non-deterministic.
 */

import type { Assertion, AssertionResult } from "../types/assertions";
import type { ToolCall, TrajectoryView } from "../types/trajectory";
import { describeCardinality, parseCardinality } from "./cardinality";
import { describePattern, toolMatches } from "./patterns";
import { matches as predicateMatches } from "./predicates";

// presence

export function evaluateCalled(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "called" }>,
): AssertionResult {
  const matching = view.toolCalls.filter((c) =>
    toolMatches(c.name, assertion.tool),
  );
  const check = parseCardinality(assertion.times);
  const passed = check(matching.length);

  return {
    passed,
    description: `called(${describePattern(assertion.tool)}, ${describeCardinality(assertion.times)})`,
    details: passed
      ? `found ${matching.length} matching call(s)`
      : `found ${matching.length} call(s), expected ${describeCardinality(assertion.times)}`,
    matches: matching,
  };
}

export function evaluateNotCalled(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "not_called" }>,
): AssertionResult {
  const matching = view.toolCalls.filter((c) =>
    toolMatches(c.name, assertion.tool),
  );
  const passed = matching.length === 0;

  return {
    passed,
    description: `not_called(${describePattern(assertion.tool)})`,
    details: passed
      ? "no matching calls"
      : `found ${matching.length} forbidden call(s)`,
    matches: matching,
  };
}

export function evaluateCalledAnyOf(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "called_any_of" }>,
): AssertionResult {
  const allMatches: ToolCall[] = [];
  for (const pattern of assertion.tools) {
    allMatches.push(
      ...view.toolCalls.filter((c) => toolMatches(c.name, pattern)),
    );
  }
  const passed = allMatches.length > 0;
  return {
    passed,
    description: `called_any_of(${assertion.tools.map(describePattern).join(", ")})`,
    details: passed
      ? `${allMatches.length} matching call(s)`
      : "no calls matched any pattern",
    matches: allMatches,
  };
}

export function evaluateCalledAllOf(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "called_all_of" }>,
): AssertionResult {
  const perPattern = assertion.tools.map((p) => ({
    pattern: p,
    matches: view.toolCalls.filter((c) => toolMatches(c.name, p)),
  }));
  const missing = perPattern.filter((p) => p.matches.length === 0);
  const passed = missing.length === 0;

  return {
    passed,
    description: `called_all_of(${assertion.tools.map(describePattern).join(", ")})`,
    details: passed
      ? "all patterns matched"
      : `missing: ${missing.map((m) => describePattern(m.pattern)).join(", ")}`,
    matches: perPattern.flatMap((p) => p.matches),
  };
}

// ordering

export function evaluateCalledBefore(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "called_before" }>,
): AssertionResult {
  const firsts = view.toolCalls.filter((c) =>
    toolMatches(c.name, assertion.first),
  );
  const thens = view.toolCalls.filter((c) =>
    toolMatches(c.name, assertion.then),
  );
  const desc = `called_before(${describePattern(assertion.first)} → ${describePattern(assertion.then)})`;

  if (firsts.length === 0) {
    return {
      passed: false,
      description: desc,
      details: `no calls matching first`,
    };
  }
  if (thens.length === 0) {
    return {
      passed: false,
      description: desc,
      details: `no calls matching then`,
    };
  }

  // Earliest occurrence of each side, by turn. Strictly less than = "before".
  const earliestFirst = Math.min(...firsts.map((c) => c.turnIndex));
  const earliestThen = Math.min(...thens.map((c) => c.turnIndex));
  const passed = earliestFirst < earliestThen;

  return {
    passed,
    description: desc,
    details: passed
      ? `first @ turn ${earliestFirst}, then @ turn ${earliestThen}`
      : `first @ turn ${earliestFirst}, then @ turn ${earliestThen} (not before)`,
    matches: [...firsts, ...thens],
  };
}

export function evaluateSequence(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "sequence" }>,
): AssertionResult {
  const { tools, strict = false } = assertion;
  const desc = `sequence([${tools.map(describePattern).join(" → ")}]${strict ? ", strict" : ""})`;

  if (tools.length === 0) {
    return {
      passed: true,
      description: desc,
      details: "empty sequence trivially matches",
    };
  }

  if (strict) {
    // Strict: the tools must appear in exact order with no other tool calls
    // interleaved. We look for a contiguous subsequence of the right shape.
    if (view.toolCalls.length < tools.length) {
      return {
        passed: false,
        description: desc,
        details: "not enough tool calls",
      };
    }
    for (
      let start = 0;
      start <= view.toolCalls.length - tools.length;
      start++
    ) {
      let ok = true;
      for (let i = 0; i < tools.length; i++) {
        if (!toolMatches(view.toolCalls[start + i].name, tools[i])) {
          ok = false;
          break;
        }
      }
      if (ok) {
        return {
          passed: true,
          description: desc,
          details: `matched at positions ${start}..${start + tools.length - 1}`,
          matches: view.toolCalls.slice(start, start + tools.length),
        };
      }
    }
    return { passed: false, description: desc, details: "no contiguous match" };
  }

  // Non-strict: tools must appear in order, interleaved calls allowed.
  // Walk the tool call list once, advancing the sequence pointer on each match.
  let idx = 0;
  const matched: ToolCall[] = [];
  for (const call of view.toolCalls) {
    if (idx < tools.length && toolMatches(call.name, tools[idx])) {
      matched.push(call);
      idx++;
    }
  }
  const passed = idx === tools.length;
  return {
    passed,
    description: desc,
    details: passed ? "matched in order" : `matched ${idx}/${tools.length}`,
    matches: matched,
  };
}

// arguments

export function evaluateCalledWith(
  view: TrajectoryView,
  assertion: Extract<Assertion, { type: "called_with" }>,
): AssertionResult {
  const candidates = view.toolCalls.filter((c) =>
    toolMatches(c.name, assertion.tool),
  );
  const matching = candidates.filter((c) =>
    predicateMatches(c.args, assertion.args),
  );
  const passed = matching.length > 0;

  let details: string;
  if (passed) {
    details = `${matching.length} call(s) with matching args`;
  } else if (candidates.length === 0) {
    details = `no calls to ${describePattern(assertion.tool)} at all`;
  } else {
    details = `${candidates.length} call(s) but none with matching args`;
  }

  return {
    passed,
    description: `called_with(${describePattern(assertion.tool)}, args matching predicate)`,
    details,
    matches: matching,
  };
}
