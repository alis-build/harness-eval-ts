/**
 * Cross-harness eval record contract for storage, CI/CD, and external judges.
 */

import type { AdapterDiagnostics } from "../adapters/types";
import type { GradedExpectation, GradingSummary } from "../grader/types";
import type {
  EvaluationInstanceJson,
  HarnessMetrics,
  ProtojsonTrajectory,
  TrajectoryInstancesJson,
} from "./eval-interchange";
import type { AssertionResult } from "./assertions";
import type { TrajectoryView } from "./trajectory";

/** Schema version for {@link EvalRunEnvelope} JSON documents. */
export const EVAL_RUN_SCHEMA_VERSION = "1.0";

/** Schema version embedded in each {@link TrajectoryView} at export time. */
export const TRAJECTORY_SCHEMA_VERSION = "1.0";

/** Link to the suite spec that produced a run. */
export interface SuiteReference {
  uri?: string;
  id?: string;
  contentHash?: string;
}

/** Harness that executed the run. */
export interface HarnessInfo {
  adapter: string;
  frameworkVersion?: string;
  harnessVersion?: string;
}

/** CI, git, or runtime provenance for correlation in the DB. */
export interface EvalProvenance {
  runId?: string;
  ci?: {
    provider?: string;
    jobId?: string;
    pipelineId?: string;
    url?: string;
  };
  git?: {
    commit?: string;
    branch?: string;
    repository?: string;
  };
  pluginVersion?: string;
  triggeredBy?: string;
  [key: string]: unknown;
}

/** Aggregate behavioral summary for the run. */
export interface EvalRunSummary {
  cellsTotal: number;
  cellsPassed: number;
  behavioralPass: boolean;
  outcomePass?: boolean;
}

/** Identity of the judge that produced outcome grades. */
export interface JudgeInfo {
  id: string;
  model?: string;
  version?: string;
}

/** Outcome grades for one repetition (built-in or external judge). */
export interface OutcomeGrades {
  judge: JudgeInfo;
  expectations: GradedExpectation[];
  summary: GradingSummary;
  evalFeedback?: {
    suggestions: Array<{ assertion?: string; reason: string }>;
    overall: string;
  };
  error?: string;
}

/** Score from an external eval framework (LangSmith, Braintrust, custom). */
export interface ExternalScore {
  source: string;
  metric: string;
  value: number | boolean | string;
  metadata?: Record<string, unknown>;
}

/** Optional large or vendor-specific blobs (store by reference in DB when possible). */
export interface EvalArtifacts {
  rawStreamEvents?: unknown[];
  otlpTraceUri?: string;
  transcript?: string;
}

/** One harness invocation — the unit external judges and trajectory queries use. */
export interface EvalRepetition {
  repetitionIndex: number;
  durationMs: number;
  trajectory?: TrajectoryView & { schemaVersion: string };
  diagnostics?: Partial<AdapterDiagnostics>;
  assertionResults: AssertionResult[];
  outcomeGrades?: OutcomeGrades;
  externalScores?: ExternalScore[];
  artifacts?: EvalArtifacts;

  /** Vertex EvaluationInstance protojson wire object. */
  evaluationInstance?: EvaluationInstanceJson;

  /** Vertex Trajectory*Instance protojson wire objects keyed by metric. */
  trajectoryInstances?: TrajectoryInstancesJson;

  /** Harness-precomputed trajectory metric scores (camelCase). */
  harnessMetrics?: HarnessMetrics;

  latencySeconds?: number;
  failure?: 0 | 1;

  error?: {
    message: string;
    diagnostics?: Partial<AdapterDiagnostics>;
  };
}

/** Behavioral stats for one assertion across repetitions in a cell. */
export interface EvalAssertionStat {
  description: string;
  threshold: number;
  passedCount: number;
  evaluatedCount: number;
  passRate: number;
  meetsThreshold: boolean;
}

/** One (test case × matrix cell) result. */
export interface EvalCellResult {
  caseId: string;
  category?: string;
  notes?: string;
  prompt?: string;
  expectations?: string[];
  cellLabel: string;
  axes?: Record<string, string>;
  /** Reference trajectory in Vertex protojson wire format. */
  referenceTrajectory?: ProtojsonTrajectory;
  humanRatings?: Record<string, number>;
  assertionStats: EvalAssertionStat[];
  adapterErrors: number;
  behavioralPass: boolean;
  outcomePass?: boolean;
  repetitions: EvalRepetition[];
}

/** Top-level document for CI/CD pipelines, APIs, and databases. */
export interface EvalRunEnvelope {
  schemaVersion: typeof EVAL_RUN_SCHEMA_VERSION;
  runId: string;
  startedAt: string;
  durationMs: number;
  suite?: SuiteReference;
  harness: HarnessInfo;
  provenance?: EvalProvenance;
  summary: EvalRunSummary;
  cells: EvalCellResult[];
}

export interface BuildEvalRunEnvelopeOptions {
  /** Override envelope runId; defaults to a random UUID. */
  runId?: string;
  /** Link to the suite YAML that produced the run. */
  suite?: SuiteReference;
  /** Harness adapter metadata; adapter defaults to `"claude-code"`. */
  harness?: Partial<HarnessInfo>;
  /** CI, git, and runtime provenance for correlation. */
  provenance?: EvalProvenance;
  /** Outcome grades to merge from a grader run. */
  grading?: {
    gradedAt?: string;
    sourceReport?: string;
    results: Array<{
      caseId: string;
      cellLabel: string;
      repetitionIndex: number;
      expectations: GradedExpectation[];
      summary: GradingSummary;
      evalFeedback?: OutcomeGrades["evalFeedback"];
      graderError?: string;
      durationMs?: number;
    }>;
    judge?: JudgeInfo;
  };
  /** Include text transcript artifact (default true). */
  includeTranscript?: boolean;
  /** Include raw stream-json events (default false; debug only). */
  includeRawStreamEvents?: boolean;
}
