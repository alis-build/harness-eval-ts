/**
 * Markdown (GFM) report formatter.
 */

import type { RenderableRow } from "./types";

export function formatMarkdown(rows: RenderableRow[]): string {
  const lines: string[] = ["# Harness Eval Report", ""];

  for (const row of rows) {
    const status = row.passed ? "PASS" : "FAIL";
    const crashNote =
      row.adapterErrors > 0 ? ` (${row.adapterErrors} adapter errors)` : "";

    lines.push(`## ${row.caseId} @ ${row.cellLabel} — ${status}${crashNote}`);
    if (row.category) lines.push(`**Category:** ${row.category}`);
    if (row.notes) {
      lines.push("<details><summary>Notes</summary>", row.notes, "</details>");
    }
    lines.push("");
    lines.push("| Assertion | Result | Threshold | Status |");
    lines.push("| --- | --- | --- | --- |");

    for (const stat of row.stats) {
      const rateStr = formatRate(stat);
      const threshold = `${(stat.threshold * 100).toFixed(0)}%`;
      const statusCell = stat.meetsThreshold ? "✓" : "✗";
      let result = rateStr;
      if (stat.delta !== undefined && stat.baselinePassRate !== undefined) {
        const base = (stat.baselinePassRate * 100).toFixed(0);
        const cur = (stat.passRate * 100).toFixed(0);
        const d = (stat.delta * 100).toFixed(0);
        const sign = stat.delta >= 0 ? "+" : "";
        result += ` (${base}% → ${cur}%, ${sign}${d}%)`;
      }
      lines.push(`| ${stat.description} | ${result} | ${threshold} | ${statusCell} |`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatRate(stat: RenderableRow["stats"][number]): string {
  if (stat.evaluatedCount === 0) {
    return `0/${stat.totalReps} (all reps crashed)`;
  }
  const pct = (stat.passRate * 100).toFixed(0);
  return `${stat.passedCount}/${stat.evaluatedCount} (${pct}%)`;
}
