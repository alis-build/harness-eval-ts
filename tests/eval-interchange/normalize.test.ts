import { describe, expect, it } from "vitest";

import {
  normalizeReferenceToolName,
  toProtojsonTrajectory,
} from "../../src/eval-interchange/normalize";
import { makeToolCall } from "../helpers/factory";

describe("toProtojsonTrajectory", () => {
  it("wraps tool calls in toolCalls with camelCase keys", () => {
    const trajectory = toProtojsonTrajectory([
      makeToolCall({ name: "SearchSkills", args: { query: "deploy" } }),
    ]);

    expect(trajectory).toEqual({
      toolCalls: [
        {
          toolName: "SearchSkills",
          toolInput: JSON.stringify({ query: "deploy" }),
        },
      ],
    });
  });

  it("serializes object tool_input from suite reference steps", () => {
    const trajectory = toProtojsonTrajectory([
      { tool_name: "ListLandingZones", tool_input: {} },
    ]);

    expect(trajectory.toolCalls[0]).toEqual({
      toolName: "ListLandingZones",
      toolInput: "{}",
    });
  });

  it("preserves full harness tool names in harness mode", () => {
    const trajectory = toProtojsonTrajectory(
      [
        {
          tool_name: "mcp__plugin_alis-build_api__ListLandingZones",
          tool_input: "{}",
        },
      ],
      { toolNameMode: "harness" },
    );

    expect(trajectory.toolCalls[0]?.toolName).toBe(
      "mcp__plugin_alis-build_api__ListLandingZones",
    );
  });

  it("strips MCP prefix on predicted trajectories in bare mode", () => {
    const trajectory = toProtojsonTrajectory(
      [
        {
          tool_name: "mcp__plugin_alis-build_api__ListLandingZones",
          tool_input: "{}",
        },
      ],
      { toolNameMode: "bare" },
    );

    expect(trajectory.toolCalls[0]?.toolName).toBe("ListLandingZones");
  });
});

describe("normalizeReferenceToolName", () => {
  it("returns harness names unchanged in harness mode", () => {
    expect(
      normalizeReferenceToolName(
        "mcp__plugin_alis-build_api__ListLandingZones",
        "harness",
      ),
    ).toBe("mcp__plugin_alis-build_api__ListLandingZones");
  });

  it("strips MCP namespace prefix in bare mode", () => {
    expect(
      normalizeReferenceToolName(
        "mcp__plugin_alis-build_api__ListLandingZones",
        "bare",
      ),
    ).toBe("ListLandingZones");
  });

  it("leaves non-namespaced tool names unchanged in bare mode", () => {
    expect(normalizeReferenceToolName("SearchSkills", "bare")).toBe(
      "SearchSkills",
    );
  });
});
