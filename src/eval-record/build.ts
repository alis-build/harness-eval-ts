/**
 * Build {@link EvalRunEnvelope} from harness-eval run and grading reports.
 */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import { trajectoryToTranscript } from "../grader/transcript";
import { enrichRepetitionWithInterchange } from "../eval-interchange/projections";
import type { SuiteGradingReport } from "../grader/types";
import type {
  BuildEvalRunEnvelopeOptions,
  EvalCellResult,
  EvalRepetition,
  EvalRunEnvelope,
} from "../types/eval-record";
import {
  EVAL_RUN_SCHEMA_VERSION,
  TRAJECTORY_SCHEMA_VERSION,
} from "../types/eval-record";
import type { SuiteReport } from "../runner/types";

function extractRawEvents(adapterResult: unknown): unknown[] | undefined {
  if (
    adapterResult !== null &&
    typeof adapterResult === "object" &&
    "rawEvents" in adapterResult &&
    Array.isArray((adapterResult as { rawEvents: unknown }).rawEvents)
  ) {
    return (adapterResult as { rawEvents: unknown[] }).rawEvents;
  }
  return undefined;
}

function outcomePassForCell(
  caseId: string,
  cellLabel: string,
  repetitions: EvalRepetition[],
): boolean | undefined {
  const graded = repetitions.filter((r) => r.outcomeGrades);
  if (graded.length === 0) return undefined;
  return graded.every(
    (r) =>
      r.outcomeGrades!.error === undefined &&
      r.outcomeGrades!.summary.failed === 0,
  );
}

/**
 * Convert a {@link SuiteReport} (and optional grading) into a versioned
 * {@link EvalRunEnvelope} for storage or API handoff.
 */
export function buildEvalRunEnvelope(
  report: SuiteReport,
  options: BuildEvalRunEnvelopeOptions = {},
): EvalRunEnvelope {
  const includeTranscript = options.includeTranscript !== false;
  const includeRaw = options.includeRawStreamEvents === true;

  const judge =
    options.grading?.judge ?? { id: "harness-eval/claude-grader" };

  const cells: EvalCellResult[] = report.cells.map((cell) => {
    const prompt = cell.prompt ?? "";
    const referenceTrajectory = cell.reference_trajectory;
    const repetitions: EvalRepetition[] = cell.repetitions.map((rep) => {
      const base: EvalRepetition = {
        repetitionIndex: rep.repetitionIndex,
        durationMs: rep.durationMs,
        assertionResults: rep.assertionResults,
      };

      if (rep.error) {
        base.error = {
          message: rep.error.message,
          diagnostics: rep.error.diagnostics,
        };
        return base;
      }

      if (rep.adapterResult) {
        base.trajectory = {
          ...rep.adapterResult.view,
          schemaVersion: TRAJECTORY_SCHEMA_VERSION,
        };
        base.diagnostics = rep.adapterResult.diagnostics;

        const artifacts: EvalRepetition["artifacts"] = {};
        if (includeTranscript) {
          artifacts.transcript = trajectoryToTranscript(
            rep.adapterResult.view,
            prompt,
          );
        }
        if (includeRaw) {
          const raw = extractRawEvents(rep.adapterResult);
          if (raw) artifacts.rawStreamEvents = raw;
        }
        if (Object.keys(artifacts).length > 0) {
          base.artifacts = artifacts;
        }
      }

      const graded = options.grading?.results.find(
        (r) =>
          r.caseId === cell.caseId &&
          r.cellLabel === cell.cell.label &&
          r.repetitionIndex === rep.repetitionIndex,
      );

      if (graded) {
        base.outcomeGrades = {
          judge,
          expectations: graded.expectations,
          summary: graded.summary,
          evalFeedback: graded.evalFeedback,
          error: graded.graderError,
        };
      }

      return enrichRepetitionWithInterchange(base, referenceTrajectory);
    });

    return {
      caseId: cell.caseId,
      category: cell.category,
      notes: cell.notes,
      prompt: cell.prompt,
      expectations: cell.expectations,
      reference_trajectory: cell.reference_trajectory,
      human_ratings: cell.human_ratings,
      cellLabel: cell.cell.label,
      axes: cell.cell.axes,
      assertionStats: cell.assertionStats,
      adapterErrors: cell.adapterErrors,
      behavioralPass: cell.passed,
      outcomePass: outcomePassForCell(
        cell.caseId,
        cell.cell.label,
        repetitions,
      ),
      repetitions,
    };
  });

  const cellsPassed = cells.filter((c) => c.behavioralPass).length;
  const gradedCells = cells.filter((c) => c.outcomePass !== undefined);
  const outcomePass =
    gradedCells.length > 0
      ? gradedCells.every((c) => c.outcomePass === true)
      : undefined;

  return {
    schemaVersion: EVAL_RUN_SCHEMA_VERSION,
    runId: options.runId ?? randomUUID(),
    startedAt: report.startedAt,
    durationMs: report.durationMs,
    suite: options.suite,
    harness: {
      adapter: options.harness?.adapter ?? "claude-code",
      frameworkVersion: options.harness?.frameworkVersion,
      harnessVersion: options.harness?.harnessVersion,
    },
    provenance: options.provenance,
    summary: {
      cellsTotal: cells.length,
      cellsPassed,
      behavioralPass: cellsPassed === cells.length,
      outcomePass,
    },
    cells,
  };
}

/** Build envelope from on-disk report + optional grading JSON paths. */
export async function buildEvalRunEnvelopeFromFiles(
  reportPath: string,
  options: BuildEvalRunEnvelopeOptions & {
    gradingPath?: string;
    suitePath?: string;
  } = {},
): Promise<EvalRunEnvelope> {
  const reportText = await readFile(reportPath, "utf8");
  const report = JSON.parse(reportText) as SuiteReport;

  let grading: BuildEvalRunEnvelopeOptions["grading"] | undefined =
    options.grading;

  if (options.gradingPath) {
    const gradingText = await readFile(options.gradingPath, "utf8");
    const parsed = JSON.parse(gradingText) as SuiteGradingReport;
    grading = {
      gradedAt: parsed.gradedAt,
      sourceReport: parsed.sourceReport,
      results: parsed.results,
      judge: options.grading?.judge ?? { id: "harness-eval/claude-grader" },
    };
  }

  let suite = options.suite;
  if (options.suitePath) {
    const content = await readFile(options.suitePath, "utf8");
    suite = {
      ...suite,
      uri: options.suitePath,
      contentHash: createHash("sha256").update(content).digest("hex"),
    };
  }

  return buildEvalRunEnvelope(report, {
    ...options,
    suite,
    grading,
  });
}
