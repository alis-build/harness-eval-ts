/**
 * Zod schemas for Vertex protojson eval interchange types.
 */

import { z } from "zod";

import { described, field } from "./meta";

export const protojsonToolCallSchema = described(
  z.object({
    toolName: field(z.string(), "Tool name as emitted by the agent."),
    toolInput: field(
      z.string(),
      "JSON-serialized tool arguments (Vertex wire format).",
    ),
  }),
  {
    id: "ProtojsonToolCall",
    title: "ProtojsonToolCall",
    description: "Tool call in Vertex EvaluationService wire format.",
  },
);

export const protojsonTrajectorySchema = described(
  z.object({
    toolCalls: field(
      z.array(protojsonToolCallSchema),
      "Ordered tool calls in the trajectory.",
    ),
  }),
  {
    id: "ProtojsonTrajectory",
    title: "ProtojsonTrajectory",
    description: "Vertex Trajectory message wire format.",
  },
);

export const instanceDataSchema = described(
  z.object({
    text: field(z.string().optional(), "Plain text instance data."),
  }),
  {
    id: "InstanceData",
    title: "InstanceData",
    description: "EvaluationInstance prompt/response/reference text wrapper.",
  },
);

export const evaluationInstanceJsonSchema = described(
  z.object({
    prompt: field(instanceDataSchema.optional(), "Eval prompt."),
    response: field(instanceDataSchema.optional(), "Final agent response."),
    reference: field(instanceDataSchema.optional(), "Reference answer text."),
  }),
  {
    id: "EvaluationInstanceJson",
    title: "EvaluationInstanceJson",
    description:
      "Vertex EvaluationInstance wire format (agentEvalData omitted in v1).",
  },
);

export const trajectoryPairInstanceSchema = described(
  z.object({
    predictedTrajectory: field(
      protojsonTrajectorySchema,
      "Predicted tool-call trajectory.",
    ),
    referenceTrajectory: field(
      protojsonTrajectorySchema,
      "Reference tool-call trajectory.",
    ),
  }),
  {
    id: "TrajectoryPairInstanceJson",
    title: "TrajectoryPairInstanceJson",
    description: "Shared shape for Trajectory*Match/Precision/Recall instances.",
  },
);

export const trajectorySingleToolUseInstanceSchema = described(
  z.object({
    predictedTrajectory: field(
      protojsonTrajectorySchema,
      "Predicted tool-call trajectory.",
    ),
  }),
  {
    id: "TrajectorySingleToolUseInstanceJson",
    title: "TrajectorySingleToolUseInstanceJson",
    description: "Vertex TrajectorySingleToolUseInstance wire format.",
  },
);

export const trajectoryInstancesJsonSchema = described(
  z.object({
    exactMatch: field(trajectoryPairInstanceSchema.optional(), "Exact match instance."),
    inOrderMatch: field(
      trajectoryPairInstanceSchema.optional(),
      "In-order match instance.",
    ),
    anyOrderMatch: field(
      trajectoryPairInstanceSchema.optional(),
      "Any-order match instance.",
    ),
    precision: field(trajectoryPairInstanceSchema.optional(), "Precision instance."),
    recall: field(trajectoryPairInstanceSchema.optional(), "Recall instance."),
    singleToolUse: field(
      trajectorySingleToolUseInstanceSchema.optional(),
      "Single tool use instance.",
    ),
  }),
  {
    id: "TrajectoryInstancesJson",
    title: "TrajectoryInstancesJson",
    description: "Vertex Trajectory*Instance messages keyed by metric.",
  },
);

export const harnessMetricsSchema = described(
  z.object({
    trajectoryExactMatch: field(z.number(), "Exact trajectory match score (0 or 1)."),
    trajectoryInOrderMatch: field(
      z.number(),
      "In-order trajectory match score (0 or 1).",
    ),
    trajectoryAnyOrderMatch: field(
      z.number(),
      "Any-order trajectory match score (0 or 1).",
    ),
    trajectoryPrecision: field(z.number(), "Trajectory precision (0..1)."),
    trajectoryRecall: field(z.number(), "Trajectory recall (0..1)."),
    trajectorySingleToolUse: field(
      z.number(),
      "Single-tool-use match score (0 or 1).",
    ),
  }),
  {
    id: "HarnessMetrics",
    title: "HarnessMetrics",
    description: "Harness-precomputed trajectory metric scores.",
  },
);

export const evalDatasetRowSchema = described(
  z.object({
    caseId: field(z.string(), "Test case id."),
    repetitionIndex: field(z.number().int(), "Repetition index."),
    prompt: field(z.string().optional(), "Eval prompt sent to the agent."),
    response: field(z.string().optional(), "Final agent response text."),
    evaluationInstance: field(
      evaluationInstanceJsonSchema.optional(),
      "Vertex EvaluationInstance wire object.",
    ),
    latencySeconds: field(z.number(), "Session latency in seconds."),
    failure: field(
      z.union([z.literal(0), z.literal(1)]),
      "1 when the harness run failed, 0 on success.",
    ),
    humanRatings: field(
      z.record(z.string(), z.number()).optional(),
      "Human ratings keyed by metric name for judge calibration.",
    ),
  }),
  {
    id: "EvalDatasetRow",
    title: "EvalDatasetRow",
    description: "Flattened row for trajectory projection JSONL.",
  },
);

export const instancesJsonlRowSchema = described(
  z.object({
    messageType: field(z.string(), "Vertex protobuf message type name."),
    caseId: field(z.string(), "Test case id."),
    repetitionIndex: field(z.number().int(), "Repetition index."),
    instance: field(
      z.union([
        trajectoryPairInstanceSchema,
        trajectorySingleToolUseInstanceSchema,
        evaluationInstanceJsonSchema,
      ]),
      "Protojson instance payload.",
    ),
  }),
  {
    id: "InstancesJsonlRow",
    title: "InstancesJsonlRow",
    description: "Type-tagged JSONL row for Vertex EvaluateInstances batching.",
  },
);

export type ProtojsonToolCallZod = z.infer<typeof protojsonToolCallSchema>;
export type ProtojsonTrajectoryZod = z.infer<typeof protojsonTrajectorySchema>;
export type EvaluationInstanceJsonZod = z.infer<typeof evaluationInstanceJsonSchema>;
export type TrajectoryInstancesJsonZod = z.infer<typeof trajectoryInstancesJsonSchema>;
export type HarnessMetricsZod = z.infer<typeof harnessMetricsSchema>;
export type EvalDatasetRowZod = z.infer<typeof evalDatasetRowSchema>;
export type InstancesJsonlRowZod = z.infer<typeof instancesJsonlRowSchema>;
