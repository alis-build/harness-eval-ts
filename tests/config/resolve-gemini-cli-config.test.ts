import { describe, expect, it } from "vitest";

import {
  resolveRunConfig,
  toGeminiCliConfig,
} from "../../src/config/resolve-config";

describe("toGeminiCliConfig", () => {
  it("merges generic and nested geminiCli layers", () => {
    const config = toGeminiCliConfig(
      [
        {
          model: "gemini-2.5-pro",
          geminiCli: { approvalMode: "yolo", sandbox: "docker" },
        },
        {
          timeoutMs: 60_000,
          geminiCli: { allowedMcpServerNames: ["my-mcp-server"] },
        },
      ],
      "do work",
    );

    expect(config.prompt).toBe("do work");
    expect(config.model).toBe("gemini-2.5-pro");
    expect(config.timeoutMs).toBe(60_000);
    expect(config.approvalMode).toBe("yolo");
    expect(config.sandbox).toBe("docker");
    expect(config.allowedMcpServerNames).toEqual(["my-mcp-server"]);
  });
});

describe("resolveRunConfig", () => {
  it("resolves gemini-cli adapter config", () => {
    const config = resolveRunConfig(
      "gemini-cli",
      [{ geminiCli: { approvalMode: "plan" }, timeoutMs: 30_000 }],
      "hello",
    );

    expect(config.prompt).toBe("hello");
    expect(config.approvalMode).toBe("plan");
    expect(config.timeoutMs).toBe(30_000);
  });
});
