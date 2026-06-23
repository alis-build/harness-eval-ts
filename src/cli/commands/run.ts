/**
 * `harness-eval run` command.
 */

import { writeFile } from "node:fs/promises";

import { getAdapter } from "../../adapters/registry";
import { loadSuite } from "../../config/loader";
import { formatReport } from "../../reporter/index";
import { runSuite } from "../../runner/suite";
import type { SuiteReport } from "../../runner/types";
import { getOption, getOptionInt, type ParsedArgs } from "../args";
import {
  createRunProgressHandler,
  resolveProgressColor,
  resolveProgressMode,
} from "../progress";
import { writeOtelArtifacts } from "./otel-output";

export async function runCommand(args: ParsedArgs): Promise<number> {
  const suitePath = args.positional[0];
  if (!suitePath) {
    console.error("usage: harness-eval run <suite.yaml> [options]");
    return 2;
  }

  const format = getOption(args.options, "format") ?? "console";
  const outputPath = getOption(args.options, "output");
  const otelOutputDir = getOption(args.options, "otel-output");
  const baselinePath = getOption(args.options, "baseline");
  const maxConcurrent = getOptionInt(args.options, "max-concurrent", 4);
  const adapterId = getOption(args.options, "adapter");
  const progressMode = resolveProgressMode(args.options);
  const useProgressColor =
    progressMode !== "json" && resolveProgressColor(args.options);

  let suite;
  try {
    suite = await loadSuite(suitePath);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  const adapter = getAdapter(adapterId ?? suite.adapter ?? "claude-code");

  const onProgress = createRunProgressHandler({
    mode: progressMode,
    maxConcurrent,
    color: useProgressColor,
  });

  const report = await runSuite(suite, {
    adapter,
    maxConcurrent,
    onProgress,
  });

  if (outputPath) {
    await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  }

  if (otelOutputDir) {
    const count = await writeOtelArtifacts(suite, report, otelOutputDir);
    process.stderr.write(`otel: wrote ${count} trace file(s) to ${otelOutputDir}\n`);
  }

  let baseline: SuiteReport | undefined;
  if (baselinePath) {
    const { readFile } = await import("node:fs/promises");
    baseline = JSON.parse(await readFile(baselinePath, "utf8")) as SuiteReport;
  }

  const formatted = formatReport(report, {
    format:
      format === "markdown" || format === "json" ? format : "console",
    baseline,
    color: format === "console",
  });

  process.stdout.write(formatted);
  if (!formatted.endsWith("\n")) process.stdout.write("\n");

  return report.cells.every((c) => c.passed) ? 0 : 1;
}
