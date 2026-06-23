/**
 * Outcome grading types (LLM-as-judge layer).
 *
 * Behavioral assertions live in harness-eval assertions; expectations here
 * are natural-language outcome checks graded from trajectory transcripts.
 */

export interface GradedExpectation {
  text: string;
  passed: boolean;
  evidence: string;
}

export interface GradingSummary {
  passed: number;
  failed: number;
  total: number;
  passRate: number;
}

export interface EvalFeedbackSuggestion {
  assertion?: string;
  reason: string;
}

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

export type GraderFn = (input: GraderInput) => Promise<GraderOutput>;

export interface GraderInput {
  prompt: string;
  transcript: string;
  expectations: string[];
  systemInstruction?: string;
}

export interface GraderOutput {
  expectations: GradedExpectation[];
  summary: GradingSummary;
  evalFeedback?: EvalFeedback;
  error?: string;
}
