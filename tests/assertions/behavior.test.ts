import { describe, expect, it } from "vitest";

import { evaluate } from "../../src/assertions/evaluator";
import { makeToolCall, makeView } from "../helpers/factory";

describe("behavior assertions", () => {
  it("responded_without_tool_calls — blind answer", () => {
    const blind = makeView({ toolCalls: [], finalResponse: "I can help with that" });
    expect(evaluate(blind, { type: "responded_without_tool_calls" }).passed).toBe(true);
    const withTools = makeView({
      toolCalls: [makeToolCall({ name: "Bash" })],
    });
    expect(evaluate(withTools, { type: "responded_without_tool_calls" }).passed).toBe(false);
  });

  it("iterations_within", () => {
    const view = makeView({ usage: { inputTokens: 1, outputTokens: 1, totalCostUsd: 0, durationMs: 100, numTurns: 3 } });
    expect(evaluate(view, { type: "iterations_within", max: 5 }).passed).toBe(true);
    expect(evaluate(view, { type: "iterations_within", max: 2 }).passed).toBe(false);
  });

  it("cost_within_usd", () => {
    const view = makeView({ usage: { inputTokens: 1, outputTokens: 1, totalCostUsd: 0.05, durationMs: 100, numTurns: 1 } });
    expect(evaluate(view, { type: "cost_within_usd", max: 0.1 }).passed).toBe(true);
  });

  it("duration_within_ms", () => {
    const view = makeView({ usage: { inputTokens: 1, outputTokens: 1, totalCostUsd: 0, durationMs: 500, numTurns: 1 } });
    expect(evaluate(view, { type: "duration_within_ms", max: 1000 }).passed).toBe(true);
  });

  it("finished_with", () => {
    const view = makeView({ finalStopReason: "end_turn" });
    expect(evaluate(view, { type: "finished_with", reasons: "end_turn" }).passed).toBe(true);
    expect(evaluate(view, { type: "finished_with", reasons: ["end_turn", "max_tokens"] }).passed).toBe(true);
  });

  it("response_contains / not_contains / matches", () => {
    const view = makeView({ finalResponse: "Step 1: deploy neuron" });
    expect(evaluate(view, { type: "response_contains", text: "deploy" }).passed).toBe(true);
    expect(evaluate(view, { type: "response_not_contains", text: "forbidden" }).passed).toBe(true);
    expect(evaluate(view, { type: "response_matches", pattern: "step \\d+:", flags: "i" }).passed).toBe(true);
  });

  it("predicate escape hatch", () => {
    const view = makeView();
    const r = evaluate(view, {
      type: "predicate",
      fn: (v) => v.finalResponse.includes("hello"),
      description: "custom",
    });
    expect(r.passed).toBe(true);
  });
});
