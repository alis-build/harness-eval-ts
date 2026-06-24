/**
 * Resolve pipeline step inputs and outputs with precedence rules.
 *
 * Precedence: CLI override > explicit YAML > prior step in this run > default path on disk > error.
 */

import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { EnvelopeProjection } from "../cli/commands/envelope";
import type { PipelineConfig } from "../config/pipeline-schema";
import { DEFAULT_PIPELINE_OUTPUTS } from "../config/pipeline-schema";
import { loadSuiteDocument } from "../config/suite-document-loader";
import { ConfigError } from "../config/transform";

export type PipelineStepName = "run" | "grade" | "envelope";

/** CLI overrides for pipeline artifact paths (take precedence over YAML). */
export interface PipelineCliOverrides {
  run?: { output?: string; maxConcurrent?: number };
  grade?: { input?: string; output?: string; maxConcurrent?: number };
  envelope?: {
    report?: string;
    grading?: string;
    output?: string;
    projection?: EnvelopeProjection;
  };
}

/** Resolved paths for the harness run step. */
export interface ResolvedPipelineRun {
  output: string;
  maxConcurrent?: number;
}

/** Resolved input (suite report) and output (grading JSON) for the grade step. */
export interface ResolvedPipelineGrade {
  input: string;
  output: string;
  maxConcurrent?: number;
}

/** Resolved artifact paths for the envelope export step. */
export interface ResolvedPipelineEnvelope {
  report: string;
  grading?: string;
  output: string;
  projection: EnvelopeProjection;
  includeRawStreamEvents: boolean;
  noTranscript: boolean;
}

/** Fully resolved pipeline inputs for one or more enabled steps. */
export interface ResolvedPipeline {
  suitePath: string;
  run?: ResolvedPipelineRun;
  grade?: ResolvedPipelineGrade;
  envelope?: ResolvedPipelineEnvelope;
}

/** Inputs for {@link resolvePipelineInputs}. */
export interface ResolvePipelineInputsOptions {
  suitePath: string;
  suiteDir: string;
  pipeline: PipelineConfig;
  steps: PipelineStepName[];
  executed?: {
    run?: { output: string };
    grade?: { input: string; output: string };
  };
  overrides?: PipelineCliOverrides;
}

/** Resolve absolute paths for enabled pipeline steps. */
export async function resolvePipelineInputs(
  options: ResolvePipelineInputsOptions,
): Promise<ResolvedPipeline> {
  const { suitePath, suiteDir, pipeline, steps, overrides } = options;
  const executed = options.executed ?? {};
  const stepSet = new Set(steps);

  const resolved: ResolvedPipeline = { suitePath: resolve(suitePath) };

  const defaultRunOutput = resolve(
    suiteDir,
    pipeline.run?.output ?? DEFAULT_PIPELINE_OUTPUTS.run,
  );
  const defaultGradeOutput = resolve(
    suiteDir,
    pipeline.grade?.output ?? DEFAULT_PIPELINE_OUTPUTS.grade,
  );

  if (stepSet.has("run") && pipeline.run) {
    resolved.run = {
      output: resolve(
        suiteDir,
        overrides?.run?.output ?? pipeline.run.output,
      ),
      maxConcurrent: overrides?.run?.maxConcurrent ?? pipeline.run.maxConcurrent,
    };
  }

  if (stepSet.has("grade") && pipeline.grade) {
    const input = await resolveReportPath({
      explicit: overrides?.grade?.input ?? pipeline.grade.input,
      executedOutput: executed.run?.output,
      defaultPath: defaultRunOutput,
      label: "grade input (report)",
    });

    resolved.grade = {
      input,
      output: resolve(
        suiteDir,
        overrides?.grade?.output ?? pipeline.grade.output,
      ),
      maxConcurrent:
        overrides?.grade?.maxConcurrent ?? pipeline.grade.maxConcurrent,
    };
  }

  if (stepSet.has("envelope") && pipeline.envelope) {
    const report = await resolveReportPath({
      explicit: overrides?.envelope?.report ?? pipeline.envelope.report,
      executedOutput: executed.run?.output,
      defaultPath: defaultRunOutput,
      label: "envelope report",
    });

    const grading = await resolveOptionalGradingPath({
      explicit: overrides?.envelope?.grading ?? pipeline.envelope.grading,
      executedOutput: executed.grade?.output,
      defaultPath: defaultGradeOutput,
    });

    resolved.envelope = {
      report,
      grading,
      output: resolve(
        suiteDir,
        overrides?.envelope?.output ?? pipeline.envelope.output,
      ),
      projection:
        overrides?.envelope?.projection ??
        pipeline.envelope.projection ??
        "envelope",
      includeRawStreamEvents:
        pipeline.envelope.includeRawStreamEvents ?? false,
      noTranscript: pipeline.envelope.noTranscript ?? false,
    };
  }

  return resolved;
}

/**
 * Resolve a required report path: explicit override → prior step output → default on disk.
 * Throws when none of the above exist.
 */
async function resolveReportPath(options: {
  explicit?: string;
  executedOutput?: string;
  defaultPath: string;
  label: string;
}): Promise<string> {
  if (options.explicit) {
    return resolve(options.explicit);
  }
  if (options.executedOutput) {
    return resolve(options.executedOutput);
  }
  if (await pathExists(options.defaultPath)) {
    return options.defaultPath;
  }
  throw new ConfigError(
    `pipeline: could not resolve ${options.label}; specify an explicit path or run the run step first`,
    options.defaultPath,
  );
}

/** Resolve optional grading path; returns undefined when grading was not run and file is absent. */
async function resolveOptionalGradingPath(options: {
  explicit?: string;
  executedOutput?: string;
  defaultPath: string;
}): Promise<string | undefined> {
  if (options.explicit) {
    return resolve(options.explicit);
  }
  if (options.executedOutput) {
    return resolve(options.executedOutput);
  }
  if (await pathExists(options.defaultPath)) {
    return options.defaultPath;
  }
  return undefined;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a grading artifact path from a unified suite's `pipeline:` block.
 *
 * Used by `harness-eval envelope --suite` when `--grading` is omitted (spec C-7).
 * Checks `pipeline.envelope.grading` then default `pipeline.grade.output` on disk.
 */
export async function resolveGradingArtifactFromSuite(
  suitePath: string,
): Promise<string | undefined> {
  let doc;
  try {
    doc = await loadSuiteDocument(suitePath);
  } catch {
    return undefined;
  }
  if (!doc.pipeline) return undefined;

  const explicit = doc.pipeline.envelope?.grading;
  if (explicit && (await pathExists(explicit))) {
    return explicit;
  }

  const defaultGrade = doc.pipeline.grade?.output;
  if (defaultGrade && (await pathExists(defaultGrade))) {
    return defaultGrade;
  }

  return undefined;
}

/** Parse `--steps run,grade,envelope` against configured pipeline keys. */
export function parsePipelineSteps(
  pipeline: PipelineConfig,
  stepsArg: string | undefined,
): PipelineStepName[] {
  const configured: PipelineStepName[] = [];
  if (pipeline.run !== undefined) configured.push("run");
  if (pipeline.grade !== undefined) configured.push("grade");
  if (pipeline.envelope !== undefined) configured.push("envelope");

  if (configured.length === 0) {
    throw new ConfigError("pipeline block has no steps configured");
  }

  if (!stepsArg) {
    return configured;
  }

  const validStepNames: ReadonlySet<string> = new Set(["run", "grade", "envelope"]);
  const requested = stepsArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const step of requested) {
    if (!validStepNames.has(step)) {
      throw new ConfigError(
        `unknown pipeline step "${step}"; valid steps are: run, grade, envelope`,
      );
    }
    if (!configured.includes(step as PipelineStepName)) {
      throw new ConfigError(
        `pipeline step "${step}" is not configured in suite.yaml`,
      );
    }
  }

  const requestedSet = new Set(requested);
  return configured.filter((step) => requestedSet.has(step));
}

/** Parent directory of suite.yaml. */
export function suiteDirectoryFromPath(suitePath: string): string {
  return dirname(resolve(suitePath));
}
