import { describe, expect, it } from "vitest";

import { buildEvalRunEnvelope } from "../../src/eval-record/build";
import {
  toAgentTrace,
  toProtoInstances,
  toTrajectory,
} from "../../src/eval-interchange/projections";
import type { SuiteReport } from "../../src/runner/types";
import { makeToolCall, makeView } from "../helpers/factory";

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
        reference_trajectory: [
          { tool_name: "SearchSkills", tool_input: { query: "deploy" } },
        ],
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
  it("stores interchange fields on repetitions during envelope build", () => {
    const envelope = buildEvalRunEnvelope(makeReport());
    const rep = envelope.cells[0].repetitions[0];

    expect(rep.predicted_trajectory).toEqual([
      {
        tool_name: "SearchSkills",
        tool_input: JSON.stringify({ query: "deploy" }),
      },
    ]);
    expect(rep.agent_trace?.turns).toHaveLength(1);
    expect(rep.latency_in_seconds).toBe(1);
    expect(rep.failure).toBe(0);
    expect(rep.trajectoryMetrics?.trajectory_exact_match).toBe(1);
    expect(rep.toolCallMetrics?.tool_name_match).toBe(1);
    expect(envelope.cells[0].reference_trajectory).toEqual([
      { tool_name: "SearchSkills", tool_input: { query: "deploy" } },
    ]);
    expect(envelope.cells[0].human_ratings).toEqual({ quality: 4 });
  });

  it("projects envelope data to trajectory rows", () => {
    const envelope = buildEvalRunEnvelope(makeReport());
    const rows = toTrajectory(envelope);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.predicted_trajectory[0]?.tool_name).toBe("SearchSkills");
    expect(rows[0]?.predicted_trajectory[0]?.tool_input).toEqual({
      query: "deploy",
    });
    expect(rows[0]?.response).toBe("Found deploy skills");
    expect(rows[0]?.human_ratings).toEqual({ quality: 4 });
  });

  it("projects envelope data to proto instances", () => {
    const envelope = buildEvalRunEnvelope(makeReport());
    const instances = toProtoInstances(envelope);

    expect(instances).toHaveLength(1);
    expect(instances[0]?.predicted_trajectory.tool_calls[0]?.tool_input).toBe(
      JSON.stringify({ query: "deploy" }),
    );
  });

  it("projects envelope data to agent traces", () => {
    const envelope = buildEvalRunEnvelope(makeReport());
    const traces = toAgentTrace(envelope);

    expect(traces).toHaveLength(1);
    expect(traces[0]?.turns[0]?.events.some((event) =>
      event.content.parts.some((part) => part.function_call?.name === "SearchSkills"),
    )).toBe(true);
  });
});
