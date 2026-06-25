/**
 * Known Gemini CLI exit codes for headless / stream-json runs.
 *
 * @see spec P-7 — preserve codes in diagnostics and surface human-readable labels.
 */

/** Documented Gemini CLI exit codes for headless harness runs (spec P-7). */
export const GEMINI_CLI_EXIT_CODES = {
  /** Normal completion. */
  SUCCESS: 0,
  /** Unhandled CLI or runtime failure. */
  ERROR: 1,
  /** Invalid prompt, flags, or stdin (exit 42). */
  INPUT_ERROR: 42,
  /** Agent exceeded configured turn budget (exit 53). */
  TURN_LIMIT: 53,
} as const;

/**
 * Return a short description for a non-zero Gemini CLI exit code.
 *
 * Used to populate {@link AdapterDiagnostics.exitCodeDescription} so reports
 * surface human-readable failure reasons without re-parsing stderr.
 */
export function describeGeminiCliExitCode(
  exitCode: number | null,
): string | undefined {
  if (exitCode === null || exitCode === GEMINI_CLI_EXIT_CODES.SUCCESS) {
    return undefined;
  }

  switch (exitCode) {
    case GEMINI_CLI_EXIT_CODES.ERROR:
      return "Gemini CLI exited with a general error (code 1)";
    case GEMINI_CLI_EXIT_CODES.INPUT_ERROR:
      return "Gemini CLI input error (code 42)";
    case GEMINI_CLI_EXIT_CODES.TURN_LIMIT:
      return "Gemini CLI turn limit exceeded (code 53)";
    default:
      return `Gemini CLI exited with code ${exitCode}`;
  }
}
