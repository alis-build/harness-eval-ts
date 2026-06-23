import { describe, expect, it } from "vitest";

import { buildArgs, buildJudgeArgs } from "../../../src/adapters/claude-code/flags";

describe("buildArgs", () => {
  it("includes headless flags", () => {
    const args = buildArgs({ prompt: "hello" });
    expect(args).toContain("-p");
    expect(args).toContain("hello");
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("--verbose");
  });

  it("maps core claude-specific options", () => {
    const args = buildArgs({
      prompt: "x",
      model: "claude-sonnet-4-6",
      permissionMode: "bypassPermissions",
      allowedTools: ["Bash", "Read"],
      pluginDirs: ["/plugins/a"],
      pluginUrls: ["https://example.com/plugin.zip"],
      addDirs: ["/workspace/apps"],
      mcpConfig: "/mcp.json",
      maxTurns: 10,
    });
    expect(args).toContain("--model");
    expect(args).toContain("claude-sonnet-4-6");
    expect(args).toContain("--permission-mode");
    expect(args).toContain("bypassPermissions");
    expect(args).toContain("--plugin-dir");
    expect(args).toContain("/plugins/a");
    expect(args).toContain("--plugin-url");
    expect(args).toContain("https://example.com/plugin.zip");
    expect(args).toContain("--add-dir");
    expect(args).toContain("/workspace/apps");
    expect(args).toContain("--mcp-config");
    expect(args).toContain("--max-turns");
    expect(args).toContain("10");
  });

  it("maps eval isolation and hook flags", () => {
    const args = buildArgs({
      prompt: "x",
      strictMcpConfig: true,
      includeHookEvents: true,
      noSessionPersistence: true,
      disableSlashCommands: true,
      bare: true,
      safeMode: true,
      dangerouslySkipPermissions: true,
      allowDangerouslySkipPermissions: true,
    });
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--include-hook-events");
    expect(args).toContain("--no-session-persistence");
    expect(args).toContain("--disable-slash-commands");
    expect(args).toContain("--bare");
    expect(args).toContain("--safe-mode");
    expect(args).toContain("--dangerously-skip-permissions");
    expect(args).toContain("--allow-dangerously-skip-permissions");
  });

  it("maps settings and prompt overrides", () => {
    const args = buildArgs({
      prompt: "x",
      settings: "./settings.json",
      settingSources: "user,project",
      effort: "high",
      agent: "reviewer",
      fallbackModel: "sonnet,haiku",
      tools: "Bash,Read",
      maxBudgetUsd: 5,
      appendSystemPrompt: "Always search skills first",
      appendSystemPromptFile: "./extra.txt",
      debug: "api,mcp",
      debugFile: "/tmp/claude.log",
    });
    expect(args).toContain("--settings");
    expect(args).toContain("./settings.json");
    expect(args).toContain("--setting-sources");
    expect(args).toContain("user,project");
    expect(args).toContain("--effort");
    expect(args).toContain("high");
    expect(args).toContain("--agent");
    expect(args).toContain("reviewer");
    expect(args).toContain("--fallback-model");
    expect(args).toContain("sonnet,haiku");
    expect(args).toContain("--tools");
    expect(args).toContain("Bash,Read");
    expect(args).toContain("--max-budget-usd");
    expect(args).toContain("5");
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("Always search skills first");
    expect(args).toContain("--append-system-prompt-file");
    expect(args).toContain("./extra.txt");
    expect(args).toContain("--debug");
    expect(args).toContain("api,mcp");
    expect(args).toContain("--debug-file");
    expect(args).toContain("/tmp/claude.log");
  });
});

describe("buildJudgeArgs", () => {
  it("uses json output and default bypass permission mode", () => {
    const args = buildJudgeArgs("grade this", {
      model: "claude-sonnet-4-6",
    });
    expect(args).toContain("-p");
    expect(args).toContain("grade this");
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args).not.toContain("stream-json");
    expect(args).not.toContain("--verbose");
    expect(args).toContain("--permission-mode");
    expect(args).toContain("bypassPermissions");
    expect(args).toContain("--model");
    expect(args).toContain("claude-sonnet-4-6");
  });
});
