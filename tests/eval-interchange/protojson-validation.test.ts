import { describe, expect, it } from "vitest";

import {
  deserializeProtojsonFixture,
  loadProtojsonFixture,
  roundTripProtojsonFixture,
  type ProtojsonMessageType,
} from "../helpers/protojson-validation";

const FIXTURE_TYPES: ProtojsonMessageType[] = [
  "EvaluationInstance",
  "Trajectory",
  "TrajectoryExactMatchInstance",
  "TrajectoryInOrderMatchInstance",
  "TrajectoryAnyOrderMatchInstance",
  "TrajectoryPrecisionInstance",
  "TrajectoryRecallInstance",
  "TrajectorySingleToolUseInstance",
];

describe("protojson fixture validation", () => {
  it.each(FIXTURE_TYPES)(
    "deserializes %s via @google-cloud/aiplatform protobuf types",
    async (messageType) => {
      const fixture = await loadProtojsonFixture(messageType);
      expect(() => deserializeProtojsonFixture(messageType, fixture)).not.toThrow();
    },
  );

  it("round-trips EvaluationInstance with camelCase keys", async () => {
    const fixture = await loadProtojsonFixture("EvaluationInstance");
    const roundTripped = roundTripProtojsonFixture("EvaluationInstance", fixture);

    expect(roundTripped.prompt).toEqual({ text: "Please list my landing zones" });
    expect(roundTripped.response).toEqual({
      text: "Here are your landing zones: aibake (ACTIVE), alis (FAILED).",
    });
  });

  it("round-trips TrajectoryPrecisionInstance with string toolInput", async () => {
    const fixture = await loadProtojsonFixture("TrajectoryPrecisionInstance");
    const roundTripped = roundTripProtojsonFixture(
      "TrajectoryPrecisionInstance",
      fixture,
    );

    expect(
      (roundTripped.predictedTrajectory as { toolCalls?: unknown[] } | undefined)
        ?.toolCalls,
    ).toHaveLength(3);
    expect(
      (
        roundTripped.predictedTrajectory as {
          toolCalls?: Array<{ toolName?: string; toolInput?: string }>;
        }
      )?.toolCalls?.[0],
    ).toEqual({
      toolName: "Read",
      toolInput: '{"file_path":"/tmp/MEMORY.md"}',
    });
    expect(
      (
        roundTripped.referenceTrajectory as {
          toolCalls?: Array<{ toolName?: string }>;
        }
      )?.toolCalls?.[0]?.toolName,
    ).toBe("mcp__plugin_alis-build_api__ListLandingZones");
  });

  it("does not populate toolCalls from snake_case keys (protojson contract)", () => {
    const message = deserializeProtojsonFixture("Trajectory", {
      tool_calls: [{ tool_name: "SearchSkills", tool_input: "{}" }],
    }) as { toolCalls?: unknown[]; toJSON: () => Record<string, unknown> };

    expect(message.toolCalls ?? []).toHaveLength(0);
    expect(message.toJSON()).toEqual({});
  });
});
