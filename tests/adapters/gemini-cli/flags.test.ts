import { describe, expect, it } from "vitest";

import { buildArgs, buildJudgeArgs } from "../../../src/adapters/gemini-cli/flags";

describe("buildArgs", () => {
  it("uses gemini -p with stream-json and prompt via -p", () => {
    const args = buildArgs({ prompt: "hello" });
    expect(args.slice(0, 5)).toEqual([
      "-p",
      "hello",
      "--output-format",
      "stream-json",
      "--approval-mode",
    ]);
    expect(args[5]).toBe("yolo");
  });

  it("defaults approvalMode to yolo", () => {
    const args = buildArgs({ prompt: "x" });
    expect(args).toContain("--approval-mode");
    expect(args).toContain("yolo");
  });

  it("defaults skipTrust to true for headless harness runs", () => {
    const args = buildArgs({ prompt: "hello" });
    expect(args).toContain("--skip-trust");
  });

  it("respects approvalMode override", () => {
    const args = buildArgs({ prompt: "x", approvalMode: "plan" });
    expect(args).toContain("--approval-mode");
    expect(args).toContain("plan");
    expect(args).not.toContain("yolo");
  });

  it("respects skipTrust: false override", () => {
    const args = buildArgs({ prompt: "hello", skipTrust: false });
    expect(args).not.toContain("--skip-trust");
  });

  it("maps core geminiCli options", () => {
    const args = buildArgs({
      prompt: "x",
      model: "gemini-2.5-pro",
      sandbox: "docker",
      skipTrust: true,
      includeDirectories: ["/extra"],
      allowedMcpServerNames: ["my-mcp-server"],
      extensions: ["ext-a"],
      debug: true,
    });

    expect(args).toContain("--model");
    expect(args).toContain("gemini-2.5-pro");
    expect(args).toContain("--sandbox");
    expect(args).toContain("docker");
    expect(args).toContain("--skip-trust");
    expect(args).toContain("--include-directories");
    expect(args).toContain("/extra");
    expect(args).toContain("--allowed-mcp-server-names");
    expect(args).toContain("my-mcp-server");
    expect(args).toContain("--extensions");
    expect(args).toContain("ext-a");
    expect(args).toContain("--debug");
  });
});

describe("buildJudgeArgs", () => {
  it("uses json output format with yolo approval by default", () => {
    const args = buildJudgeArgs("grade this", { model: "gemini-2.5-pro" });
    expect(args.slice(0, 5)).toEqual([
      "-p",
      "grade this",
      "--output-format",
      "json",
      "--approval-mode",
    ]);
    expect(args[5]).toBe("yolo");
    expect(args).toContain("--skip-trust");
    expect(args).toContain("--model");
    expect(args).toContain("gemini-2.5-pro");
  });

  it("respects approvalMode override for judge", () => {
    const args = buildJudgeArgs("grade", { approvalMode: "default" });
    expect(args).toContain("--approval-mode");
    expect(args).toContain("default");
  });
});
