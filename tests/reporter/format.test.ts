import { describe, expect, it } from "vitest";

import { formatReport } from "../../src/reporter/index";
import type { SuiteReport } from "../../src/runner/types";

const sampleReport: SuiteReport = {
  startedAt: "2026-01-01T00:00:00.000Z",
  durationMs: 1000,
  cells: [
    {
      caseId: "deploy-implicit",
      category: "deploy-flow",
      cell: { label: "v1.2.0 / sonnet", config: {} },
      repetitions: [],
      adapterErrors: 2,
      passed: false,
      assertionStats: [
        {
          description: "called(mcp__api__search_skills)",
          threshold: 0.8,
          passedCount: 0,
          evaluatedCount: 0,
          passRate: 0,
          meetsThreshold: false,
        },
      ],
    },
    {
      caseId: "deploy-implicit",
      cell: { label: "v1.2.0 / sonnet", config: {} },
      repetitions: [],
      adapterErrors: 0,
      passed: true,
      assertionStats: [
        {
          description: "called(Bash)",
          threshold: 1,
          passedCount: 8,
          evaluatedCount: 10,
          passRate: 0.8,
          meetsThreshold: false,
        },
      ],
    },
  ],
};

describe("reporter", () => {
  it("formats console with adapter errors", () => {
    const out = formatReport(sampleReport, { format: "console", color: false });
    expect(out).toContain("FAIL");
    expect(out).toContain("adapter errors");
    expect(out).toContain("all reps crashed");
  });

  it("formats markdown table", () => {
    const out = formatReport(sampleReport, { format: "markdown" });
    expect(out).toContain("# Harness Eval Report");
    expect(out).toContain("| Assertion |");
  });

  it("formats json passthrough", () => {
    const out = formatReport(sampleReport, { format: "json" });
    const parsed = JSON.parse(out);
    expect(parsed.cells.length).toBe(2);
  });

  it("shows diff against baseline", () => {
    const baseline: SuiteReport = {
      ...sampleReport,
      cells: [
        {
          ...sampleReport.cells[1],
          assertionStats: [
            {
              ...sampleReport.cells[1].assertionStats[0],
              passRate: 0.5,
            },
          ],
        },
      ],
    };
    const out = formatReport(sampleReport, {
      format: "console",
      color: false,
      baseline,
    });
    expect(out).toContain("50%");
    expect(out).toContain("80%");
  });
});
