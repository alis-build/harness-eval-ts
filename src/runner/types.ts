/**
 * Runner data model — suite inputs, progress events, and aggregated results.
 *
 * The runner executes a {@link TestSuite}: each (case × matrix cell × repetition)
 * spawns one harness process, evaluates assertions against the resulting
 * {@link TrajectoryView}, and rolls up pass rates against per-assertion
 * thresholds. These types are the contract between config loading, the suite
 * runner, reporters, and eval-record builders.
 */

import type { HarnessAdapter, SuiteConfig } from "../adapters/types";
import type {
  AdapterDiagnostics,
  AdapterResult,
} from "../adapters/types";
import type {
  AssertionResult,
  ThresholdedAssertion,
} from "../types/assertions";
import type { ReferenceTrajectoryConfig } from "../types/eval-interchange";

// suite inputs

/** One eval prompt with assertions and optional grading metadata. */
export interface TestCase {
  id: string;
  prompt: string;
  category?: string;
  notes?: string;
  assertions: ThresholdedAssertion[];
  /** Natural-language outcome checks for LLM grading (see `harness-eval grade`). */
  expectations?: string[];
  /** Reference tool-call trajectory for metric computation. */
  reference_trajectory?: ReferenceTrajectoryConfig;
  /** Human ratings keyed by metric name for judge calibration. */
  human_ratings?: Record<string, number>;
  repetitions?: number;
  config?: SuiteConfig;
}

/**
 * One point in the configuration matrix — a named config overlay applied to
 * every case in the suite.
 */
export interface MatrixCell {
  label: string;
  config: SuiteConfig;
  /** Optional axis labels for reporting (e.g. `{ model: "sonnet" }`). */
  axes?: Record<string, string>;
}

/** Loaded suite: cases crossed with a config matrix. */
export interface TestSuite {
  /** Harness adapter id. Default: `claude-code`. */
  adapter?: string;
  cases: TestCase[];
  matrix: MatrixCell[];
  defaultConfig?: SuiteConfig;
}

// run options

/** Options passed to {@link runSuite}. */
export interface RunSuiteOptions {
  /** Maximum concurrent harness processes across the entire suite. Default 4. */
  maxConcurrent?: number;
  /** Harness adapter to run. Defaults to registry default (`claude-code`). */
  adapter?: HarnessAdapter;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

/** Callback invoked as repetitions and cells complete during a suite run. */
export type ProgressCallback = (event: ProgressEvent) => void;

/**
 * Progress events emitted by the suite runner. Consumed by CLI progress
 * handlers and programmatic callers that want live feedback.
 */
export type ProgressEvent =
  | { kind: "suite-start"; totalReps: number }
  | {
      kind: "rep-start";
      caseId: string;
      cellLabel: string;
      repIndex: number;
    }
  | {
      kind: "rep-complete";
      caseId: string;
      cellLabel: string;
      repIndex: number;
      ok: boolean;
      durationMs: number;
      toolCallCount?: number;
      assertionResults?: AssertionResult[];
      errorMessage?: string;
    }
  | { kind: "cell-complete"; report: CellReport }
  | { kind: "suite-complete"; report: SuiteReport };

// results

/** Outcome of one harness invocation (one repetition). */
export interface RepetitionResult {
  repetitionIndex: number;
  adapterResult: AdapterResult | null;
  error: RepetitionError | null;
  assertionResults: AssertionResult[];
  durationMs: number;
}

/** Adapter failure for a single repetition (process crash, timeout, etc.). */
export interface RepetitionError {
  message: string;
  diagnostics: Partial<AdapterDiagnostics>;
}

/**
 * Aggregated results for one (case, matrix cell) pair across all repetitions.
 * Copied onto the report for downstream grading and envelope export.
 */
export interface CellReport {
  caseId: string;
  category?: string;
  notes?: string;
  /** Eval prompt (copied for grading without re-loading the suite). */
  prompt?: string;
  /** Outcome expectations for LLM grading. */
  expectations?: string[];
  /** Reference tool-call trajectory for metric computation. */
  reference_trajectory?: ReferenceTrajectoryConfig;
  /** Human ratings keyed by metric name for judge calibration. */
  human_ratings?: Record<string, number>;
  cell: MatrixCell;
  repetitions: RepetitionResult[];
  assertionStats: AssertionStat[];
  adapterErrors: number;
  passed: boolean;
}

/** Pass-rate rollup for one thresholded assertion within a cell. */
export interface AssertionStat {
  description: string;
  threshold: number;
  passedCount: number;
  evaluatedCount: number;
  passRate: number;
  meetsThreshold: boolean;
}

/** Full suite run report — one {@link CellReport} per (case, cell). */
export interface SuiteReport {
  startedAt: string;
  durationMs: number;
  cells: CellReport[];
}
