import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { gradeCommand } from "../../src/cli/commands/grade";
import * as graderModule from "../../src/grader/index";
import type { SuiteReport } from "../../src/runner/types";
import { makeView } from "../helpers/factory";

function makeReport(): SuiteReport {
  return {
    startedAt: new Date().toISOString(),
    durationMs: 100,
    cells: [
      {
        caseId: "smoke",
        prompt: "Say hello",
        expectations: ["Says hello"],
        cell: { label: "sonnet", config: {} },
        repetitions: [
          {
            repetitionIndex: 0,
            adapterResult: {
              view: makeView({ finalResponse: "Hello" }),
              diagnostics: {
                exitCode: 0,
                signal: null,
                stderr: "",
                parseErrors: [],
                timedOut: false,
                durationMs: 50,
              },
            },
            error: null,
            assertionResults: [],
            durationMs: 50,
          },
        ],
        assertionStats: [],
        adapterErrors: 0,
        passed: true,
      },
    ],
  };
}

describe("gradeCommand --suite", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads inline judge from unified suite.yaml", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harness-eval-grade-suite-"));
    const reportPath = join(dir, "report.json");
    const suitePath = join(dir, "suite.yaml");

    await writeFile(reportPath, JSON.stringify(makeReport()), "utf8");
    await writeFile(
      suitePath,
      [
        "adapter: claude-code",
        "matrix:",
        "  - label: sonnet",
        "    config: {}",
        "cases:",
        "  - id: smoke",
        "    prompt: Say hello",
        "    assertions:",
        "      - not:",
        "          responded_without_tool_calls: true",
        "judge:",
        "  adapter: claude-code",
        "  model: claude-sonnet-4-6",
      ].join("\n"),
      "utf8",
    );

    const gradeReport = vi.spyOn(graderModule, "gradeReport").mockResolvedValue({
      gradedAt: new Date().toISOString(),
      sourceReport: reportPath,
      results: [
        {
          caseId: "smoke",
          cellLabel: "sonnet",
          repetitionIndex: 0,
          prompt: "Say hello",
          expectations: [
            { text: "Says hello", passed: true, evidence: "mock" },
          ],
          summary: { passed: 1, failed: 0, total: 1, passRate: 1 },
          durationMs: 1,
        },
      ],
      summary: { passed: 1, failed: 0, total: 1, passRate: 1 },
    });

    const code = await gradeCommand({
      positional: [reportPath],
      options: { suite: suitePath, format: "json" },
    });

    expect(code).toBe(0);
    expect(gradeReport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        judgeAdapter: "claude-code",
        model: "claude-sonnet-4-6",
      }),
    );
  });

  it("returns 2 when both --config and --suite are provided", async () => {
    const code = await gradeCommand({
      positional: ["report.json"],
      options: { config: "grading.yaml", suite: "suite.yaml" },
    });
    expect(code).toBe(2);
  });
});
