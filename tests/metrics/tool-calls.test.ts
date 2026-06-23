import { describe, expect, it } from "vitest";

import {
  computeToolCallMetrics,
  toolCallValid,
  toolNameMatch,
  toolParameterKeyMatch,
  toolParameterKvMatch,
} from "../../src/metrics/tool-calls";

describe("tool-call metrics", () => {
  const predicted = {
    tool_name: "SearchSkills",
    tool_input: { query: "deploy", limit: 5 },
  };
  const reference = {
    tool_name: "SearchSkills",
    tool_input: { query: "deploy", limit: 5 },
  };

  it("validates tool call structure", () => {
    expect(toolCallValid(predicted)).toBe(1);
    expect(toolCallValid({ tool_name: "", tool_input: "{}" })).toBe(0);
    expect(
      toolCallValid({ tool_name: "X", tool_input: "not-json" }),
    ).toBe(0);
  });

  it("matches tool names", () => {
    expect(toolNameMatch(predicted, reference)).toBe(1);
    expect(
      toolNameMatch(
        { tool_name: "Bash", tool_input: {} },
        reference,
      ),
    ).toBe(0);
  });

  it("matches parameter keys", () => {
    expect(toolParameterKeyMatch(predicted, reference)).toBe(1);
    expect(
      toolParameterKeyMatch(
        { tool_name: "SearchSkills", tool_input: { query: "deploy" } },
        reference,
      ),
    ).toBe(0);
  });

  it("matches parameter key-value pairs", () => {
    expect(toolParameterKvMatch(predicted, reference)).toBe(1);
    expect(
      toolParameterKvMatch(
        { tool_name: "SearchSkills", tool_input: { query: "other", limit: 5 } },
        reference,
      ),
    ).toBe(0);
  });

  it("aggregates metrics across pairs", () => {
    const metrics = computeToolCallMetrics([predicted], [reference]);
    expect(metrics.tool_call_valid).toBe(1);
    expect(metrics.tool_name_match).toBe(1);
    expect(metrics.tool_parameter_key_match).toBe(1);
    expect(metrics.tool_parameter_kv_match).toBe(1);
  });
});
