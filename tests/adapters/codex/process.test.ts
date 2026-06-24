import { describe, expect, it } from "vitest";

import { resolveCodexHome } from "../../../src/adapters/codex/process";

describe("resolveCodexHome", () => {
  it("returns undefined when isolateConfig is false", () => {
    expect(resolveCodexHome({ isolateConfig: false }, "/tmp/x")).toBeUndefined();
    expect(resolveCodexHome({}, "/tmp/x")).toBeUndefined();
  });

  it("returns temp dir when isolateConfig is true", () => {
    expect(resolveCodexHome({ isolateConfig: true }, "/tmp/codex-home")).toBe(
      "/tmp/codex-home",
    );
  });
});
