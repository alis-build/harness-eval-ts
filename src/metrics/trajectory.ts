/**
 * Trajectory-level metrics for comparing predicted and reference tool-call sequences.
 *
 * Aligns with Vertex AI EvaluationService trajectory metrics (exact match,
 * in-order, any-order, precision, recall, single tool use). Tool calls are
 * compared by `(tool_name, serialized tool_input)` identity after normalization.
 *
 * Binary metrics return 0 or 1; precision and recall return fractions in [0, 1].
 */

import { serializeToolInput } from "../eval-interchange/normalize";

/** Canonical wire tool call used internally for comparison. */
export interface WireToolCall {
  tool_name: string;
  tool_input: string;
}

/** All trajectory metric scores for one predicted/reference pair. */
export interface TrajectoryMetrics {
  trajectory_exact_match: number;
  trajectory_in_order_match: number;
  trajectory_any_order_match: number;
  trajectory_precision: number;
  trajectory_recall: number;
  trajectory_single_tool_use: number;
}

/** Input accepted by trajectory metrics — wire or harness/YAML shapes. */
export type TrajectoryInput =
  | WireToolCall[]
  | Array<{ tool_name: string; tool_input: unknown | string }>;

function normalizeToolCall(
  toolCall: TrajectoryInput[number],
): WireToolCall {
  if (typeof toolCall.tool_input === "string") {
    return {
      tool_name: toolCall.tool_name,
      tool_input: toolCall.tool_input,
    };
  }

  return {
    tool_name: toolCall.tool_name,
    tool_input: serializeToolInput(toolCall.tool_input),
  };
}

function normalizeTrajectory(trajectory: TrajectoryInput): WireToolCall[] {
  return trajectory.map(normalizeToolCall);
}

/** Stable composite key for multiset and equality checks. */
function toolCallKey(toolCall: WireToolCall): string {
  return `${toolCall.tool_name}\0${toolCall.tool_input}`;
}

/**
 * Count predicted tool calls that appear in reference (multiset intersection).
 *
 * Duplicate tool calls are matched one-for-one; order does not matter.
 */
function multisetIntersectionSize(
  predicted: WireToolCall[],
  reference: WireToolCall[],
): number {
  const refCounts = new Map<string, number>();
  for (const toolCall of reference) {
    const key = toolCallKey(toolCall);
    refCounts.set(key, (refCounts.get(key) ?? 0) + 1);
  }

  let matched = 0;
  for (const toolCall of predicted) {
    const key = toolCallKey(toolCall);
    const count = refCounts.get(key) ?? 0;
    if (count > 0) {
      matched += 1;
      refCounts.set(key, count - 1);
    }
  }

  return matched;
}

/**
 * Whether reference appears as a subsequence of predicted (order preserved).
 *
 * Extra predicted calls between reference steps are allowed (in-order match
 * semantics per Vertex).
 */
function isSubsequence(
  predicted: WireToolCall[],
  reference: WireToolCall[],
): boolean {
  let refIndex = 0;
  for (const toolCall of predicted) {
    if (refIndex >= reference.length) break;
    if (toolCallKey(toolCall) === toolCallKey(reference[refIndex]!)) {
      refIndex += 1;
    }
  }
  return refIndex === reference.length;
}

function arraysEqual(left: WireToolCall[], right: WireToolCall[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((toolCall, index) => {
    const other = right[index]!;
    return toolCallKey(toolCall) === toolCallKey(other);
  });
}

/** Exact sequence equality after normalization. */
export function trajectoryExactMatch(
  predicted: TrajectoryInput,
  reference: TrajectoryInput,
): number {
  const predictedNorm = normalizeTrajectory(predicted);
  const referenceNorm = normalizeTrajectory(reference);
  return arraysEqual(predictedNorm, referenceNorm) ? 1 : 0;
}

/** Reference is a subsequence of predicted (order preserved, extras allowed). */
export function trajectoryInOrderMatch(
  predicted: TrajectoryInput,
  reference: TrajectoryInput,
): number {
  const predictedNorm = normalizeTrajectory(predicted);
  const referenceNorm = normalizeTrajectory(reference);
  return isSubsequence(predictedNorm, referenceNorm) ? 1 : 0;
}

/** Same multiset of tool calls; length must match. */
export function trajectoryAnyOrderMatch(
  predicted: TrajectoryInput,
  reference: TrajectoryInput,
): number {
  const predictedNorm = normalizeTrajectory(predicted);
  const referenceNorm = normalizeTrajectory(reference);
  if (predictedNorm.length !== referenceNorm.length) return 0;

  const predictedKeys = predictedNorm.map(toolCallKey).sort();
  const referenceKeys = referenceNorm.map(toolCallKey).sort();
  return predictedKeys.every((key, index) => key === referenceKeys[index])
    ? 1
    : 0;
}

/**
 * Fraction of predicted tool calls that appear in reference (multiset).
 *
 * Returns 1 when both trajectories are empty.
 */
export function trajectoryPrecision(
  predicted: TrajectoryInput,
  reference: TrajectoryInput,
): number {
  const predictedNorm = normalizeTrajectory(predicted);
  if (predictedNorm.length === 0) return reference.length === 0 ? 1 : 0;

  const referenceNorm = normalizeTrajectory(reference);
  return multisetIntersectionSize(predictedNorm, referenceNorm) /
    predictedNorm.length;
}

/**
 * Fraction of reference tool calls matched in predicted (multiset recall).
 *
 * Returns 1 when reference is empty and predicted is empty.
 */
export function trajectoryRecall(
  predicted: TrajectoryInput,
  reference: TrajectoryInput,
): number {
  const referenceNorm = normalizeTrajectory(reference);
  if (referenceNorm.length === 0) return predicted.length === 0 ? 1 : 0;

  const predictedNorm = normalizeTrajectory(predicted);
  return multisetIntersectionSize(predictedNorm, referenceNorm) /
    referenceNorm.length;
}

/** Both trajectories have exactly one call and they match. */
export function trajectorySingleToolUse(
  predicted: TrajectoryInput,
  reference: TrajectoryInput,
): number {
  const predictedNorm = normalizeTrajectory(predicted);
  const referenceNorm = normalizeTrajectory(reference);
  if (predictedNorm.length !== 1 || referenceNorm.length !== 1) return 0;
  return toolCallKey(predictedNorm[0]!) === toolCallKey(referenceNorm[0]!)
    ? 1
    : 0;
}

/** Compute all trajectory metrics in one pass. */
export function computeTrajectoryMetrics(
  predicted: TrajectoryInput,
  reference: TrajectoryInput,
): TrajectoryMetrics {
  return {
    trajectory_exact_match: trajectoryExactMatch(predicted, reference),
    trajectory_in_order_match: trajectoryInOrderMatch(predicted, reference),
    trajectory_any_order_match: trajectoryAnyOrderMatch(predicted, reference),
    trajectory_precision: trajectoryPrecision(predicted, reference),
    trajectory_recall: trajectoryRecall(predicted, reference),
    trajectory_single_tool_use: trajectorySingleToolUse(predicted, reference),
  };
}

/**
 * Parse a wire tool_input string to JSON, or return the raw string on failure.
 *
 * Exported for tool-call metrics that need structured arg comparison.
 */
function parseToolInput(toolInput: string): unknown {
  try {
    return JSON.parse(toolInput) as unknown;
  } catch {
    return toolInput;
  }
}

export { parseToolInput };
