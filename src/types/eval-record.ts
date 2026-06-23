/**
 * Cross-harness eval record contract for storage, CI/CD, and external judges.
 *
 * Layering:
 *   - {@link TrajectoryView} — canonical harness session (adapter output)
 *   - {@link EvalRunEnvelope} — full run for DB / pipelines
 *   - Optional artifacts — vendor-specific raw streams, OTLP traces
 *
 * @see docs/eval-record.md
 * @see schemas/eval-run-envelope.schema.json
 */

import type { AdapterDiagnostics } from "../adapters/types";
import type { GradedExpectation, GradingSummary } from "../grader/types";
import type {
  AgentTrace,
  InterchangeToolCall,
  TabularToolCall,
  ToolCallMetrics,
  TrajectoryMetrics,
} from "./eval-interchange";
import type { AssertionResult } from "./assertions";
import type { TrajectoryView } from "./trajectory";

/** Schema version for {@link EvalRunEnvelope} JSON documents. */
export const EVAL_RUN_SCHEMA_VERSION = "1.0";

/** Schema version embedded in each {@link TrajectoryView} at export time. */
export const TRAJECTORY_SCHEMA_VERSION = "1.0";

/** Link to the suite spec that produced a run. */
export interface SuiteReference {
  /** Absolute or repo-relative path to the suite YAML. */
  uri?: string;
  /** Stable suite identifier when known (e.g. case bundle name). */
  id?: string;
  /** SHA-256 or similar hash of suite file contents. */
  contentHash?: string;
}

/** Harness that executed the run. */
export interface HarnessInfo {
  /** Adapter id from suite YAML, e.g. `claude-code`. */
  adapter: string;
  /** harness-eval package version when envelope was built. */
  frameworkVersion?: string;
  /** Optional harness binary version (e.g. `claude -v`). */
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
  /** All cells passed behavioral assertion thresholds. */
  behavioralPass: boolean;
  /** All graded expectations passed (when outcome layer present). */
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
  /** Claude Code `stream-json` lines — debug only, not cross-harness. */
  rawStreamEvents?: unknown[];
  /** URI to OTLP JSON (S3, GCS, etc.). */
  otlpTraceUri?: string;
  /** Text transcript for judges (`trajectoryToTranscript`). */
  transcript?: string;
}

/**
 * One harness invocation — the unit external judges and trajectory queries use.
 */
export interface EvalRepetition {
  repetitionIndex: number;
  durationMs: number;

  /** Normalized harness session. Required when the harness completed with a view. */
  trajectory?: TrajectoryView & { schemaVersion: string };

  diagnostics?: Partial<AdapterDiagnostics>;
  assertionResults: AssertionResult[];

  outcomeGrades?: OutcomeGrades;
  externalScores?: ExternalScore[];

  artifacts?: EvalArtifacts;

  /** Interchange-format predicted tool-call trajectory. */
  predicted_trajectory?: InterchangeToolCall[];

  /** Full multi-turn agent trace in interchange format. */
  agent_trace?: AgentTrace;

  /** Session latency in seconds (interchange field). */
  latency_in_seconds?: number;

  /** 1 when the harness run failed, 0 on success (interchange field). */
  failure?: 0 | 1;

  /** Trajectory-level metrics when reference_trajectory is provided. */
  trajectoryMetrics?: TrajectoryMetrics;

  /** Tool-call-level metrics when reference_trajectory is provided. */
  toolCallMetrics?: ToolCallMetrics;

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
  /** Reference tool-call trajectory for metric computation. */
  reference_trajectory?: TabularToolCall[];
  /** Human ratings keyed by metric name for judge calibration. */
  human_ratings?: Record<string, number>;
  assertionStats: EvalAssertionStat[];
  adapterErrors: number;
  /** Passed all behavioral assertion thresholds for this cell. */
  behavioralPass: boolean;
  /** Passed all outcome expectations when graded; omitted if not graded. */
  outcomePass?: boolean;
  repetitions: EvalRepetition[];
}

/**
 * Top-level document for CI/CD pipelines, APIs, and databases.
 *
 * This is the interchange format your storage layer should target — not
 * {@link import("./stream").StreamEvent} or OTLP traces.
 */
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
  /** UUID for this run; generated if omitted. */
  runId?: string;
  suite?: SuiteReference;
  harness?: Partial<HarnessInfo>;
  provenance?: EvalProvenance;
  /** Merge outcome grades from `gradeReport()` or compatible structure. */
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
  /** Include transcript in each repetition's artifacts. Default true. */
  includeTranscript?: boolean;
  /** Include raw stream events when adapter provides them. Default false. */
  includeRawStreamEvents?: boolean;
}
