/**
 * Trajectory-level metrics for comparing predicted and reference tool-call sequences.
 *
 * Metric definitions align with upstream evaluation service trajectory specs.
 */

import type {
  InterchangeToolCall,
  TabularToolCall,
  TrajectoryMetrics,
} from "../types/eval-interchange";
import { serializeToolInput } from "../eval-interchange/build";

export type TrajectoryInput =
  | InterchangeToolCall[]
  | TabularToolCall[]
  | Array<{ tool_name: string; tool_input: unknown }>;

function normalizeToolCall(
  toolCall: TrajectoryInput[number],
): InterchangeToolCall {
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

function normalizeTrajectory(trajectory: TrajectoryInput): InterchangeToolCall[] {
  return trajectory.map(normalizeToolCall);
}

function toolCallKey(toolCall: InterchangeToolCall): string {
  return `${toolCall.tool_name}\0${toolCall.tool_input}`;
}

function multisetIntersectionSize(
  predicted: InterchangeToolCall[],
  reference: InterchangeToolCall[],
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

function isSubsequence(
  predicted: InterchangeToolCall[],
  reference: InterchangeToolCall[],
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

function arraysEqual(
  left: InterchangeToolCall[],
  right: InterchangeToolCall[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((toolCall, index) => {
    const other = right[index]!;
    return toolCallKey(toolCall) === toolCallKey(other);
  });
}

export function trajectoryExactMatch(
  predicted: TrajectoryInput,
  reference: TrajectoryInput,
): number {
  const predictedNorm = normalizeTrajectory(predicted);
  const referenceNorm = normalizeTrajectory(reference);
  return arraysEqual(predictedNorm, referenceNorm) ? 1 : 0;
}

export function trajectoryInOrderMatch(
  predicted: TrajectoryInput,
  reference: TrajectoryInput,
): number {
  const predictedNorm = normalizeTrajectory(predicted);
  const referenceNorm = normalizeTrajectory(reference);
  return isSubsequence(predictedNorm, referenceNorm) ? 1 : 0;
}

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
