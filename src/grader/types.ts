/**
 * Outcome grading types (LLM-as-judge layer).
 *
 * Behavioral assertions live in harness-eval assertions; expectations here
 * are natural-language outcome checks graded from trajectory transcripts.
 * Grading runs as a second pass over a {@link SuiteReport} JSON artifact.
 */

export interface GradedExpectation {
  /** Original expectation text from the suite or sidecar file. */
  text: string;
  passed: boolean;
  /** Quote or description supporting the pass/fail decision. */
  evidence: string;
}

/** Aggregate pass/fail counts for one grading unit (rep or full report). */
export interface GradingSummary {
  passed: number;
  failed: number;
  total: number;
  passRate: number;
}

/** Suggestion for improving an expectation or assertion wording. */
export interface EvalFeedbackSuggestion {
  assertion?: string;
  reason: string;
}

/** Optional meta-feedback from the judge about expectation quality. */
export interface EvalFeedback {
  suggestions: EvalFeedbackSuggestion[];
  overall: string;
}

/** Grading result for one repetition. */
export interface RepGradingResult {
  caseId: string;
  cellLabel: string;
  repetitionIndex: number;
  prompt: string;
  expectations: GradedExpectation[];
  summary: GradingSummary;
  evalFeedback?: EvalFeedback;
  /** Set when the grader subprocess failed or returned unparseable output. */
  graderError?: string;
  durationMs: number;
}

/** Full grading report for a suite run. */
export interface SuiteGradingReport {
  gradedAt: string;
  sourceReport: string;
  /** Grading YAML path when `--config` was used. */
  gradingConfigPath?: string;
  results: RepGradingResult[];
  summary: GradingSummary;
}

/** Sidecar expectations file: case id → expectation strings. */
export interface ExpectationsMap {
  [caseId: string]: string[];
}

/** Options controlling {@link gradeReport} and the CLI `grade` command. */
export interface GradeReportOptions {
  /** Path to the report being graded (stored in output). */
  sourceReport?: string;
  /** Path to expectations YAML/JSON sidecar (case id → strings). */
  expectationsPath?: string;
  /** Claude binary for grading. Default: `claude`. */
  binary?: string;
  /** Model for the grader subprocess. */
  model?: string;
  /** Optional judge prompt prefix (maps to upstream system_instruction). */
  systemInstruction?: string;
  /** Timeout per grading call (ms). Default 300000 (5 min). */
  timeoutMs?: number;
  /** Max concurrent grader subprocesses. Default 2. */
  maxConcurrent?: number;
  /** Process env for the judge subprocess (merged over inherited env). */
  env?: Record<string, string>;
  /** Working directory for the judge subprocess. */
  cwd?: string;
  /** Claude Code options for the judge (nested in grading YAML under `claudeCode`). */
  claudeCode?: Record<string, unknown>;
  /** Path to grading YAML when `--config` was used. */
  gradingConfigPath?: string;
  /** Inject a custom grader (for tests). */
  gradeFn?: GraderFn;
  onProgress?: (event: GradeProgressEvent) => void;
}

/** Progress events emitted during outcome grading. */
export type GradeProgressEvent =
  | { kind: "grade-start"; total: number }
  | {
      kind: "grade-complete";
      caseId: string;
      cellLabel: string;
      repetitionIndex: number;
      passed: number;
      failed: number;
      durationMs: number;
      graderError?: string;
    }
  | {
      kind: "grade-done";
      durationMs: number;
      totalExpectations: number;
      passedExpectations: number;
    };

/** Pluggable grader implementation (defaults to Claude subprocess). */
export type GraderFn = (input: GraderInput) => Promise<GraderOutput>;

/** Input passed to a grader for one repetition. */
export interface GraderInput {
  prompt: string;
  transcript: string;
  expectations: string[];
  systemInstruction?: string;
}

/** Parsed grader response before alignment with input expectation order. */
export interface GraderOutput {
  expectations: GradedExpectation[];
  summary: GradingSummary;
  evalFeedback?: EvalFeedback;
  error?: string;
}
