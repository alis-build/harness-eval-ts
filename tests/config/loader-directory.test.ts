import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ConfigError, loadSuite, parseCasesFile } from "../../src/config/loader";

const fixturesDir = join(import.meta.dirname, "../fixtures/suites");

describe("directory-based suite loading", () => {
  it("loads suite.yaml plus cases from multiple files", async () => {
    const suite = await loadSuite(join(fixturesDir, "multi-file"));
    expect(suite.adapter).toBe("claude-code");
    expect(suite.defaultConfig?.model).toBe("claude-sonnet-4-6");
    expect(suite.matrix[0].label).toBe("default");
    expect(suite.cases.map((c) => c.id)).toEqual([
      "alpha-case",
      "beta-one",
      "beta-two",
      "gamma-case",
    ]);
  });

  it("resolves relative paths against the suite directory", async () => {
    const suite = await loadSuite(join(fixturesDir, "multi-file"));
    const cellConfig = suite.matrix[0].config.claudeCode as {
      pluginDirs?: string[];
    };
    const pluginDir = cellConfig.pluginDirs?.[0];
    expect(pluginDir).toContain("plugins/v1.0.0");
    expect(pluginDir?.startsWith("./")).toBe(false);
  });

  it("sorts cases by file path then array order", async () => {
    const suite = await loadSuite(join(fixturesDir, "multi-file"));
    expect(suite.cases.map((c) => c.id)).toEqual([
      "alpha-case",
      "beta-one",
      "beta-two",
      "gamma-case",
    ]);
  });

  it("throws when suite.yaml is missing in a directory", async () => {
    await expect(
      loadSuite(join(fixturesDir, "multi-file-no-suite")),
    ).rejects.toThrow(ConfigError);
  });

  it("throws when a case file fails validation with file path in error", async () => {
    await expect(
      loadSuite(join(fixturesDir, "multi-file-invalid-case")),
    ).rejects.toThrow(/bad\.yaml/);
  });

  it("throws when directory has no cases", async () => {
    await expect(
      loadSuite(join(fixturesDir, "multi-file-empty-cases")),
    ).rejects.toThrow(ConfigError);
  });
});

describe("parseCasesFile", () => {
  const minimalCase = `
id: single
prompt: hello
assertions:
  - called: Read
`;

  it("parses a single case object", () => {
    const cases = parseCasesFile(minimalCase, "case.yaml");
    expect(cases).toHaveLength(1);
    expect(cases[0].id).toBe("single");
  });

  it("parses an array of cases", () => {
    const yaml = `
- id: a
  prompt: one
  assertions:
    - called: Read
- id: b
  prompt: two
  assertions:
    - called: Bash
`;
    const cases = parseCasesFile(yaml, "cases.yaml");
    expect(cases.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("parses a { cases: [...] } wrapper", () => {
    const yaml = `
cases:
  - id: wrapped
    prompt: wrapped prompt
    assertions:
      - called: Edit
`;
    const cases = parseCasesFile(yaml, "wrapped.yaml");
    expect(cases).toHaveLength(1);
    expect(cases[0].id).toBe("wrapped");
  });

  it("includes source path in validation errors", () => {
    const yaml = `
id: bad
prompt: hi
assertions:
  - unknown_assertion: true
`;
    expect(() => parseCasesFile(yaml, "/path/to/bad.yaml")).toThrow(/bad\.yaml/);
  });
});
