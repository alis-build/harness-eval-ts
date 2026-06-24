/**
 * Grade a harness-eval SuiteReport with outcome expectations (LLM judge).
 */

import { readFile } from "node:fs/promises";

import { createClaudeGrader, type ClaudeGraderOptions } from "./claude-grader";
import { createCodexGrader, type CodexGraderOptions } from "./codex-grader";
import { loadExpectationsMap } from "./expectations";
import { trajectoryToTranscript } from "./transcript";
import type {
  GradeReportOptions,
  GraderFn,
  RepGradingResult,
  SuiteGradingReport,
} from "./types";
import { createLimit } from "../runner/limit";
import type { CellReport, SuiteReport } from "../runner/types";
import { resolveJudgeInfo } from "../eval-record/judge-metadata";

/**
 * Grade every repetition in a {@link SuiteReport} that has expectations.
 *
 * Expectations come from inline case fields or an optional sidecar YAML/JSON
 * map. Runs are concurrent under {@link GradeReportOptions.maxConcurrent}.
 */
export async function gradeReport(
  report: SuiteReport,
  options: GradeReportOptions = {},
): Promise<SuiteGradingReport> {
  const expectationsMap = options.expectationsPath
    ? await loadExpectationsMap(options.expectationsPath)
    : {};

  // Select grader subprocess by judge adapter id from grading YAML or CLI.
  const gradeFn: GraderFn =
    options.gradeFn ??
    (options.judgeAdapter === "codex"
      ? createCodexGrader({
          binary: options.binary,
          model: options.model,
          timeoutMs: options.timeoutMs,
          env: options.env,
          cwd: options.cwd,
          codex: options.codex as CodexGraderOptions["codex"],
        })
      : createClaudeGrader({
          binary: options.binary,
          model: options.model,
          timeoutMs: options.timeoutMs,
          env: options.env,
          cwd: options.cwd,
          claudeCode: options.claudeCode as ClaudeGraderOptions["claudeCode"],
        }));

  const maxConcurrent = options.maxConcurrent ?? 2;
  const limit = createLimit(maxConcurrent);

  const tasks: Array<{
    cell: CellReport;
    rep: CellReport["repetitions"][number];
    expectations: string[];
  }> = [];

  for (const cell of report.cells) {
    const expectations =
      cell.expectations ??
      expectationsMap[cell.caseId] ??
      [];

    if (expectations.length === 0) continue;

    for (const rep of cell.repetitions) {
      if (!rep.adapterResult) continue;
      tasks.push({ cell, rep, expectations });
    }
  }

  const gradeStartTs = Date.now();
  options.onProgress?.({ kind: "grade-start", total: tasks.length });

  const results: RepGradingResult[] = await Promise.all(
    tasks.map(({ cell, rep, expectations }) =>
      limit(async () => {
        const start = Date.now();
        const view = rep.adapterResult!.view;
        const prompt = cell.prompt ?? "";
        const transcript = trajectoryToTranscript(view, prompt);

        try {
          const graded = await gradeFn({
            prompt,
            transcript,
            expectations,
            systemInstruction: options.systemInstruction,
          });

          const result: RepGradingResult = {
            caseId: cell.caseId,
            cellLabel: cell.cell.label,
            repetitionIndex: rep.repetitionIndex,
            prompt,
            expectations: graded.expectations,
            summary: graded.summary,
            evalFeedback: graded.evalFeedback,
            graderError: graded.error,
            durationMs: Date.now() - start,
          };

          options.onProgress?.({
            kind: "grade-complete",
            caseId: result.caseId,
            cellLabel: result.cellLabel,
            repetitionIndex: result.repetitionIndex,
            passed: result.summary.passed,
            failed: result.summary.failed,
            durationMs: result.durationMs,
            graderError: result.graderError,
          });

          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const result: RepGradingResult = {
            caseId: cell.caseId,
            cellLabel: cell.cell.label,
            repetitionIndex: rep.repetitionIndex,
            prompt,
            expectations: expectations.map((text) => ({
              text,
              passed: false,
              evidence: message,
            })),
            summary: {
              passed: 0,
              failed: expectations.length,
              total: expectations.length,
              passRate: 0,
            },
            graderError: message,
            durationMs: Date.now() - start,
          };

          options.onProgress?.({
            kind: "grade-complete",
            caseId: result.caseId,
            cellLabel: result.cellLabel,
            repetitionIndex: result.repetitionIndex,
            passed: 0,
            failed: expectations.length,
            durationMs: result.durationMs,
            graderError: message,
          });

          return result;
        }
      }),
    ),
  );

  results.sort((a, b) => {
    const keyA = `${a.caseId}::${a.cellLabel}::${a.repetitionIndex}`;
    const keyB = `${b.caseId}::${b.cellLabel}::${b.repetitionIndex}`;
    return keyA.localeCompare(keyB);
  });

  const totalExpectations = results.reduce((n, r) => n + r.summary.total, 0);
  const passedExpectations = results.reduce((n, r) => n + r.summary.passed, 0);

  options.onProgress?.({
    kind: "grade-done",
    durationMs: Date.now() - gradeStartTs,
    totalExpectations,
    passedExpectations,
  });

  return {
    gradedAt: new Date().toISOString(),
    sourceReport: options.sourceReport ?? "",
    gradingConfigPath: options.gradingConfigPath,
    judge: resolveJudgeInfo({
      adapter: options.judgeAdapter ?? "claude-code",
      model: options.model,
    }),
    results,
    summary: {
      passed: passedExpectations,
      failed: totalExpectations - passedExpectations,
      total: totalExpectations,
      passRate:
        totalExpectations === 0 ? 0 : passedExpectations / totalExpectations,
    },
  };
}

/** Load a suite report JSON file produced by `harness-eval run`. */
export async function loadSuiteReport(path: string): Promise<SuiteReport> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as SuiteReport;
}
