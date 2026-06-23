import { describe, expect, it } from "vitest";

import type { HarnessAdapter } from "../../src/adapters/types";
import {
  getAdapter,
  listAdapters,
  registerAdapter,
} from "../../src/adapters/registry";
import { createMockAdapter } from "../helpers/mock-adapter";
import { makeView } from "../helpers/factory";

function withId(id: string, adapter = createMockAdapter()): HarnessAdapter {
  return { id, run: adapter.run.bind(adapter) };
}

describe("adapter registry", () => {
  it("lists built-in claude-code adapter", () => {
    expect(listAdapters()).toContain("claude-code");
  });

  it("registers an adapter retrievable via getAdapter", () => {
    const mock = withId("test-register", createMockAdapter(makeView()));

    registerAdapter("test-register", mock);

    expect(getAdapter("test-register")).toBe(mock);
  });

  it("throws on duplicate registration", () => {
    const mock = withId("test-duplicate");

    registerAdapter("test-duplicate", mock);

    expect(() => registerAdapter("test-duplicate", mock)).toThrow(
      /already registered/i,
    );
  });

  it("lists runtime-registered adapters alongside built-ins", () => {
    const mock = withId("test-list");

    registerAdapter("test-list", mock);

    const ids = listAdapters();
    expect(ids).toContain("claude-code");
    expect(ids).toContain("test-list");
  });

  it("getAdapter error lists all registered adapter IDs", () => {
    expect(() => getAdapter("nonexistent-adapter-id")).toThrow(
      /claude-code/,
    );
  });

  it("resolves and runs a runtime-registered mock adapter", async () => {
    const view = makeView({ meta: { ...makeView().meta, sessionId: "runtime-run" } });
    const mock = withId("test-runtime-run", createMockAdapter(view));

    registerAdapter("test-runtime-run", mock);

    const adapter = getAdapter("test-runtime-run");
    const result = await adapter.run({ prompt: "hello" });

    expect(result.view.meta.sessionId).toBe("runtime-run");
  });
});
