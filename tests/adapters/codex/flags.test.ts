import { describe, expect, it } from "vitest";

import { buildArgs, buildJudgeArgs, ensureHarnessOutputLastMessage } from "../../../src/adapters/codex/flags";
import type { CodexAdapterConfig } from "../../../src/adapters/codex/types";

describe("buildArgs", () => {
  it("uses codex exec --json with prompt last", () => {
    const args = buildArgs({ prompt: "hello" });
    expect(args.slice(0, 4)).toEqual([
      "--ask-for-approval",
      "never",
      "exec",
      "--json",
    ]);
    expect(args.at(-1)).toBe("hello");
  });

  it("maps core codex options", () => {
    const args = buildArgs({
      prompt: "x",
      captureLastMessage: false,
      model: "gpt-5.4",
      cwd: "/workspace",
      sandbox: "workspace-write",
      profile: "ci",
      addDirs: ["/extra"],
      configOverrides: ["web_search=\"cached\""],
      ephemeral: true,
      ignoreUserConfig: true,
      skipGitRepoCheck: true,
      outputSchema: "./schema.json",
      outputLastMessage: "./last.txt",
      dangerouslyBypassApprovalsAndSandbox: true,
    });

    expect(args).toContain("--model");
    expect(args).toContain("gpt-5.4");
    expect(args).toContain("--cd");
    expect(args).toContain("/workspace");
    expect(args).toContain("--sandbox");
    expect(args).toContain("workspace-write");
    expect(args).toContain("--profile");
    expect(args).toContain("ci");
    expect(args).toContain("--add-dir");
    expect(args).toContain("/extra");
    expect(args).toContain("-c");
    expect(args).toContain("web_search=\"cached\"");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("--ignore-user-config");
    expect(args).toContain("--skip-git-repo-check");
    expect(args).toContain("--output-schema");
    expect(args).toContain("./schema.json");
    expect(args).toContain("--output-last-message");
    expect(args).toContain("./last.txt");
    expect(args).toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  it("includes --output-last-message when set on config (via ensureHarnessOutputLastMessage)", () => {
    const config: CodexAdapterConfig = { prompt: "hello" };
    ensureHarnessOutputLastMessage(config);
    const args = buildArgs(config);

    expect(args).toContain("--output-last-message");
    expect(config.outputLastMessage).toBeTruthy();
    expect(args).toContain(config.outputLastMessage);
  });

  it("does not include --output-last-message when not set", () => {
    const args = buildArgs({ prompt: "hello", captureLastMessage: false });
    expect(args).not.toContain("--output-last-message");
  });
});

describe("buildJudgeArgs", () => {
  it("uses plain exec without --json", () => {
    const args = buildJudgeArgs("grade this", { model: "gpt-5.4" });
    expect(args.slice(0, 3)).toEqual(["--ask-for-approval", "never", "exec"]);
    expect(args).not.toContain("--json");
    expect(args).toContain("--model");
    expect(args).toContain("gpt-5.4");
    expect(args.at(-1)).toBe("grade this");
  });
});
