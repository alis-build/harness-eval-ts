import { describe, expect, it } from "vitest";

import type { ClaudeCodeAdapterResult } from "../../src/adapters/claude-code/types";
import {
  buildEvalRunEnvelope,
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
});
