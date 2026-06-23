import { describe, expect, it } from "vitest";

import { ConfigError, parseSuite } from "../../src/config/loader";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const suitesDir = join(import.meta.dirname, "../fixtures/suites");

describe("config loader", () => {
  it("loads valid nested suite", () => {
    const yaml = readFileSync(join(suitesDir, "valid.yaml"), "utf8");
    const suite = parseSuite(yaml);
    expect(suite.adapter).toBe("claude-code");
    expect(suite.cases[0].id).toBe("deploy-implicit");
    expect(suite.defaultConfig?.claudeCode?.permissionMode).toBe("bypassPermissions");
  });

  it("resolves relative paths against the suite file directory", () => {
    const yaml = readFileSync(join(suitesDir, "valid.yaml"), "utf8");
    const suitePath = join(suitesDir, "valid.yaml");
    const suite = parseSuite(yaml, suitePath);
    const cellConfig = suite.matrix[0].config.claudeCode as { pluginDirs?: string[] };
    const pluginDir = cellConfig.pluginDirs?.[0];
    expect(pluginDir).toContain("plugins/v1.2.0");
    expect(pluginDir?.startsWith("./")).toBe(false);
    expect(pluginDir).toContain(join("suites", "plugins"));
  });

  it("rejects invalid assertion shape", () => {
    const yaml = `matrix:
  - label: x
    config: {}
cases:
  - id: bad
    prompt: hi
    assertions:
      - unknown_assertion: true
`;
    expect(() => parseSuite(yaml)).toThrow(ConfigError);
  });

  it("rejects invalid threshold", () => {
    const yaml = `matrix:
  - label: x
    config: {}
cases:
  - id: bad
    prompt: hi
    assertions:
      - called: Bash
        threshold: 1.5
`;
    expect(() => parseSuite(yaml)).toThrow(ConfigError);
  });
});
