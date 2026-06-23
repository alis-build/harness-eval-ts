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

  it("rejects unsupported adapter", () => {
    expect(() =>
      resolveGradeOptions({
        judge: { adapter: "other" },
      }),
    ).toThrow(/unsupported grading adapter/);
  });
});
