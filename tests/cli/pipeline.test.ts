import { describe, expect, it } from "vitest";

import { main } from "../../src/cli/main";

describe("pipeline CLI", () => {
  it("returns 2 when suite has no pipeline block", async () => {
    const code = await main([
      "pipeline",
      "examples/basic.yaml",
    ]);
    expect(code).toBe(2);
  });

  it("returns 2 when path is missing", async () => {
    const code = await main(["pipeline"]);
    expect(code).toBe(2);
  });
});
