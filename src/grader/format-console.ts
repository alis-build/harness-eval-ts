/**
 * Console formatter for suite grading reports.
 */

import type { RepGradingResult, SuiteGradingReport } from "./types";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";

export function formatGradingConsole(
  report: SuiteGradingReport,
  color = true,
): string {
  const lines: string[] = [];

  if (report.results.length === 0) {
    lines.push(
      "No repetitions graded. Add expectations to the suite YAML or pass --expectations.",
    );
    return lines.join("\n");
  }

  for (const result of report.results) {
    const allPassed = result.summary.failed === 0 && !result.graderError;
    const status = allPassed
      ? color ? `${GREEN}PASS${RESET}` : "PASS"
      : color ? `${RED}FAIL${RESET}` : "FAIL";

    lines.push(
      `${result.caseId} @ ${result.cellLabel} rep${result.repetitionIndex}  ${status}`,
    );

    if (result.graderError) {
      lines.push(
        color
          ? `  ${RED}grader error: ${result.graderError}${RESET}`
          : `  grader error: ${result.graderError}`,
      );
    }

    for (const exp of result.expectations) {
      const marker = exp.passed
        ? color ? `${GREEN}✓${RESET}` : "✓"
        : color ? `${RED}✗${RESET}` : "✗";
      lines.push(`  ├─ ${exp.text} ${marker}`);
      if (!exp.passed || exp.evidence) {
        lines.push(
          color
            ? `  │  ${DIM}${exp.evidence}${RESET}`
            : `  │  ${exp.evidence}`,
        );
      }
    }

    const pct = (result.summary.passRate * 100).toFixed(0);
    lines.push(
      `  └─ ${result.summary.passed}/${result.summary.total} (${pct}%) expectations`,
    );
    lines.push("");
  }

  const overallPct = (report.summary.passRate * 100).toFixed(0);
  lines.push(
    `Overall: ${report.summary.passed}/${report.summary.total} (${overallPct}%) expectations passed`,
  );

  return lines.join("\n").trimEnd();
}

export function gradingReportPassed(report: SuiteGradingReport): boolean {
  return report.results.every(
    (r) => !r.graderError && r.summary.failed === 0 && r.summary.total > 0,
  );
}
