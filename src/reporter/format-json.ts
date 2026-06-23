/**
 * JSON report formatter (passthrough).
 */

import type { SuiteReport } from "../runner/types";

/**
 * Serialize a suite report as indented JSON (no transformation).
 *
 * Used by `--format json` and `--output` persistence.
 */
export function formatJson(report: SuiteReport): string {
  return JSON.stringify(report, null, 2);
}
