import { describe, expect, it } from "vitest";

import { evaluate } from "../../src/assertions/evaluator";
import { makeToolCall, makeView } from "../helpers/factory";

describe("compound assertions", () => {
  const view = makeView({
    toolCalls: [makeToolCall({ name: "mcp__api__search_skills" })],
    finalResponse: "done",
  });

  it("all_of", () => {
    const r = evaluate(view, {
      type: "all_of",
      assertions: [
        { type: "called", tool: "mcp__api__search_skills" },
        { type: "response_contains", text: "done" },
      ],
    });
    expect(r.passed).toBe(true);
    expect(r.children?.length).toBe(2);
  });

  it("any_of", () => {
    const r = evaluate(view, {
      type: "any_of",
      assertions: [
        { type: "called", tool: "WebSearch" },
        { type: "called", tool: "mcp__api__search_skills" },
      ],
    });
    expect(r.passed).toBe(true);
  });

  it("not", () => {
    const r = evaluate(view, {
      type: "not",
      assertion: { type: "called", tool: "WebSearch" },
    });
    expect(r.passed).toBe(true);
  });

  it("empty all_of passes vacuously", () => {
    expect(evaluate(view, { type: "all_of", assertions: [] }).passed).toBe(true);
  });

  it("empty any_of fails", () => {
    expect(evaluate(view, { type: "any_of", assertions: [] }).passed).toBe(false);
  });
});
