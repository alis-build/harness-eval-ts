import { describe, expect, it } from "vitest";

import { extractCodexResponseText } from "../../src/grader/parse";

describe("extractCodexResponseText", () => {
  it("returns plain stdout when not JSONL", () => {
    expect(extractCodexResponseText('{"expectations":[]}')).toBe(
      '{"expectations":[]}',
    );
  });

  it("extracts last assistant_message from JSONL", () => {
    const stdout = [
      '{"type":"thread.started","thread_id":"th_1"}',
      '{"type":"item.completed","item":{"id":"item_1","type":"assistant_message","text":"{\\"expectations\\":[]}"}}',
    ].join("\n");

    expect(extractCodexResponseText(stdout)).toBe('{"expectations":[]}');
  });
});
