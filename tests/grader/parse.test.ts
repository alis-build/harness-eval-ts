import { describe, expect, it } from "vitest";

import { extractClaudeResponseText, parseGraderJson } from "../../src/grader/parse";

describe("parseGraderJson", () => {
  it("parses bare JSON grading output", () => {
    const raw = JSON.stringify({
      expectations: [
        {
          text: "lists zones",
          passed: true,
          evidence: "mentions aibake",
        },
      ],
      summary: { passed: 1, failed: 0, total: 1, pass_rate: 1 },
      eval_feedback: { suggestions: [], overall: "solid" },
    });

    const parsed = parseGraderJson(raw);
    expect(parsed?.expectations[0]?.passed).toBe(true);
    expect(parsed?.summary.passRate).toBe(1);
  });

  it("extracts JSON from markdown fences", () => {
    const text =
      'Here is the result:\n```json\n{"expectations":[{"text":"a","passed":true,"evidence":"b"}],"summary":{"passed":1,"failed":0,"total":1,"pass_rate":1}}\n```';
    const parsed = parseGraderJson(text);
    expect(parsed?.summary.total).toBe(1);
  });

  it("extracts result field from single-object claude json output", () => {
    const stdout = JSON.stringify({
      type: "result",
      result:
        '{"expectations":[{"text":"x","passed":true,"evidence":"y"}],"summary":{"passed":1,"failed":0,"total":1,"pass_rate":1}}',
    });
    const text = extractClaudeResponseText(stdout);
    const parsed = parseGraderJson(text);
    expect(parsed?.expectations[0]?.passed).toBe(true);
  });
});
