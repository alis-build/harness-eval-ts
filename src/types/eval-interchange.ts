/**
 * Vertex AI EvaluationService protojson wire types for eval interchange.
 *
 * These types mirror the JSON shape produced by protobuf's protojson encoding
 * for Vertex trajectory and evaluation instance messages. Field names use
 * camelCase (protojson default) rather than harness-eval's snake_case YAML.
 *
 * The interchange layer (`src/eval-interchange/`) converts harness
 * {@link TrajectoryView} and suite reference trajectories into these wire
 * objects so envelopes can be fed to Vertex EvaluateInstances without a second
 * transformation step.
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/evaluation
 */

/** How suite reference tool names are normalized before protojson export. */
export type ReferenceToolNameMode = "harness" | "bare";

/**
 * Suite YAML reference trajectory block.
 *
 * When `tool_name_mode` is `"bare"`, MCP-style names are stripped to the suffix
 * after the last `__` on both predicted and reference trajectories before
 * metrics and Vertex instance export.
 */
export interface ReferenceTrajectoryConfig {
  tool_name_mode?: ReferenceToolNameMode;
  steps: Array<{ tool_name: string; tool_input: unknown }>;
}

/** One tool call in Vertex Trajectory protojson wire format. */
export interface ProtojsonToolCall {
  toolName: string;
  /** JSON-serialized tool arguments string (not a parsed object). */
  toolInput: string;
}

/** Ordered tool-call sequence in Vertex Trajectory wire format. */
export interface ProtojsonTrajectory {
  toolCalls: ProtojsonToolCall[];
}

/** Text wrapper for EvaluationInstance prompt/response/reference fields. */
export interface InstanceData {
  text?: string;
}

/**
 * Vertex EvaluationInstance protojson wire object.
 *
 * Used for prompt/response grading and as a lightweight row in trajectory
 * projection JSONL. `agentEvalData` is omitted in v1.
 */
export interface EvaluationInstanceJson {
  prompt?: InstanceData;
  response?: InstanceData;
  reference?: InstanceData;
}

/**
 * Vertex Trajectory*Instance messages keyed by metric name.
 *
 * Each key maps to the instance payload expected by EvaluateInstances for
 * that metric. Pair metrics share {@link TrajectoryPairInstanceJson}; single
 * tool use uses {@link TrajectorySingleToolUseInstanceJson}.
 */
export interface TrajectoryInstancesJson {
  exactMatch?: TrajectoryPairInstanceJson;
  inOrderMatch?: TrajectoryPairInstanceJson;
  anyOrderMatch?: TrajectoryPairInstanceJson;
  precision?: TrajectoryPairInstanceJson;
  recall?: TrajectoryPairInstanceJson;
  singleToolUse?: TrajectorySingleToolUseInstanceJson;
}

/** Shared shape for trajectory match, precision, and recall instances. */
export interface TrajectoryPairInstanceJson {
  predictedTrajectory: ProtojsonTrajectory;
  referenceTrajectory: ProtojsonTrajectory;
}

/** Vertex TrajectorySingleToolUseInstance — predicted trajectory only. */
export interface TrajectorySingleToolUseInstanceJson {
  predictedTrajectory: ProtojsonTrajectory;
}

/**
 * Harness-precomputed trajectory metric scores in camelCase.
 *
 * Values mirror {@link computeTrajectoryMetrics} output but use Vertex-style
 * field names for interchange with external dashboards.
 */
export interface HarnessMetrics {
  trajectoryExactMatch: number;
  trajectoryInOrderMatch: number;
  trajectoryAnyOrderMatch: number;
  trajectoryPrecision: number;
  trajectoryRecall: number;
  trajectorySingleToolUse: number;
}

/** Keys of {@link TrajectoryInstancesJson} that carry instance payloads. */
export type TrajectoryInstanceMetricKey = keyof TrajectoryInstancesJson;

/**
 * One JSONL row for Vertex EvaluateInstances batch upload.
 *
 * `messageType` is the protobuf message name (e.g. `TrajectoryExactMatchInstance`).
 */
export interface InstancesJsonlRow {
  messageType: string;
  caseId: string;
  repetitionIndex: number;
  instance: TrajectoryPairInstanceJson | TrajectorySingleToolUseInstanceJson | EvaluationInstanceJson;
}

/**
 * Flattened eval row for trajectory projection JSONL.
 *
 * One row per repetition — suitable for BigQuery or custom analytics pipelines
 * without nesting under envelope cells.
 */
export interface EvalDatasetRow {
  caseId: string;
  repetitionIndex: number;
  prompt?: string;
  response?: string;
  evaluationInstance?: EvaluationInstanceJson;
  /** Session latency in seconds (Vertex convention). */
  latencySeconds: number;
  /** 1 when the harness run failed, 0 on success. */
  failure: 0 | 1;
  humanRatings?: Record<string, number>;
}
