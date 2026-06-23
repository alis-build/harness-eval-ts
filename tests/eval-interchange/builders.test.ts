import { describe, expect, it } from "vitest";

import { toEvaluationInstance } from "../../src/eval-interchange/protojson/evaluation-instance";
import { toHarnessMetrics } from "../../src/eval-interchange/protojson/harness-metrics";
import { toTrajectoryInstances } from "../../src/eval-interchange/protojson/trajectory-instances";
import { makeToolCall } from "../helpers/factory";
import {
  deserializeProtojsonFixture,
  roundTripProtojsonFixture,
} from "../helpers/protojson-validation";

describe("protojson builders", () => {
  it("builds EvaluationInstance with InstanceData text fields", () => {
    const instance = toEvaluationInstance({
      prompt: "Find deploy skills",
      response: "Found deploy skills",
    });

    expect(instance).toEqual({
      prompt: { text: "Find deploy skills" },
      response: { text: "Found deploy skills" },
    });
    expect(() =>
      deserializeProtojsonFixture(
        "EvaluationInstance",
        instance as unknown as Record<string, unknown>,
      ),
    ).not.toThrow();
  });

  it("builds trajectory instances with camelCase trajectories", () => {
    const toolCall = makeToolCall({
      name: "SearchSkills",
      args: { query: "deploy" },
    });
    const instances = toTrajectoryInstances({
      predicted: [toolCall],
      reference: [{ tool_name: "SearchSkills", tool_input: { query: "deploy" } }],
    });

    expect(instances.precision?.predictedTrajectory.toolCalls[0]).toEqual({
      toolName: "SearchSkills",
      toolInput: JSON.stringify({ query: "deploy" }),
    });

    const roundTripped = roundTripProtojsonFixture(
      "TrajectoryPrecisionInstance",
      instances.precision as unknown as Record<string, unknown>,
    );
    expect(
      (roundTripped.predictedTrajectory as { toolCalls?: Array<{ toolInput?: string }> })
        ?.toolCalls?.[0]?.toolInput,
    ).toBe(JSON.stringify({ query: "deploy" }));
  });

  it("builds camelCase harness metrics", () => {
    const toolCall = makeToolCall({
      name: "SearchSkills",
      args: { query: "deploy" },
    });
    const metrics = toHarnessMetrics(
      [toolCall],
      [{ tool_name: "SearchSkills", tool_input: { query: "deploy" } }],
    );

    expect(metrics).toEqual({
      trajectoryExactMatch: 1,
      trajectoryInOrderMatch: 1,
      trajectoryAnyOrderMatch: 1,
      trajectoryPrecision: 1,
      trajectoryRecall: 1,
      trajectorySingleToolUse: 1,
    });
  });

  it("matches MCP predicted names to bare reference steps in bare mode", () => {
    const toolCall = makeToolCall({
      name: "mcp__plugin_alis-build_api__ListLandingZones",
      args: {},
    });
    const reference = [{ tool_name: "ListLandingZones", tool_input: {} }];

    const bareMetrics = toHarnessMetrics([toolCall], reference, {
      referenceToolNameMode: "bare",
    });
    expect(bareMetrics.trajectoryExactMatch).toBe(1);

    const harnessMetrics = toHarnessMetrics([toolCall], reference, {
      referenceToolNameMode: "harness",
    });
    expect(harnessMetrics.trajectoryExactMatch).toBe(0);

    const instances = toTrajectoryInstances({
      predicted: [toolCall],
      reference,
      referenceToolNameMode: "bare",
    });
    expect(
      instances.precision?.predictedTrajectory.toolCalls[0]?.toolName,
    ).toBe("ListLandingZones");
    expect(
      instances.precision?.referenceTrajectory.toolCalls[0]?.toolName,
    ).toBe("ListLandingZones");
    expect(() =>
      roundTripProtojsonFixture(
        "TrajectoryPrecisionInstance",
        instances.precision as unknown as Record<string, unknown>,
      ),
    ).not.toThrow();
  });
});
