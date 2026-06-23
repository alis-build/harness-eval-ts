/**
 * Public exports for trajectory and tool-call eval metrics.
 *
 * Metrics align with Vertex AI EvaluationService trajectory definitions.
 * Import from here for envelope enrichment, custom reporters, or tests.
 */

export {
  computeTrajectoryMetrics,
  trajectoryAnyOrderMatch,
  trajectoryExactMatch,
  trajectoryInOrderMatch,
  trajectoryPrecision,
  trajectoryRecall,
  trajectorySingleToolUse,
} from "./trajectory";

export {
  computeToolCallMetrics,
  toolCallValid,
  toolNameMatch,
  toolParameterKeyMatch,
  toolParameterKvMatch,
} from "./tool-calls";

export type { ToolCallMetricOptions } from "./tool-calls";
export type { TrajectoryInput } from "./trajectory";
