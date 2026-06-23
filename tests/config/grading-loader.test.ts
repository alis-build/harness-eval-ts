import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { join } from "node:path";

import { ConfigError } from "../../src/config/loader";
import { parseGradingConfig } from "../../src/config/grading-loader";

const fixturesDir = join(import.meta.dirname, "../fixtures/grading");

describe("grading config loader", () => {
  it("loads valid grading yaml", () => {
    const path = join(fixturesDir, "valid.yaml");
    const config = parseGradingConfig(readFileSync(path, "utf8"), path);
    expect(config.judge.model).toBe("claude-sonnet-4-6");
    expect(config.judge.maxConcurrent).toBe(3);
    expect(config.judge.env?.TEST_FLAG).toBe("1");
    expect(config.judge.claudeCode?.permissionMode).toBe("bypassPermissions");
    const settings = config.judge.claudeCode?.settings;
    expect(typeof settings).toBe("string");
    expect(settings as string).toContain("judge-settings.json");
    expect((settings as string).startsWith("./")).toBe(false);
  });

  it("rejects missing judge block", () => {
    expect(() => parseGradingConfig("model: foo\n", "bad.yaml")).toThrow(
      ConfigError,
    );
  });
});
