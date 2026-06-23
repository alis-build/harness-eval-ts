import { describe, expect, it } from "vitest";

import { describePattern, toolMatches } from "../../src/assertions/patterns";

describe("patterns", () => {
  it("literal match", () => {
    expect(toolMatches("Bash", "Bash")).toBe(true);
    expect(toolMatches("Bash", "Read")).toBe(false);
  });

  it("glob match", () => {
    expect(toolMatches("mcp__api__search_skills", "mcp__api__*")).toBe(true);
    expect(toolMatches("Bash", "mcp__*")).toBe(false);
  });

  it("describePattern", () => {
    expect(describePattern("mcp__api__*")).toBe("mcp__api__*");
    expect(describePattern({ pattern: "Bash" })).toBe("Bash");
  });
});
