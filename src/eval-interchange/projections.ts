/**
 * Envelope projection methods for Vertex protojson interchange output.
 *
 * Flatten a nested {@link EvalRunEnvelope} into JSONL-friendly rows for:
 *
 *   - `trajectory` projection — one {@link EvalDatasetRow} per repetition
 *   - `instances` projection — one {@link InstancesJsonlRow} per trajectory metric
 *
 * Used by `harness-eval envelope --projection trajectory|instances`.
 */

import type {
  EvalDatasetRow,
  InstancesJsonlRow,
  TrajectoryInstanceMetricKey,
  TrajectoryInstancesJson,
} from "../types/eval-interchange";
import type {
  EvalCellResult,
  EvalRepetition,
  EvalRunEnvelope,
} from "../types/eval-record";
import { trajectoryInstanceMessageType } from "./protojson/trajectory-instances";

/** Trajectory instance keys emitted in stable order for JSONL export. */
const TRAJECTORY_INSTANCE_KEYS: TrajectoryInstanceMetricKey[] = [
  "exactMatch",
  "inOrderMatch",
  "anyOrderMatch",
  "precision",
  "recall",
  "singleToolUse",
];

/**
 * Flatten one repetition into a trajectory dataset row.
 *
 * Pulls prompt from the cell, response from evaluationInstance, and falls
 * back to duration-based latency when enrich did not set latencySeconds.
 */
export function repetitionToDatasetRow(
  cell: EvalCellResult,
  repetition: EvalRepetition,
): EvalDatasetRow {
  return {
    caseId: cell.caseId,
    repetitionIndex: repetition.repetitionIndex,
    prompt: cell.prompt,
    response: repetition.evaluationInstance?.response?.text,
    evaluationInstance: repetition.evaluationInstance,
    latencySeconds: repetition.latencySeconds ?? repetition.durationMs / 1000,
    failure: repetition.failure ?? (repetition.trajectory?.success ? 0 : 1),
    humanRatings: cell.humanRatings,
  };
}

/**
 * Expand one repetition into type-tagged instance rows for EvaluateInstances.
 *
 * Returns an empty array when the repetition has no reference trajectory
 * (and therefore no trajectoryInstances block).
 */
export function repetitionToInstanceRows(
  cell: EvalCellResult,
  repetition: EvalRepetition,
): InstancesJsonlRow[] {
  if (!repetition.trajectoryInstances) return [];

  const rows: InstancesJsonlRow[] = [];
  for (const key of TRAJECTORY_INSTANCE_KEYS) {
    const instance = repetition.trajectoryInstances[key];
    if (!instance) continue;

    rows.push({
      messageType: trajectoryInstanceMessageType(key),
      caseId: cell.caseId,
      repetitionIndex: repetition.repetitionIndex,
      instance,
    });
  }

  return rows;
}

/**
 * Trajectory projection — all repetitions in the envelope as dataset rows.
 */
export function toTrajectory(envelope: EvalRunEnvelope): EvalDatasetRow[] {
  const rows: EvalDatasetRow[] = [];
  for (const cell of envelope.cells) {
    for (const repetition of cell.repetitions) {
      rows.push(repetitionToDatasetRow(cell, repetition));
    }
  }
  return rows;
}

/**
 * Instances projection — all trajectory metric instances as JSONL rows.
 */
export function toInstancesJsonl(envelope: EvalRunEnvelope): InstancesJsonlRow[] {
  const rows: InstancesJsonlRow[] = [];
  for (const cell of envelope.cells) {
    for (const repetition of cell.repetitions) {
      rows.push(...repetitionToInstanceRows(cell, repetition));
    }
  }
  return rows;
}

/** Return which trajectory metric keys are populated on an instances block. */
export function listTrajectoryInstanceKeys(
  instances: TrajectoryInstancesJson,
): TrajectoryInstanceMetricKey[] {
  return TRAJECTORY_INSTANCE_KEYS.filter((key) => instances[key] !== undefined);
}
