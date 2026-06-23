import { describe, expect, it } from "vitest";

import { buildGraderPrompt } from "../../src/grader/prompt";

describe("buildGraderPrompt", () => {
  it("prefixes the prompt with system_instruction when provided", () => {
    const prompt = buildGraderPrompt({
      prompt: "List landing zones",
      transcript: "USER: List landing zones\nASSISTANT: Done",
      expectations: ["Lists landing zones"],
      systemInstruction: "You are a strict enterprise evaluator.",
    });

    expect(prompt.startsWith("You are a strict enterprise evaluator.")).toBe(
      true,
    );
    expect(prompt).toContain("List landing zones");
  });
});
