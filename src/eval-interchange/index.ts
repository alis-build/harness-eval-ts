/**
 * Public exports for Vertex protojson eval interchange.
 *
 * Re-exports normalization, enrichment, protojson builders, and envelope
 * projection helpers. Import from here rather than deep paths when wiring
 * interchange into CLI or external integrations.
 */

export {
  normalizeReferenceToolName,
  serializeToolInput,
  toProtojsonTrajectory,
} from "./normalize";

export { enrichRepetitionWithProtojson, predictedToolCalls } from "./enrich";

export { toEvaluationInstance } from "./protojson/evaluation-instance";
export {
  toHarnessMetrics,
} from "./protojson/harness-metrics";
export {
  toReferenceTrajectory,
  toTrajectoryInstances,
  trajectoryInstanceMessageType,
} from "./protojson/trajectory-instances";

export {
  listTrajectoryInstanceKeys,
  repetitionToDatasetRow,
  repetitionToInstanceRows,
  toInstancesJsonl,
  toTrajectory,
} from "./projections";
