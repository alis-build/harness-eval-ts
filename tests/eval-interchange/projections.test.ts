import { describe, expect, it } from "vitest";

import { buildEvalRunEnvelope } from "../../src/eval-record/build";
import {
  toInstancesJsonl,
  toTrajectory,
} from "../../src/eval-interchange/projections";
import type { SuiteReport } from "../../src/runner/types";
import { makeToolCall, makeView } from "../helpers/factory";
import {
  deserializeProtojsonFixture,
  roundTripProtojsonFixture,
} from "../helpers/protojson-validation";

function makeReport(): SuiteReport {
  const toolCall = makeToolCall({
    name: "SearchSkills",
    args: { query: "deploy" },
    callIndex: 0,
    turnIndex: 0,
    result: { skills: ["deploy"] },
  });

  return {
    startedAt: "2026-06-23T12:00:00.000Z",
    durationMs: 1000,
    cells: [
      {
        caseId: "skill-routing",
        prompt: "Find deploy skills",
        reference_trajectory: {
          steps: [{ tool_name: "SearchSkills", tool_input: { query: "deploy" } }],
        },
        human_ratings: { quality: 4 },
        cell: { label: "sonnet", config: {} },
        repetitions: [
          {
            repetitionIndex: 0,
            adapterResult: {
              view: makeView({
                toolCalls: [toolCall],
                turns: [
                  {
                    turnIndex: 0,
                    text: "Searching skills",
                    toolCalls: [toolCall],
                    stopReason: "tool_use",
                  },
                ],
                finalResponse: "Found deploy skills",
              }),
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

describe("eval interchange projections", () => {
  it("stores protojson fields on repetitions during envelope build", () => {
    const envelope = buildEvalRunEnvelope(makeReport());
    const rep = envelope.cells[0].repetitions[0];

    expect(rep.evaluationInstance).toEqual({
      prompt: { text: "Find deploy skills" },
      response: { text: "Found deploy skills" },
    });
    expect(rep.trajectoryInstances?.precision?.predictedTrajectory.toolCalls[0]).toEqual({
      toolName: "SearchSkills",
      toolInput: JSON.stringify({ query: "deploy" }),
    });
    expect(rep.latencySeconds).toBe(1);
    expect(rep.failure).toBe(0);
    expect(rep.harnessMetrics?.trajectoryExactMatch).toBe(1);
    expect(envelope.cells[0].referenceTrajectory?.toolCalls[0]?.toolName).toBe(
      "SearchSkills",
    );
    expect(envelope.cells[0].humanRatings).toEqual({ quality: 4 });
  });

  it("projects envelope data to trajectory rows", () => {
    const envelope = buildEvalRunEnvelope(makeReport());
    const rows = toTrajectory(envelope);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.evaluationInstance?.response?.text).toBe("Found deploy skills");
    expect(rows[0]?.humanRatings).toEqual({ quality: 4 });
  });

  it("projects envelope data to per-metric instances JSONL rows", () => {
    const envelope = buildEvalRunEnvelope(makeReport());
    const rows = toInstancesJsonl(envelope);

    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows[0]).toMatchObject({
      caseId: "skill-routing",
      repetitionIndex: 0,
      messageType: "TrajectoryExactMatchInstance",
    });

    const precision = rows.find((row) => row.messageType === "TrajectoryPrecisionInstance");
    expect(precision?.instance).toBeDefined();
    expect(() =>
      roundTripProtojsonFixture(
        "TrajectoryPrecisionInstance",
        precision!.instance as unknown as Record<string, unknown>,
      ),
    ).not.toThrow();
  });

  it("deserializes built trajectory instances via protobuf types", () => {
    const envelope = buildEvalRunEnvelope(makeReport());
    const precision = envelope.cells[0].repetitions[0].trajectoryInstances?.precision;

    expect(() =>
      deserializeProtojsonFixture(
        "TrajectoryPrecisionInstance",
        precision as unknown as Record<string, unknown>,
      ),
    ).not.toThrow();
  });
});
