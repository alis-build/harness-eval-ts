import { describe, expect, it } from "vitest";

import { resolveGradeOptions } from "../../src/grader/resolve-grade-options";

describe("resolveGradeOptions", () => {
  it("merges file config with CLI overrides", () => {
    const resolved = resolveGradeOptions(
      {
        judge: {
          model: "claude-sonnet-4-6",
          timeoutMs: 60000,
          maxConcurrent: 1,
          env: { REGION: "eu" },
          claudeCode: { permissionMode: "bypassPermissions", binary: "claude" },
        },
      },
      {
        model: "claude-opus-4-6",
        timeoutMs: 120000,
      },
      "examples/grading.yaml",
    );

    expect(resolved.model).toBe("claude-opus-4-6");
    expect(resolved.timeoutMs).toBe(120000);
    expect(resolved.maxConcurrent).toBe(1);
    expect(resolved.env).toEqual({ REGION: "eu" });
    expect(resolved.gradingConfigPath).toBe("examples/grading.yaml");
    expect(resolved.claudeCode?.permissionMode).toBe("bypassPermissions");
  });

  it("passes system_instruction through as systemInstruction", () => {
    const resolved = resolveGradeOptions({
      judge: {
        system_instruction: "Grade conservatively.",
      },
    });

    expect(resolved.systemInstruction).toBe("Grade conservatively.");
  });

  it("uses CLI-only options when no file", () => {
    const resolved = resolveGradeOptions(undefined, {
      model: "claude-haiku",
      binary: "/usr/local/bin/claude",
    });
    expect(resolved.model).toBe("claude-haiku");
    expect(resolved.binary).toBe("/usr/local/bin/claude");
  });

  it("resolves codex judge adapter", () => {
    const resolved = resolveGradeOptions({
      judge: {
        adapter: "codex",
        model: "gpt-5.4",
        codex: { ephemeral: true, binary: "codex" },
      },
    });

    expect(resolved.judgeAdapter).toBe("codex");
    expect(resolved.model).toBe("gpt-5.4");
    expect(resolved.binary).toBe("codex");
    expect(resolved.codex?.ephemeral).toBe(true);
  });

  it("resolves gemini-cli judge adapter", () => {
    const resolved = resolveGradeOptions({
      judge: {
        adapter: "gemini-cli",
        model: "gemini-2.5-flash",
        env: { GOOGLE_CLOUD_PROJECT: "my-project" },
        geminiCli: { approvalMode: "yolo", binary: "gemini" },
      },
    });

    expect(resolved.judgeAdapter).toBe("gemini-cli");
    expect(resolved.model).toBe("gemini-2.5-flash");
    expect(resolved.binary).toBe("gemini");
    expect(resolved.env).toEqual({ GOOGLE_CLOUD_PROJECT: "my-project" });
    expect(resolved.geminiCli?.approvalMode).toBe("yolo");
    expect(resolved.geminiCli?.binary).toBeUndefined();
    expect(resolved.geminiCli?.model).toBeUndefined();
  });

  it("prefers geminiCli binary over claudeCode when adapter is gemini-cli", () => {
    const resolved = resolveGradeOptions({
      judge: {
        adapter: "gemini-cli",
        claudeCode: { binary: "claude" },
        geminiCli: { binary: "gemini-bin" },
      },
    });

    expect(resolved.binary).toBe("gemini-bin");
  });

  it("prefers codex binary over claudeCode when adapter is codex", () => {
    const resolved = resolveGradeOptions({
      judge: {
        adapter: "codex",
        claudeCode: { binary: "claude" },
        codex: { binary: "codex-bin" },
      },
    });

    expect(resolved.binary).toBe("codex-bin");
  });

  it("rejects unsupported adapter", () => {
    expect(() =>
      resolveGradeOptions({
        judge: { adapter: "other" },
      }),
    ).toThrow(/unsupported grading adapter/);
  });
});
