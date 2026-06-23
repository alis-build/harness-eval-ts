/**
 * OpenTelemetry export — public API.
 *
 * Maps {@link TrajectoryView} to OTLP/HTTP JSON using GenAI semantic
 * conventions. Assertions continue to use TrajectoryView directly; OTel
 * export is for observability backends and interchange tooling.
 */

export { trajectoryToOtlp, emitOtel, traceIdFromSession, spanIdFromKey } from "./emitter";
export type {
  EmitOtelOptions,
  ExportTraceServiceRequest,
  ResourceSpans,
  Span,
} from "./types";
