/**
 * Reporter options and intermediate render model.
 */

import type { SuiteReport } from "../runner/types";

export type ReportFormat = "console" | "markdown" | "json";

export interface ReporterOptions {
  format: ReportFormat;
  baseline?: SuiteReport;
  color?: boolean;
}

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
