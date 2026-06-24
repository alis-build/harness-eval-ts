/**
 * Build {@link EvalRunEnvelope} from harness-eval run and grading reports.
 *
 * This is the canonical export path from in-process or on-disk {@link SuiteReport}
 * JSON into the cross-harness eval record contract. It stitches together:
 *
 *   - Behavioral assertion results from the runner
 *   - Optional outcome grades from the LLM grader
 *   - Vertex protojson interchange fields via {@link enrichRepetitionWithProtojson}
 *   - Optional artifacts (transcript, raw stream-json) controlled by build options
 *
 * Downstream consumers include CI gates, databases, and the `harness-eval envelope`
 * CLI projection commands.
 */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname, basename, join } from "node:path";
import { stat } from "node:fs/promises";

import { loadGradingConfig } from "../config/grading-loader";
import { loadSuite } from "../config/loader";
import { trajectoryToTranscript } from "../grader/transcript";
import { toReferenceTrajectory } from "../eval-interchange/protojson/trajectory-instances";
import { enrichRepetitionWithProtojson } from "../eval-interchange/enrich";
import type { SuiteGradingReport } from "../grader/types";
import type {
  BuildEvalRunEnvelopeOptions,
  EvalCellResult,
  EvalRepetition,
  EvalRunEnvelope,
  JudgeInfo,
} from "../types/eval-record";
import {
  EVAL_RUN_SCHEMA_VERSION,
  TRAJECTORY_SCHEMA_VERSION,
} from "../types/eval-record";
import type { SuiteReport } from "../runner/types";
import { judgeInfoFromGradingConfig,
  resolveJudgeInfo,
} from "./judge-metadata";

/**
 * Pull raw stream-json events from an adapter result when the adapter exposes them.
 *
 * Adapters may attach `rawEvents` for debug-only envelope export; this helper
 * avoids coupling the builder to a specific adapter result type.
 */
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

/**
 * Derive cell-level outcome pass from graded repetitions.
 *
 * Returns `undefined` when no repetition was graded (outcome gate not applicable).
 * When graded, every repetition must have zero failed expectations and no grader error.
 *
 * @param _caseId - Reserved for future per-case outcome rules; unused today.
 * @param _cellLabel - Reserved for future per-cell outcome rules; unused today.
 */
function outcomePassForCell(
  _caseId: string,
  _cellLabel: string,
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

/** Resolve judge metadata for envelope export (explicit options win). */
async function resolveEnvelopeJudge(options: {
  grading?: BuildEvalRunEnvelopeOptions["grading"];
  gradingConfigPath?: string;
}): Promise<JudgeInfo> {
  if (options.grading?.judge) {
    return options.grading.judge;
  }

  if (options.gradingConfigPath) {
    try {
      const config = await loadGradingConfig(
        resolve(options.gradingConfigPath),
      );
      return judgeInfoFromGradingConfig(config);
    } catch {
      // Fall through to default when grading YAML is missing or invalid.
    }
  }

  return resolveJudgeInfo({ adapter: "claude-code" });
}

/** Path to pass to {@link loadSuite} (directory layout uses the suite folder). */
async function resolveSuiteLoadPath(suitePath: string): Promise<string> {
  const abs = resolve(suitePath);
  if (basename(abs) === "suite.yaml") {
    return dirname(abs);
  }
  try {
    const info = await stat(abs);
    if (info.isDirectory()) {
      return abs;
    }
  } catch {
    // Fall through — loadSuite will surface read errors.
  }
  return abs;
}

/** Read suite YAML bytes for content hashing. */
async function readSuiteYamlContent(suitePath: string): Promise<string> {
  const loadPath = await resolveSuiteLoadPath(suitePath);
  const yamlPath =
    basename(resolve(suitePath)) === "suite.yaml"
      ? resolve(suitePath)
      : join(loadPath, "suite.yaml");
  return readFile(yamlPath, "utf8");
}
async function resolveEnvelopeHarnessAdapter(options: {
  harnessAdapter?: string;
  suitePath?: string;
}): Promise<string> {
  if (options.harnessAdapter) {
    return options.harnessAdapter;
  }

  if (options.suitePath) {
    try {
      const suite = await loadSuite(await resolveSuiteLoadPath(options.suitePath));
      if (suite.adapter) {
        return suite.adapter;
      }
    } catch {
      // Fall through to default when suite cannot be loaded.
    }
  }

  return "claude-code";
}

/**
 * Convert a {@link SuiteReport} (and optional grading) into a versioned
 * {@link EvalRunEnvelope} for storage or API handoff.
 *
 * @param report - Runner output for one suite execution.
 * @param options - Provenance, grading merge, and artifact inclusion flags.
 * @returns A fully populated envelope with protojson interchange fields on each repetition.
 */
export function buildEvalRunEnvelope(
  report: SuiteReport,
  options: BuildEvalRunEnvelopeOptions = {},
): EvalRunEnvelope {
  // Transcript is on by default — judges and external tools expect it.
  const includeTranscript = options.includeTranscript !== false;
  // Raw stream-json is opt-in: large, vendor-specific, not cross-harness.
  const includeRaw = options.includeRawStreamEvents === true;

  const judge =
    options.grading?.judge ?? resolveJudgeInfo({ adapter: "claude-code" });

  const cells: EvalCellResult[] = report.cells.map((cell) => {
    const prompt = cell.prompt ?? "";
    const referenceTrajectoryConfig = cell.reference_trajectory;
    // Cell-level reference is exported in Vertex wire format for DB storage and
    // interchange even when individual repetitions also carry trajectoryInstances.
    const referenceTrajectory = referenceTrajectoryConfig
      ? toReferenceTrajectory(
          referenceTrajectoryConfig.steps,
          referenceTrajectoryConfig.tool_name_mode ?? "harness",
        )
      : undefined;
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

      // Match grading rows by the same composite key the grader uses: case × cell × rep.
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

      // Protojson fields (evaluationInstance, trajectoryInstances, harnessMetrics)
      // are derived from trajectory + suite reference config, not from the runner report.
      return enrichRepetitionWithProtojson(base, {
        prompt,
        reference: referenceTrajectoryConfig,
      });
    });

    return {
      caseId: cell.caseId,
      category: cell.category,
      notes: cell.notes,
      prompt: cell.prompt,
      expectations: cell.expectations,
      referenceTrajectory,
      humanRatings: cell.human_ratings,
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
  // Run-level outcomePass is omitted when grading was not run for any cell.
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

/**
 * Build an envelope from on-disk runner and grader JSON artifacts.
 *
 * Reads `reportPath` as a {@link SuiteReport}. When `gradingPath` is set, merges
 * outcome grades from a {@link SuiteGradingReport}. When `suitePath` is set,
 * attaches suite URI and SHA-256 content hash for reproducibility.
 *
 * @param reportPath - Path to the suite run report JSON from `harness-eval run`.
 * @param options - Same build options as {@link buildEvalRunEnvelope}, plus file paths.
 */
export async function buildEvalRunEnvelopeFromFiles(
  reportPath: string,
  options: BuildEvalRunEnvelopeOptions & {
    gradingPath?: string;
    suitePath?: string;
  } = {},
): Promise<EvalRunEnvelope> {
  const reportText = await readFile(reportPath, "utf8");
  const report = JSON.parse(reportText) as SuiteReport;

  const harnessAdapter = await resolveEnvelopeHarnessAdapter({
    harnessAdapter: options.harness?.adapter,
    suitePath: options.suitePath,
  });

  let grading: BuildEvalRunEnvelopeOptions["grading"] | undefined =
    options.grading;

  if (options.gradingPath) {
    const gradingText = await readFile(options.gradingPath, "utf8");
    const parsed = JSON.parse(gradingText) as SuiteGradingReport;
    const judge =
      parsed.judge ??
      (await resolveEnvelopeJudge({
        gradingConfigPath: parsed.gradingConfigPath,
      }));
    grading = {
      gradedAt: parsed.gradedAt,
      sourceReport: parsed.sourceReport,
      results: parsed.results,
      judge,
    };
  }

  let suite = options.suite;
  if (options.suitePath) {
    const content = await readSuiteYamlContent(options.suitePath);
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
    harness: {
      ...options.harness,
      adapter: harnessAdapter,
    },
  });
}
