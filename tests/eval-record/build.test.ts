import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ClaudeCodeAdapterResult } from "../../src/adapters/claude-code/types";
import {
  buildEvalRunEnvelope,
  buildEvalRunEnvelopeFromFiles,
  EVAL_RUN_SCHEMA_VERSION,
  TRAJECTORY_SCHEMA_VERSION,
} from "../../src/eval-record/index";
import type { SuiteReport } from "../../src/runner/types";
import { makeView } from "../helpers/factory";

function makeReport(): SuiteReport {
  return {
    startedAt: "2026-06-23T12:00:00.000Z",
    durationMs: 1000,
    cells: [
      {
        caseId: "list-landing-zones",
        prompt: "Please list my landing zones",
        expectations: [
          "Response lists landing zones",
          "Response mentions weather",
        ],
        cell: { label: "sonnet", config: {}, axes: { model: "sonnet" } },
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
              rawEvents: [{ type: "system", subtype: "init" }],
            } as ClaudeCodeAdapterResult,
            error: null,
            assertionResults: [
              {
                passed: true,
                description: "called ListLandingZones",
                details: "ok",
              },
            ],
            durationMs: 500,
          },
        ],
        assertionStats: [
          {
            description: "called ListLandingZones",
            threshold: 1,
            passedCount: 1,
            evaluatedCount: 1,
            passRate: 1,
            meetsThreshold: true,
          },
        ],
        adapterErrors: 0,
        passed: true,
      },
    ],
  };
}

describe("buildEvalRunEnvelope", () => {
  it("builds a versioned envelope from a suite report", () => {
    const envelope = buildEvalRunEnvelope(makeReport(), {
      runId: "run-123",
      harness: { adapter: "claude-code", frameworkVersion: "0.1.0" },
      suite: { uri: "examples/basic.yaml", id: "smoke" },
    });

    expect(envelope.schemaVersion).toBe(EVAL_RUN_SCHEMA_VERSION);
    expect(envelope.runId).toBe("run-123");
    expect(envelope.harness.adapter).toBe("claude-code");
    expect(envelope.summary.cellsTotal).toBe(1);
    expect(envelope.summary.behavioralPass).toBe(true);
    expect(envelope.summary.outcomePass).toBeUndefined();

    const rep = envelope.cells[0].repetitions[0];
    expect(rep.trajectory?.schemaVersion).toBe(TRAJECTORY_SCHEMA_VERSION);
    expect(rep.artifacts?.transcript).toContain("Please list my landing zones");
    expect(rep.artifacts?.rawStreamEvents).toBeUndefined();
    expect(envelope.cells[0].behavioralPass).toBe(true);
    expect(envelope.cells[0].outcomePass).toBeUndefined();
  });

  it("merges outcome grades and computes outcomePass", () => {
    const envelope = buildEvalRunEnvelope(makeReport(), {
      grading: {
        judge: { id: "test-judge", model: "mock" },
        results: [
          {
            caseId: "list-landing-zones",
            cellLabel: "sonnet",
            repetitionIndex: 0,
            expectations: [
              { text: "Response lists landing zones", passed: true, evidence: "yes" },
              { text: "Response mentions weather", passed: false, evidence: "no" },
            ],
            summary: { passed: 1, failed: 1, total: 2, passRate: 0.5 },
          },
        ],
      },
    });

    const rep = envelope.cells[0].repetitions[0];
    expect(rep.outcomeGrades?.judge.id).toBe("test-judge");
    expect(rep.outcomeGrades?.summary.failed).toBe(1);
    expect(envelope.cells[0].outcomePass).toBe(false);
    expect(envelope.summary.outcomePass).toBe(false);
  });

  it("includes raw stream events when requested", () => {
    const envelope = buildEvalRunEnvelope(makeReport(), {
      includeRawStreamEvents: true,
    });

    expect(envelope.cells[0].repetitions[0].artifacts?.rawStreamEvents).toEqual([
      { type: "system", subtype: "init" },
    ]);
  });

  it("omits transcript when includeTranscript is false", () => {
    const envelope = buildEvalRunEnvelope(makeReport(), {
      includeTranscript: false,
    });

    expect(envelope.cells[0].repetitions[0].artifacts).toBeUndefined();
  });

  it("loads harness adapter and judge from suite and grading files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harness-eval-envelope-meta-"));
    const reportPath = join(dir, "report.json");
    const gradingPath = join(dir, "grading.json");
    const suitePath = join(dir, "suite.yaml");
    const gradingYamlPath = join(dir, "grading.yaml");

    await writeFile(
      reportPath,
      JSON.stringify(makeReport()),
    );
    await writeFile(
      suitePath,
      "adapter: codex\nmatrix:\n  - label: default\n    config: {}\n",
    );
    await mkdir(join(dir, "cases"));
    await writeFile(
      join(dir, "cases", "case.yaml"),
      "id: list-landing-zones\nprompt: Please list my landing zones\nassertions:\n  - called: Bash\n",
    );
    await writeFile(
      gradingYamlPath,
      "judge:\n  adapter: codex\n  model: gpt-5.4\n",
    );
    await writeFile(
      gradingPath,
      JSON.stringify({
        gradedAt: "2026-06-24T00:00:00.000Z",
        sourceReport: reportPath,
        gradingConfigPath: gradingYamlPath,
        results: [
          {
            caseId: "list-landing-zones",
            cellLabel: "sonnet",
            repetitionIndex: 0,
            prompt: "Please list my landing zones",
            expectations: [
              { text: "Response lists landing zones", passed: true, evidence: "yes" },
            ],
            summary: { passed: 1, failed: 0, total: 1, passRate: 1 },
            durationMs: 1,
          },
        ],
        summary: { passed: 1, failed: 0, total: 1, passRate: 1 },
      }),
    );

    const envelope = await buildEvalRunEnvelopeFromFiles(reportPath, {
      suitePath,
      gradingPath,
    });

    expect(envelope.harness.adapter).toBe("codex");
    expect(envelope.cells[0].repetitions[0].outcomeGrades?.judge).toEqual({
      id: "harness-eval/codex-grader",
      model: "gpt-5.4",
      adapter: "codex",
    });

    await rm(dir, { recursive: true, force: true });
  });

  it("uses judge embedded in grading.json when present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harness-eval-envelope-meta-"));
    const reportPath = join(dir, "report.json");
    const gradingPath = join(dir, "grading.json");

    await writeFile(reportPath, JSON.stringify(makeReport()));
    await writeFile(
      gradingPath,
      JSON.stringify({
        gradedAt: "2026-06-24T00:00:00.000Z",
        sourceReport: reportPath,
        judge: {
          id: "harness-eval/codex-grader",
          model: "gpt-5.4",
          adapter: "codex",
        },
        results: [
          {
            caseId: "list-landing-zones",
            cellLabel: "sonnet",
            repetitionIndex: 0,
            prompt: "Please list my landing zones",
            expectations: [
              { text: "Response lists landing zones", passed: true, evidence: "yes" },
            ],
            summary: { passed: 1, failed: 0, total: 1, passRate: 1 },
            durationMs: 1,
          },
        ],
        summary: { passed: 1, failed: 0, total: 1, passRate: 1 },
      }),
    );

    const envelope = await buildEvalRunEnvelopeFromFiles(reportPath, {
      gradingPath,
    });

    expect(envelope.cells[0].repetitions[0].outcomeGrades?.judge.id).toBe(
      "harness-eval/codex-grader",
    );

    await rm(dir, { recursive: true, force: true });
  });
});
