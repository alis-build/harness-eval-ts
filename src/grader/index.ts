/**
 * Outcome grading public API — LLM-as-judge over suite report JSON.
 *
 * Re-exports grading orchestration, Claude subprocess grader, transcript
 * formatting, and console output helpers for CLI and programmatic use.
 */

export { gradeReport, loadSuiteReport } from "./grade-report";
export { resolveGradeOptions, type GradeCliOverrides } from "./resolve-grade-options";
export { trajectoryToTranscript } from "./transcript";
export { createClaudeGrader, runClaudeGrader } from "./claude-grader";
export { loadExpectationsMap } from "./expectations";
export { formatGradingConsole, gradingReportPassed } from "./format-console";
export type {
  ExpectationsMap,
  GradeProgressEvent,
  GradeReportOptions,
  GraderFn,
  GraderInput,
  GraderOutput,
  GradedExpectation,
  RepGradingResult,
  SuiteGradingReport,
} from "./types";
