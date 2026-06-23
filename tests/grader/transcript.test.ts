import { describe, expect, it } from "vitest";

import { trajectoryToTranscript } from "../../src/grader/transcript";
import { makeToolCall, makeView } from "../helpers/factory";

describe("trajectoryToTranscript", () => {
  it("includes prompt, tool calls, and metadata", () => {
    const call = makeToolCall({
      name: "mcp__plugin_alis-build_api__ListLandingZones",
      callId: "tu-1",
      args: { query: "lz" },
      result: { zones: ["aibake"] },
      turnIndex: 0,
      callIndex: 0,
    });
    const view = makeView({
      toolCalls: [call],
      turns: [
        {
          turnIndex: 0,
          text: "Listing zones.",
          toolCalls: [call],
          stopReason: "tool_use",
        },
      ],
      finalResponse: "Found zones.",
    });

    const transcript = trajectoryToTranscript(view, "list my landing zones");

    expect(transcript).toContain("list my landing zones");
    expect(transcript).toContain("ListLandingZones");
    expect(transcript).toContain("tu-1");
    expect(transcript).toContain("aibake");
    expect(transcript).toContain("success: true");
  });
});
