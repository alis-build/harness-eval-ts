/**
 * Public API for @alis-build/harness-eval.
 */

export * from "./types/index";

export { TrajectoryBuilder, buildTrajectory } from "./trajectory/builder";

export { parseStreamJson, type ParseResult } from "./parsers/stream-json";

export { evaluate, evaluateAll } from "./assertions/evaluator";

export type {
  AdapterDiagnostics,
  AdapterResult,
  BaseAdapterConfig,
  HarnessAdapter,
  ParseErrorRecord,
  SuiteConfig,
} from "./adapters/types";
export { AdapterError } from "./adapters/types";
export {
  DEFAULT_ADAPTER_ID,
  getAdapter,
  getDefaultAdapter,
  listAdapters,
  registerAdapter,
} from "./adapters/registry";

export * as claudeCode from "./adapters/claude-code/index";

export * from "./runner/types";
export { runSuite } from "./runner/suite";
export {
  aggregateCell,
  DEFAULT_REPETITIONS,
  DEFAULT_THRESHOLD,
  getRepetitions,
  mergeConfig,
  runRepetition,
  type AdapterRunFn,
} from "./runner/case";
export { createLimit, type LimitedRunner } from "./runner/limit";

export { ConfigError, loadSuite, parseSuite } from "./config/loader";

export { trajectoryToOtlp, emitOtel } from "./otel/index";
export type { EmitOtelOptions, ExportTraceServiceRequest } from "./otel/index";

export {
  gradeReport,
  trajectoryToTranscript,
  createClaudeGrader,
  formatGradingConsole,
  resolveGradeOptions,
  gradingReportPassed,
} from "./grader/index";
export type {
  GradeReportOptions,
  SuiteGradingReport,
  RepGradingResult,
} from "./grader/index";

export { formatReport, type ReporterOptions } from "./reporter/index";

export {
  buildEvalRunEnvelope,
  buildEvalRunEnvelopeFromFiles,
} from "./eval-record/index";
export {
  toTrajectory,
  toProtoInstances,
  toAgentTrace,
  enrichRepetitionWithInterchange,
} from "./eval-interchange/index";
export * from "./metrics/index";
export {
  EVAL_RUN_SCHEMA_VERSION,
  TRAJECTORY_SCHEMA_VERSION,
} from "./types/eval-record";
