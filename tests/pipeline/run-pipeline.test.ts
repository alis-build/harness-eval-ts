import { access } from "node:fs/promises";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SuiteDocument } from "../../src/config/suite-document";
import type { SuiteGradingReport } from "../../src/grader/types";
import { runPipeline } from "../../src/pipeline/run-pipeline";
import type { SuiteReport } from "../../src/runner/types";
import { makeView } from "../helpers/factory";

const tmpDir = join(import.meta.dirname, "../.tmp-run-pipeline");

function minimalSuiteDoc(overrides?: Partial<SuiteDocument>): SuiteDocument {
  return {
    suitePath: join(tmpDir, "suite.yaml"),
    suite: {
      adapter: "claude-code",
      defaultConfig: {},
      matrix: [{ label: "default", config: {}, axes: {} }],
      cases: [
        {
          id: "t1",
          prompt: "hello",
          assertions: [],
        },
      ],
    },
    pipeline: {
      run: { output: join(tmpDir, "report.json") },
      grade: { output: join(tmpDir, "grading.json") },
      envelope: {
        output: join(tmpDir, "envelope.json"),
        projection: "envelope",
      },
    },
    judge: {
      adapter: "claude-code",
      model: "claude-sonnet-4-6",
    },
    ...overrides,
  };
}

function stubReport(passed = true): SuiteReport {
  return {
    startedAt: new Date().toISOString(),
    durationMs: 100,
    cells: [
      {
        caseId: "t1",
        cell: { label: "default", config: {}, axes: {} },
        prompt: "hello",
        repetitions: [],
        assertionStats: [],
        adapterErrors: 0,
        passed,
      },
    ],
  } as SuiteReport;
}

function fullReport(): SuiteReport {
  return {
    startedAt: new Date().toISOString(),
    durationMs: 100,
    cells: [
      {
        caseId: "t1",
        cell: { label: "default", config: {}, axes: {} },
        prompt: "hello",
        repetitions: [
          {
            repetitionIndex: 0,
            adapterResult: {
              view: makeView({ finalResponse: "done" }),
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

function failedGradingReport(): SuiteGradingReport {
  return {
    gradedAt: new Date().toISOString(),
    sourceReport: join(tmpDir, "report.json"),
    results: [
      {
        caseId: "t1",
        cellLabel: "default",
        repetitionIndex: 0,
        prompt: "hello",
        expectations: [
          { text: "must pass", passed: false, evidence: "not satisfied" },
        ],
        summary: { passed: 0, failed: 1, total: 1, passRate: 0 },
        durationMs: 1,
      },
    ],
    summary: { passed: 0, failed: 1, total: 1, passRate: 0 },
  };
}

describe("runPipeline", () => {
  beforeEach(async () => {
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("throws ConfigError when pipeline block is missing", async () => {
    const doc = minimalSuiteDoc({ pipeline: undefined });
    await expect(runPipeline(doc)).rejects.toThrow(/no pipeline block/);
  });

  it("throws ConfigError when grade step lacks judge block", async () => {
    const doc = minimalSuiteDoc({ judge: undefined });
    await writeFile(join(tmpDir, "report.json"), JSON.stringify(stubReport()), "utf8");
    await expect(
      runPipeline(doc, { steps: "grade" }),
    ).rejects.toThrow(/judge/);
  });

  it("run step writes report and returns exitCode 0 on pass", async () => {
    const report = stubReport(true);
    vi.spyOn(await import("../../src/runner/suite"), "runSuite").mockResolvedValue(report);

    const doc = minimalSuiteDoc();
    const result = await runPipeline(doc, { steps: "run" });

    expect(result.exitCode).toBe(0);
    expect(result.stepsRun).toEqual(["run"]);
    expect(result.runReport).toBeDefined();
    const written = JSON.parse(await readFile(join(tmpDir, "report.json"), "utf8"));
    expect(written.cells[0].caseId).toBe("t1");
  });

  it("run step returns exitCode 1 when behavioral assertions fail", async () => {
    const report = stubReport(false);
    vi.spyOn(await import("../../src/runner/suite"), "runSuite").mockResolvedValue(report);

    const doc = minimalSuiteDoc();
    const result = await runPipeline(doc, { steps: "run" });

    expect(result.exitCode).toBe(1);
    expect(result.stepsRun).toEqual(["run"]);
  });

  it("envelope-only step returns exitCode 1 when grading artifact failed outcome", async () => {
    const reportPath = join(tmpDir, "report.json");
    const gradingPath = join(tmpDir, "grading.json");
    const suitePath = join(tmpDir, "suite.yaml");
    await writeFile(reportPath, JSON.stringify(fullReport()), "utf8");
    await writeFile(gradingPath, JSON.stringify(failedGradingReport()), "utf8");
    await writeFile(
      suitePath,
      [
        "adapter: claude-code",
        "matrix:",
        "  - label: default",
        "    config: {}",
        "cases:",
        "  - id: t1",
        "    prompt: hello",
        "pipeline:",
        "  run:",
        "    output: report.json",
        "  grade:",
        "    output: grading.json",
        "  envelope:",
        "    output: envelope.json",
        "judge:",
        "  adapter: claude-code",
      ].join("\n"),
      "utf8",
    );

    const doc = minimalSuiteDoc({ suitePath });
    const result = await runPipeline(doc, { steps: "envelope" });

    expect(result.exitCode).toBe(1);
    expect(result.stepsRun).toEqual(["envelope"]);
    const envelope = JSON.parse(
      await readFile(join(tmpDir, "envelope.json"), "utf8"),
    ) as { summary: { outcomePass?: boolean } };
    expect(envelope.summary.outcomePass).toBe(false);
  });

  it("grade failure stops pipeline before envelope step", async () => {
    await writeFile(join(tmpDir, "report.json"), JSON.stringify(fullReport()), "utf8");
    vi.spyOn(await import("../../src/grader/grade-report"), "gradeReport").mockResolvedValue(
      failedGradingReport(),
    );

    const doc = minimalSuiteDoc();
    const result = await runPipeline(doc, { steps: "grade,envelope" });

    expect(result.exitCode).toBe(1);
    expect(result.stepsRun).toEqual(["grade"]);
    await expect(access(join(tmpDir, "envelope.json"))).rejects.toThrow();
  });
});
