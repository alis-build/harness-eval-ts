/**
 * Console (ANSI) report formatter.
 */

import type { RenderableRow } from "./types";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";

export function formatConsole(rows: RenderableRow[], color = true): string {
  const lines: string[] = [];

  for (const row of rows) {
    const status = row.passed
      ? color ? `${GREEN}PASS${RESET}` : "PASS"
      : color ? `${RED}FAIL${RESET}` : "FAIL";

    const crashNote =
      row.adapterErrors > 0
        ? ` ${color ? YELLOW : ""}[${row.adapterErrors} adapter errors]${color ? RESET : ""}`
        : "";

    lines.push(`${row.caseId} @ ${row.cellLabel}  ${status}${crashNote}`);
    if (row.category) lines.push(`  category: ${row.category}`);

    for (const stat of row.stats) {
      const marker = stat.meetsThreshold
        ? color ? `${GREEN}✓${RESET}` : "✓"
        : color ? `${RED}✗${RESET}` : "✗";

      const rateStr = formatRate(stat);
      const thresholdPct = (stat.threshold * 100).toFixed(0);
      let line = `  ├─ ${stat.description}: ${rateStr} [threshold ${thresholdPct}%] ${marker}`;

      if (stat.delta !== undefined && stat.baselinePassRate !== undefined) {
        const arrow = stat.delta >= 0 ? "↑" : "↓";
        const basePct = (stat.baselinePassRate * 100).toFixed(0);
        const curPct = (stat.passRate * 100).toFixed(0);
        const deltaPct = (stat.delta * 100).toFixed(0);
        line += `  (${basePct}% → ${curPct}% (${arrow}${deltaPct}%))`;
      }

      lines.push(line);
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
