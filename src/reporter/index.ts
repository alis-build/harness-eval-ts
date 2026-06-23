/**
 * Reporter public API.
 */

import type { SuiteReport } from "../runner/types";
import { formatConsole } from "./format-console";
import { formatJson } from "./format-json";
import { formatMarkdown } from "./format-markdown";
import { applyBaseline, toRenderableRows } from "./renderable";
import type { ReporterOptions } from "./types";

export type { ReporterOptions, ReportFormat, RenderableRow } from "./types";

export function formatReport(
  report: SuiteReport,
  options: ReporterOptions,
): string {
  if (options.format === "json") {
    return formatJson(report);
  }

  let rows = toRenderableRows(report);
  if (options.baseline) {
    rows = applyBaseline(rows, options.baseline);
  }

  const useColor =
    options.color ?? (options.format === "console");

  if (options.format === "markdown") {
    return formatMarkdown(rows);
  }

  return formatConsole(rows, useColor);
}
