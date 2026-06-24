import { describe, expect, it } from "vitest";

import { toCodexConfig } from "../../src/config/resolve-config";

describe("toCodexConfig", () => {
  it("merges generic and nested codex layers", () => {
    const config = toCodexConfig(
      [
        { model: "gpt-5.4", codex: { sandbox: "read-only" } },
        { timeoutMs: 60_000, codex: { ephemeral: true } },
      ],
      "do work",
    );

    expect(config.prompt).toBe("do work");
    expect(config.model).toBe("gpt-5.4");
    expect(config.timeoutMs).toBe(60_000);
    expect(config.sandbox).toBe("read-only");
    expect(config.ephemeral).toBe(true);
  });
});
