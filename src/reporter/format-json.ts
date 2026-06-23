/**
 * JSON report formatter (passthrough).
 */

import type { SuiteReport } from "../runner/types";

export function formatJson(report: SuiteReport): string {
  return JSON.stringify(report, null, 2);
}
