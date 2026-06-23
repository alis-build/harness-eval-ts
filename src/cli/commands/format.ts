/**
 * `harness-eval format` command.
 */

import { readFile } from "node:fs/promises";

import { formatReport } from "../../reporter/index";
import type { SuiteReport } from "../../runner/types";
import { getOption, type ParsedArgs } from "../args";

/**
 * Execute `harness-eval format`: re-render a saved report JSON.
 *
 * @returns 0 when all cells pass, 1 otherwise, 2 on load errors.
 */
export async function formatCommand(args: ParsedArgs): Promise<number> {
  const reportPath = args.positional[0];
  if (!reportPath) {
    console.error("usage: harness-eval format <report.json> [options]");
    return 2;
  }

  const format = getOption(args.options, "format") ?? "console";
  const baselinePath = getOption(args.options, "baseline");

  let report: SuiteReport;
  try {
    report = JSON.parse(await readFile(reportPath, "utf8")) as SuiteReport;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  let baseline: SuiteReport | undefined;
  if (baselinePath) {
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
