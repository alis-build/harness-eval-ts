/**
 * Reporter options and intermediate render model.
 */

import type { SuiteReport } from "../runner/types";

/** Output format selector for {@link formatReport}. */
export type ReportFormat = "console" | "markdown" | "json";

/** Options for suite report formatting. */
export interface ReporterOptions {
  format: ReportFormat;
  baseline?: SuiteReport;
  color?: boolean;
}

/** One assertion stat row in the renderable intermediate model. */
export interface RenderableStat {
  description: string;
  threshold: number;
  passedCount: number;
  evaluatedCount: number;
  totalReps: number;
  adapterErrors: number;
  passRate: number;
  meetsThreshold: boolean;
  baselinePassRate?: number;
  delta?: number;
}

/** One (case, cell) row ready for console or markdown formatters. */
export interface RenderableRow {
  caseId: string;
  category?: string;
  notes?: string;
  cellLabel: string;
  passed: boolean;
  adapterErrors: number;
  totalReps: number;
  stats: RenderableStat[];
}
