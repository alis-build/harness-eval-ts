import { describe, expect, it } from "vitest";

import { evaluate } from "../../src/assertions/evaluator";
import { makeToolCall, makeView } from "../helpers/factory";

describe("tool-call assertions", () => {
  const view = makeView({
    toolCalls: [
      makeToolCall({ name: "mcp__api__search_skills", args: { query: "deploy" }, turnIndex: 0, callIndex: 0 }),
      makeToolCall({ name: "mcp__api__load_skill", turnIndex: 1, callIndex: 1 }),
      makeToolCall({ name: "Bash", turnIndex: 2, callIndex: 2 }),
    ],
  });

  it("called — positive", () => {
    const r = evaluate(view, { type: "called", tool: "mcp__api__search_skills" });
    expect(r.passed).toBe(true);
  });

  it("called — negative", () => {
    const r = evaluate(view, { type: "called", tool: "WebSearch" });
    expect(r.passed).toBe(false);
  });

  it("called with times", () => {
    const r = evaluate(view, { type: "called", tool: "Bash", times: "== 1" });
    expect(r.passed).toBe(true);
  });

  it("not_called", () => {
    expect(evaluate(view, { type: "not_called", tool: "WebSearch" }).passed).toBe(true);
    expect(evaluate(view, { type: "not_called", tool: "Bash" }).passed).toBe(false);
  });

  it("called_any_of", () => {
    const r = evaluate(view, {
      type: "called_any_of",
      tools: ["mcp__api__load_skill", "WebSearch"],
    });
    expect(r.passed).toBe(true);
  });

  it("called_all_of", () => {
    const r = evaluate(view, {
      type: "called_all_of",
      tools: ["mcp__api__search_skills", "mcp__api__load_skill"],
    });
    expect(r.passed).toBe(true);
    const fail = evaluate(view, {
      type: "called_all_of",
      tools: ["mcp__api__search_skills", "WebSearch"],
    });
    expect(fail.passed).toBe(false);
  });

  it("called_before", () => {
    const r = evaluate(view, {
      type: "called_before",
      first: "mcp__api__search_skills",
      then: "mcp__api__load_skill",
    });
    expect(r.passed).toBe(true);
  });

  it("sequence", () => {
    const r = evaluate(view, {
      type: "sequence",
      tools: ["mcp__api__search_skills", "mcp__api__load_skill"],
    });
    expect(r.passed).toBe(true);
  });

  it("called_with args", () => {
    const r = evaluate(view, {
      type: "called_with",
      tool: "mcp__api__search_skills",
      args: { query: { contains: "deploy" } },
    });
    expect(r.passed).toBe(true);
  });

  it("glob pattern", () => {
    const r = evaluate(view, { type: "called", tool: { pattern: "mcp__api__*" } });
    expect(r.passed).toBe(true);
  });
});
