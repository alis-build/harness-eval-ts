/**
 * Deserialize harness-eval protojson fixtures via @google-cloud/aiplatform
 * protobuf types (validation-only; not shipped in the npm package).
 *
 * Used by eval-interchange tests to verify that envelope protojson fields
 * round-trip through Vertex protobuf deserializers without schema drift.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { protos } from "@google-cloud/aiplatform";

const v1beta1 = protos.google.cloud.aiplatform.v1beta1;

/** Vertex protobuf message types exercised by protojson interchange tests. */
export type ProtojsonMessageType =
  | "EvaluationInstance"
  | "Trajectory"
  | "TrajectoryExactMatchInstance"
  | "TrajectoryInOrderMatchInstance"
  | "TrajectoryAnyOrderMatchInstance"
  | "TrajectoryPrecisionInstance"
  | "TrajectoryRecallInstance"
  | "TrajectorySingleToolUseInstance";

const DESERIALIZERS: Record<
  ProtojsonMessageType,
  (value: Record<string, unknown>) => unknown
> = {
  EvaluationInstance: (value) => v1beta1.EvaluationInstance.fromObject(value),
  Trajectory: (value) => v1beta1.Trajectory.fromObject(value),
  TrajectoryExactMatchInstance: (value) =>
    v1beta1.TrajectoryExactMatchInstance.fromObject(value),
  TrajectoryInOrderMatchInstance: (value) =>
    v1beta1.TrajectoryInOrderMatchInstance.fromObject(value),
  TrajectoryAnyOrderMatchInstance: (value) =>
    v1beta1.TrajectoryAnyOrderMatchInstance.fromObject(value),
  TrajectoryPrecisionInstance: (value) =>
    v1beta1.TrajectoryPrecisionInstance.fromObject(value),
  TrajectoryRecallInstance: (value) =>
    v1beta1.TrajectoryRecallInstance.fromObject(value),
  TrajectorySingleToolUseInstance: (value) =>
    v1beta1.TrajectorySingleToolUseInstance.fromObject(value),
};

/**
 * Deserialize a protojson object through the matching Vertex protobuf type.
 *
 * @throws When protojson shape does not match the protobuf schema.
 */
export function deserializeProtojsonFixture(
  messageType: ProtojsonMessageType,
  value: Record<string, unknown>,
): unknown {
  const deserialize = DESERIALIZERS[messageType];
  return deserialize(value);
}

/**
 * Load a golden protojson fixture from `tests/fixtures/protojson/`.
 *
 * Fixture filenames use kebab-case derived from the message type name.
 */
export async function loadProtojsonFixture(
  messageType: ProtojsonMessageType,
): Promise<Record<string, unknown>> {
  const fixturePath = join(
    import.meta.dirname,
    "../fixtures/protojson",
    `${kebabCase(messageType)}.json`,
  );
  const text = await readFile(fixturePath, "utf8");
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Round-trip a protojson object through deserialize → toJSON.
 *
 * Catches field naming or type coercion bugs that pass JSON.parse alone.
 */
export function roundTripProtojsonFixture(
  messageType: ProtojsonMessageType,
  value: Record<string, unknown>,
): Record<string, unknown> {
  const message = deserializeProtojsonFixture(messageType, value) as {
    toJSON: () => Record<string, unknown>;
  };
  return message.toJSON();
}

/** Convert PascalCase message type to kebab-case fixture filename. */
function kebabCase(messageType: ProtojsonMessageType): string {
  return messageType
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}
