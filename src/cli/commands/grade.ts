/**
 * `harness-eval grade` — LLM outcome grading on a suite report.
 */

import { writeFile } from "node:fs/promises";

import { loadGradingConfig } from "../../config/grading-loader";
import {
  formatGradingConsole,
  gradeReport,
  gradingReportPassed,
  loadSuiteReport,
  resolveGradeOptions,
} from "../../grader/index";
import { getOption, getOptionInt, type ParsedArgs } from "../args";
import {
  createGradeProgressHandler,
  resolveProgressColor,
  resolveProgressMode,
} from "../progress";

/** Parse an optional integer CLI flag; returns undefined when absent or invalid. */
function optionalOptionInt(
  options: Record<string, string | boolean>,
  name: string,
): number | undefined {
  const raw = getOption(options, name);
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Execute `harness-eval grade`: LLM outcome grading on a suite report JSON.
 *
 * @returns 0 when all expectations pass, 1 on failure, 2 on usage/load errors or no reps graded.
 */
export async function gradeCommand(args: ParsedArgs): Promise<number> {
  const reportPath = args.positional[0];
  if (!reportPath) {
    console.error(
      "usage: harness-eval grade <report.json> [--config grading.yaml] [--expectations path] [--output path] [--model id] [--timeout-ms N] [--max-concurrent N]",
    );
    return 2;
  }

  const configPath = getOption(args.options, "config");
  const expectationsPath = getOption(args.options, "expectations");
  const outputPath = getOption(args.options, "output");
  const model = getOption(args.options, "model");
  const binary = getOption(args.options, "binary");
  const timeoutMs = optionalOptionInt(args.options, "timeout-ms");
  const maxConcurrentRaw = getOption(args.options, "max-concurrent");
  const maxConcurrent = maxConcurrentRaw
    ? getOptionInt(args.options, "max-concurrent", 2)
    : undefined;
  const format = getOption(args.options, "format") ?? "console";
  const progressMode = resolveProgressMode(args.options);
  const useProgressColor =
    progressMode !== "json" && resolveProgressColor(args.options);

  let fileConfig;
  if (configPath) {
    try {
      fileConfig = await loadGradingConfig(configPath);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 2;
    }
  }

  let report;
  try {
    report = await loadSuiteReport(reportPath);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  let gradeOptions;
  try {
    gradeOptions = resolveGradeOptions(
      fileConfig,
      {
        sourceReport: reportPath,
        expectationsPath,
        model,
        binary,
        timeoutMs,
        maxConcurrent,
      },
      configPath,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  const onProgress = createGradeProgressHandler({
    mode: progressMode,
    maxConcurrent: gradeOptions.maxConcurrent ?? 2,
    color: useProgressColor,
  });

  const grading = await gradeReport(report, {
    ...gradeOptions,
    onProgress,
  });

  if (outputPath) {
    await writeFile(outputPath, JSON.stringify(grading, null, 2), "utf8");
  }

  if (format === "json") {
    process.stdout.write(JSON.stringify(grading, null, 2));
    process.stdout.write("\n");
  } else {
    const formatted = formatGradingConsole(grading, format === "console");
    process.stdout.write(formatted);
    if (!formatted.endsWith("\n")) process.stdout.write("\n");
  }

  if (grading.results.length === 0) {
    return 2;
  }

  return gradingReportPassed(grading) ? 0 : 1;
}
