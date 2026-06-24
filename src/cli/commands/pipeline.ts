/**
 * `harness-eval pipeline` — orchestrate run → grade → envelope from suite.yaml.
 */

import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { loadSuiteDocument } from "../../config/loader";
import { runPipeline } from "../../pipeline/run-pipeline";
import type { PipelineCliOverrides } from "../../pipeline/resolve-inputs";
import { suiteDirectoryFromPath } from "../../pipeline/resolve-inputs";
import {
  createGradeProgressHandler,
  createRunProgressHandler,
  resolveProgressColor,
  resolveProgressMode,
} from "../progress";
import { getOption, getOptionInt, type ParsedArgs } from "../args";
import { parseEnvelopeProjection } from "./envelope";

/** Read package version for envelope provenance (best-effort). */
async function readFrameworkVersion(): Promise<string | undefined> {
  try {
    const packagePath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../package.json",
    );
    const text = await readFile(packagePath, "utf8");
    const pkg = JSON.parse(text) as { version?: string };
    return pkg.version;
  } catch {
    return undefined;
  }
}

/** Resolve CLI path overrides relative to the suite directory unless absolute or `~/`. */
function resolveOverridePath(
  value: string | undefined,
  suiteDir: string,
): string | undefined {
  if (!value) return undefined;
  return isAbsolute(value) || value.startsWith("~/")
    ? value
    : join(suiteDir, value);
}

/**
 * Execute `harness-eval pipeline`.
 *
 * @returns Step exit code (0 pass, 1 eval fail, 2 usage/load error).
 */
export async function pipelineCommand(args: ParsedArgs): Promise<number> {
  const suitePath = args.positional[0];
  if (!suitePath) {
    console.error(
      "usage: harness-eval pipeline <suite.yaml|dir> [--steps run,grade,envelope] [--output path] [--grading path] [--report path] [--max-concurrent N] [--progress default|quiet|verbose|json]",
    );
    return 2;
  }

  let doc;
  try {
    doc = await loadSuiteDocument(suitePath);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  if (!doc.pipeline) {
    console.error(
      "suite.yaml has no pipeline block; use run, grade, and envelope commands separately",
    );
    return 2;
  }

  const suiteDir = suiteDirectoryFromPath(doc.suitePath);
  const steps = getOption(args.options, "steps");
  const maxConcurrent = getOptionInt(args.options, "max-concurrent", 4);
  const progressMode = resolveProgressMode(args.options);
  const useProgressColor =
    progressMode !== "json" && resolveProgressColor(args.options);

  const projection = parseEnvelopeProjection(
    getOption(args.options, "projection"),
  );
  if (getOption(args.options, "projection") && !projection) {
    console.error(
      "invalid --projection; expected envelope, trajectory, or instances",
    );
    return 2;
  }

  const overrides: PipelineCliOverrides = {};
  const runOutput = getOption(args.options, "output");
  if (runOutput) {
    overrides.run = {
      output: resolveOverridePath(runOutput, suiteDir),
      maxConcurrent,
    };
  }
  const reportOverride = getOption(args.options, "report");
  if (reportOverride) {
    overrides.grade = {
      ...overrides.grade,
      input: resolveOverridePath(reportOverride, suiteDir),
    };
    overrides.envelope = {
      ...overrides.envelope,
      report: resolveOverridePath(reportOverride, suiteDir),
    };
  }
  const gradingOutput = getOption(args.options, "grading-output");
  if (gradingOutput) {
    overrides.grade = {
      ...overrides.grade,
      output: resolveOverridePath(gradingOutput, suiteDir),
    };
  }
  const gradingInput = getOption(args.options, "grading");
  if (gradingInput) {
    overrides.envelope = {
      ...overrides.envelope,
      grading: resolveOverridePath(gradingInput, suiteDir),
    };
  }
  const envelopeOutput = getOption(args.options, "envelope-output");
  if (envelopeOutput) {
    overrides.envelope = {
      ...overrides.envelope,
      output: resolveOverridePath(envelopeOutput, suiteDir),
    };
  }
  if (projection) {
    overrides.envelope = {
      ...overrides.envelope,
      projection,
    };
  }

  if (doc.pipeline.grade && !doc.judge) {
    console.error("pipeline grade step requires inline judge: block in suite.yaml");
    return 2;
  }

  // Envelope provenance includes the harness-eval package version when available.
  const frameworkVersion = await readFrameworkVersion();

  try {
    const result = await runPipeline(doc, {
      steps,
      maxConcurrent,
      overrides,
      frameworkVersion,
      onRunProgress: createRunProgressHandler({
        mode: progressMode,
        maxConcurrent,
        color: useProgressColor,
      }),
      onGradeProgress: createGradeProgressHandler({
        mode: progressMode,
        maxConcurrent,
        color: useProgressColor,
      }),
    });
    return result.exitCode;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
}
