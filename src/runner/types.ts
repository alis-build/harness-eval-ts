/**
 * Runner data model.
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

// suite inputs

export interface TestCase {
  id: string;
  prompt: string;
  category?: string;
  notes?: string;
  assertions: ThresholdedAssertion[];
  /** Natural-language outcome checks for LLM grading (see `harness-eval grade`). */
  expectations?: string[];
  /** Reference tool-call trajectory for metric computation. */
  reference_trajectory?: Array<{ tool_name: string; tool_input: unknown }>;
  /** Human ratings keyed by metric name for judge calibration. */
  human_ratings?: Record<string, number>;
  repetitions?: number;
  config?: SuiteConfig;
}

export interface MatrixCell {
  label: string;
  config: SuiteConfig;
  axes?: Record<string, string>;
}

export interface TestSuite {
  /** Harness adapter id. Default: `claude-code`. */
  adapter?: string;
  cases: TestCase[];
  matrix: MatrixCell[];
  defaultConfig?: SuiteConfig;
}

// run options

export interface RunSuiteOptions {
  /** Maximum concurrent harness processes across the entire suite. Default 4. */
  maxConcurrent?: number;
  /** Harness adapter to run. Defaults to registry default (`claude-code`). */
  adapter?: HarnessAdapter;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

export type ProgressCallback = (event: ProgressEvent) => void;

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

export interface RepetitionResult {
  repetitionIndex: number;
  adapterResult: AdapterResult | null;
  error: RepetitionError | null;
  assertionResults: AssertionResult[];
  durationMs: number;
}

export interface RepetitionError {
  message: string;
  diagnostics: Partial<AdapterDiagnostics>;
}

export interface CellReport {
  caseId: string;
  category?: string;
  notes?: string;
  /** Eval prompt (copied for grading without re-loading the suite). */
  prompt?: string;
  /** Outcome expectations for LLM grading. */
  expectations?: string[];
  /** Reference tool-call trajectory for metric computation. */
  reference_trajectory?: Array<{ tool_name: string; tool_input: unknown }>;
  /** Human ratings keyed by metric name for judge calibration. */
  human_ratings?: Record<string, number>;
  cell: MatrixCell;
  repetitions: RepetitionResult[];
  assertionStats: AssertionStat[];
  adapterErrors: number;
  passed: boolean;
}

export interface AssertionStat {
  description: string;
  threshold: number;
  passedCount: number;
  evaluatedCount: number;
  passRate: number;
  meetsThreshold: boolean;
}

export interface SuiteReport {
  startedAt: string;
  durationMs: number;
  cells: CellReport[];
}
