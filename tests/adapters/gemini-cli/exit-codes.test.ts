import { describe, expect, it } from "vitest";

import {
  describeGeminiCliExitCode,
  GEMINI_CLI_EXIT_CODES,
} from "../../../src/adapters/gemini-cli/exit-codes";

describe("describeGeminiCliExitCode", () => {
  it("returns undefined for success codes", () => {
    expect(describeGeminiCliExitCode(0)).toBeUndefined();
    expect(describeGeminiCliExitCode(null)).toBeUndefined();
  });

  it("maps documented Gemini CLI exit codes", () => {
    expect(describeGeminiCliExitCode(GEMINI_CLI_EXIT_CODES.ERROR)).toContain(
      "code 1",
    );
    expect(describeGeminiCliExitCode(GEMINI_CLI_EXIT_CODES.INPUT_ERROR)).toContain(
      "code 42",
    );
    expect(describeGeminiCliExitCode(GEMINI_CLI_EXIT_CODES.TURN_LIMIT)).toContain(
      "code 53",
    );
  });

  it("describes unknown non-zero exit codes", () => {
    expect(describeGeminiCliExitCode(55)).toBe("Gemini CLI exited with code 55");
  });
});
