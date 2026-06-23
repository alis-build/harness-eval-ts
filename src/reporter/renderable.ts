/**
 * SuiteReport → RenderableRow[] intermediate model.
 */

import type { CellReport, SuiteReport } from "../runner/types";
import type { RenderableRow, RenderableStat } from "./types";

export function toRenderableRows(report: SuiteReport): RenderableRow[] {
  return report.cells.map((cell) => cellToRow(cell));
}

export function applyBaseline(
  rows: RenderableRow[],
  baseline: SuiteReport,
): RenderableRow[] {
  const baselineMap = new Map(
    baseline.cells.map((c) => [`${c.caseId}::${c.cell.label}`, c]),
  );

  return rows.map((row) => {
    const baseCell = baselineMap.get(`${row.caseId}::${row.cellLabel}`);
    if (!baseCell) return row;

    const stats = row.stats.map((stat, i) => {
      const baseStat = baseCell.assertionStats[i];
      if (!baseStat) return stat;
      const delta = stat.passRate - baseStat.passRate;
      return {
        ...stat,
        baselinePassRate: baseStat.passRate,
        delta,
      };
    });

    return { ...row, stats };
  });
}

function cellToRow(cell: CellReport): RenderableRow {
  const totalReps = cell.repetitions.length;

  const stats: RenderableStat[] = cell.assertionStats.map((s) => ({
    description: s.description,
    threshold: s.threshold,
    passedCount: s.passedCount,
    evaluatedCount: s.evaluatedCount,
    totalReps,
    adapterErrors: cell.adapterErrors,
    passRate: s.passRate,
    meetsThreshold: s.meetsThreshold,
  }));

  return {
    caseId: cell.caseId,
    category: cell.category,
    notes: cell.notes,
    cellLabel: cell.cell.label,
    passed: cell.passed,
    adapterErrors: cell.adapterErrors,
    totalReps,
    stats,
  };
}
