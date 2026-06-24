import { describe, expect, it } from "vitest";

import { gradeReport } from "../../src/grader/grade-report";
import type { GraderFn } from "../../src/grader/types";
import type { SuiteReport } from "../../src/runner/types";
import { makeView } from "../helpers/factory";

const mockGrader: GraderFn = async (input) => ({
  expectations: input.expectations.map((text) => ({
    text,
    passed: text.includes("zones"),
    evidence: "mock evidence",
  })),
  summary: {
    passed: input.expectations.filter((e) => e.includes("zones")).length,
    failed: input.expectations.filter((e) => !e.includes("zones")).length,
    total: input.expectations.length,
    passRate:
      input.expectations.length === 0
        ? 0
        : input.expectations.filter((e) => e.includes("zones")).length /
          input.expectations.length,
  },
});

function makeReport(): SuiteReport {
  return {
    startedAt: new Date().toISOString(),
    durationMs: 1000,
    cells: [
      {
        caseId: "list-landing-zones",
        prompt: "Please list my landing zones",
        expectations: [
          "Response lists landing zones",
          "Response mentions weather",
        ],
        cell: { label: "sonnet", config: {} },
        repetitions: [
          {
            repetitionIndex: 0,
            adapterResult: {
              view: makeView({ finalResponse: "aibake ACTIVE" }),
              diagnostics: {
                exitCode: 0,
                signal: null,
                stderr: "",
                parseErrors: [],
                timedOut: false,
                durationMs: 500,
              },
            },
            error: null,
            assertionResults: [],
            durationMs: 500,
          },
        ],
        assertionStats: [],
        adapterErrors: 0,
        passed: true,
      },
    ],
  };
}

describe("gradeReport", () => {
  it("grades repetitions with expectations using injected grader", async () => {
    const grading = await gradeReport(makeReport(), { gradeFn: mockGrader });

    expect(grading.results.length).toBe(1);
    expect(grading.results[0].caseId).toBe("list-landing-zones");
    expect(grading.results[0].expectations[0].passed).toBe(true);
    expect(grading.results[0].expectations[1].passed).toBe(false);
    expect(grading.summary.total).toBe(2);
    expect(grading.summary.passed).toBe(1);
    expect(grading.judge).toEqual({
      id: "harness-eval/claude-grader",
      adapter: "claude-code",
    });
  });

  it("skips cells without expectations", async () => {
    const report = makeReport();
    report.cells[0].expectations = undefined;
    const grading = await gradeReport(report, { gradeFn: mockGrader });
    expect(grading.results.length).toBe(0);
  });

  it("records codex judge metadata when judgeAdapter is codex", async () => {
    const grading = await gradeReport(makeReport(), {
      gradeFn: mockGrader,
      judgeAdapter: "codex",
      model: "gpt-5.4",
    });

    expect(grading.judge).toEqual({
      id: "harness-eval/codex-grader",
      model: "gpt-5.4",
      adapter: "codex",
    });
  });
});
