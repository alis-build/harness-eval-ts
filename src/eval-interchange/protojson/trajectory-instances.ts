/**
 * Build Vertex Trajectory*Instance protojson wire objects.
 *
 * Each trajectory metric in Vertex EvaluateInstances expects a specific
 * protobuf message. This module constructs all six instance payloads from
 * one predicted/reference pair so callers can batch-upload via JSONL.
 */

import { toProtojsonTrajectory } from "../normalize";
import type {
  ProtojsonTrajectory,
  ReferenceToolNameMode,
  TrajectoryInstancesJson,
  TrajectoryPairInstanceJson,
  TrajectorySingleToolUseInstanceJson,
} from "../../types/eval-interchange";
import type { ToolCall } from "../../types/trajectory";

type ReferenceStep = { tool_name: string; tool_input: unknown };

/**
 * Build a pair instance with predicted and reference trajectories.
 *
 * Both sides use the same `referenceToolNameMode` so wire payloads align with
 * {@link toHarnessMetrics} and Vertex EvaluateInstances sees comparable names.
 * In `"bare"` mode, MCP prefixes are stripped on predicted and reference alike.
 */
function pairInstance(
  predicted: ToolCall[],
  reference: ReferenceStep[],
  referenceToolNameMode: ReferenceToolNameMode,
): TrajectoryPairInstanceJson {
  return {
    predictedTrajectory: toProtojsonTrajectory(predicted, {
      toolNameMode: referenceToolNameMode,
    }),
    referenceTrajectory: toProtojsonTrajectory(reference, {
      toolNameMode: referenceToolNameMode,
    }),
  };
}

/**
 * Build all Trajectory*Instance payloads for one predicted/reference pair.
 *
 * Pair metrics (exact, in-order, any-order, precision, recall) share the
 * same trajectory pair; single-tool-use omits the reference trajectory
 * per Vertex API shape.
 */
export function toTrajectoryInstances(options: {
  predicted: ToolCall[];
  reference: ReferenceStep[];
  referenceToolNameMode?: ReferenceToolNameMode;
}): TrajectoryInstancesJson {
  const referenceToolNameMode = options.referenceToolNameMode ?? "harness";
  const pair = pairInstance(
    options.predicted,
    options.reference,
    referenceToolNameMode,
  );

  return {
    exactMatch: pair,
    inOrderMatch: pair,
    anyOrderMatch: pair,
    precision: pair,
    recall: pair,
    singleToolUse: {
      predictedTrajectory: pair.predictedTrajectory,
    },
  };
}

/**
 * Convert suite reference steps to cell-level protojson trajectory export.
 */
export function toReferenceTrajectory(
  reference: ReferenceStep[],
  referenceToolNameMode: ReferenceToolNameMode = "harness",
): ProtojsonTrajectory {
  return toProtojsonTrajectory(reference, { toolNameMode: referenceToolNameMode });
}

/**
 * Map a trajectory instance key to the Vertex protobuf message type name.
 *
 * Used as `messageType` in {@link InstancesJsonlRow} for EvaluateInstances batching.
 */
export function trajectoryInstanceMessageType(
  key: keyof TrajectoryInstancesJson,
): string {
  switch (key) {
    case "exactMatch":
      return "TrajectoryExactMatchInstance";
    case "inOrderMatch":
      return "TrajectoryInOrderMatchInstance";
    case "anyOrderMatch":
      return "TrajectoryAnyOrderMatchInstance";
    case "precision":
      return "TrajectoryPrecisionInstance";
    case "recall":
      return "TrajectoryRecallInstance";
    case "singleToolUse":
      return "TrajectorySingleToolUseInstance";
  }
}

export type { TrajectoryPairInstanceJson, TrajectorySingleToolUseInstanceJson };
