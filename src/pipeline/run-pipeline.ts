/**
 * Orchestrate run → grade → envelope pipeline steps.
 */

import { writeFile } from "node:fs/promises";

import { getAdapter } from "../adapters/registry";
import type { GradingConfig } from "../config/grading-loader";
import type { SuiteDocument } from "../config/suite-document";
import { ConfigError } from "../config/transform";
import { gradeReport, gradingReportPassed, loadSuiteReport, resolveGradeOptions } from "../grader/index";
import { buildEvalRunEnvelopeFromFiles } from "../eval-record/build";
import { serializeEnvelopeProjection } from "../cli/commands/envelope";
import { runSuite } from "../runner/suite";
import type { ProgressCallback, SuiteReport } from "../runner/types";
import type { GradeReportOptions } from "../grader/types";
import {
  parsePipelineSteps,
  resolvePipelineInputs,
  suiteDirectoryFromPath,
  type PipelineCliOverrides,
  type PipelineStepName,
} from "./resolve-inputs";

/** Options for {@link runPipeline} (CLI flags and progress callbacks). */
export interface RunPipelineOptions {
  /** Comma-separated subset of configured steps (e.g. `run,grade`). */
  steps?: string;
  maxConcurrent?: number;
  overrides?: PipelineCliOverrides;
  onRunProgress?: ProgressCallback;
  onGradeProgress?: GradeReportOptions["onProgress"];
  /** Framework version stamped on envelope export. */
  frameworkVersion?: string;
}

/** Outcome of a pipeline run including per-step exit semantics. */
export interface RunPipelineResult {
  /** 0 pass, 1 eval/grade/envelope failure, 2 load error (thrown before return). */
  exitCode: number;
  stepsRun: PipelineStepName[];
  runReport?: SuiteReport;
}

/** Execute configured pipeline steps in order; stop on first failure. */
export async function runPipeline(
  doc: SuiteDocument,
  options: RunPipelineOptions = {},
): Promise<RunPipelineResult> {
  if (!doc.pipeline) {
    throw new ConfigError("suite document has no pipeline block", doc.suitePath);
  }

  const steps = parsePipelineSteps(doc.pipeline, options.steps);
  const suiteDir = suiteDirectoryFromPath(doc.suitePath);
  const executed: {
    run?: { output: string };
    grade?: { input: string; output: string };
  } = {};

  let runReport: SuiteReport | undefined;
  let exitCode = 0;

  for (const step of steps) {
    const resolved = await resolvePipelineInputs({
      suitePath: doc.suitePath,
      suiteDir,
      pipeline: doc.pipeline,
      steps: [step],
      executed,
      overrides: options.overrides,
    });

    if (step === "run" && resolved.run) {
      const adapter = getAdapter(doc.suite.adapter ?? "claude-code");
      runReport = await runSuite(doc.suite, {
        adapter,
        maxConcurrent:
          resolved.run.maxConcurrent ?? options.maxConcurrent ?? 4,
        onProgress: options.onRunProgress,
      });
      await writeFile(
        resolved.run.output,
        JSON.stringify(runReport, null, 2),
        "utf8",
      );
      executed.run = { output: resolved.run.output };
      // Fail fast: behavioral assertion failures skip later pipeline steps.
      if (!runReport.cells.every((cell) => cell.passed)) {
        return { exitCode: 1, stepsRun: steps.slice(0, steps.indexOf(step) + 1), runReport };
      }
      continue;
    }

    if (step === "grade" && resolved.grade) {
      if (!doc.judge) {
        throw new ConfigError("grade step requires inline judge: block in suite.yaml", doc.suitePath);
      }
      const gradingConfig: GradingConfig = { judge: doc.judge };
      const gradeOptions = resolveGradeOptions(
        gradingConfig,
        {
          sourceReport: resolved.grade.input,
          maxConcurrent: resolved.grade.maxConcurrent,
        },
        doc.suitePath,
      );
      const report = await loadSuiteReport(resolved.grade.input);
      const grading = await gradeReport(report, {
        ...gradeOptions,
        onProgress: options.onGradeProgress,
      });
      await writeFile(
        resolved.grade.output,
        JSON.stringify(grading, null, 2),
        "utf8",
      );
      executed.grade = {
        input: resolved.grade.input,
        output: resolved.grade.output,
      };
      if (!gradingReportPassed(grading)) {
        // Outcome grading failure stops the pipeline before envelope export.
        return {
          exitCode: 1,
          stepsRun: steps.slice(0, steps.indexOf(step) + 1),
          runReport,
        };
      }
      continue;
    }

    if (step === "envelope" && resolved.envelope) {
      const envelope = await buildEvalRunEnvelopeFromFiles(
        resolved.envelope.report,
        {
          gradingPath: resolved.envelope.grading,
          suitePath: doc.suitePath,
          includeTranscript: !resolved.envelope.noTranscript,
          includeRawStreamEvents: resolved.envelope.includeRawStreamEvents,
          harness: { frameworkVersion: options.frameworkVersion },
        },
      );
      const serialized = serializeEnvelopeProjection(
        envelope,
        resolved.envelope.projection,
      );
      await writeFile(resolved.envelope.output, serialized, "utf8");
      const behavioralFail = !envelope.summary.behavioralPass;
      const outcomeFail =
        envelope.summary.outcomePass !== undefined &&
        !envelope.summary.outcomePass;
      if (behavioralFail || outcomeFail) {
        return {
          exitCode: 1,
          stepsRun: steps.slice(0, steps.indexOf(step) + 1),
          runReport,
        };
      }
      continue;
    }
  }

  return { exitCode, stepsRun: steps, runReport };
}
