/**
 * Gemini CLI adapter — public API.
 */

import { TrajectoryBuilder } from "../../trajectory/builder";
import type { StreamEvent } from "../../types/stream";

import { AdapterError } from "../types";
import type { HarnessAdapter } from "../types";
import { describeGeminiCliExitCode } from "./exit-codes";
import { GeminiCliEventMapper } from "./map-events";
import { parseGeminiCliJson } from "./parse-json";
import { spawnGeminiCli } from "./process";
import type {
  AdapterDiagnostics,
  GeminiCliAdapterConfig,
  GeminiCliAdapterResult,
  ParseErrorRecord,
} from "./types";

export { AdapterError } from "../types";
export type {
  AdapterDiagnostics,
  AdapterResult,
  GeminiCliAdapterConfig,
  GeminiCliAdapterResult,
  GeminiCliJsonEvent,
  GeminiCliJsonOutput,
  GeminiCliOptions,
  GeminiCliStreamStats,
  ParseErrorRecord,
} from "./types";
export {
  resolveGeminiToolName,
  mapGeminiCliEvents,
  GeminiCliEventMapper,
} from "./map-events";
export { buildArgs, buildJudgeArgs, appendGeminiCliFlags } from "./flags";
export {
  describeGeminiCliExitCode,
  GEMINI_CLI_EXIT_CODES,
} from "./exit-codes";
export {
  spawnGeminiCli,
  prepareGeminiCliEnv,
  resolveGeminiConfigDir,
  GEMINI_CONFIG_DIR_ENV,
} from "./process";
export { parseGeminiCliJson } from "./parse-json";

/**
 * Run Gemini CLI in headless stream-json mode and return a trajectory.
 *
 * Maps NDJSON events through {@link GeminiCliEventMapper}, records parse
 * errors without aborting, and attaches {@link AdapterDiagnostics.exitCodeDescription}
 * for known non-zero exit codes (spec P-7).
 */
export async function runGeminiCli(
  config: GeminiCliAdapterConfig,
): Promise<GeminiCliAdapterResult> {
  const startTs = Date.now();
  const spawned = await spawnGeminiCli(config);

  const builder = new TrajectoryBuilder();
  const mapper = new GeminiCliEventMapper();
  const rawEvents: StreamEvent[] = [];
  const parseErrors: ParseErrorRecord[] = [];

  try {
    for await (const result of parseGeminiCliJson(spawned.stdout)) {
      if (!result.ok) {
        parseErrors.push({
          line: result.rawLine,
          error: result.error.message,
        });
        continue;
      }

      for (const event of mapper.map(result.event)) {
        builder.consume(event);
        rawEvents.push(event);
      }
    }

    const [{ exitCode, signal }, stderr] = await Promise.all([
      spawned.done,
      spawned.stderrCollected,
    ]);

    const exitCodeDescription = describeGeminiCliExitCode(exitCode);
    const diagnostics: AdapterDiagnostics = {
      exitCode,
      exitCodeDescription,
      signal,
      stderr,
      parseErrors,
      timedOut: spawned.timedOut(),
      durationMs: Date.now() - startTs,
    };

    let view;
    try {
      view = builder.build();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stderrHint =
        stderr.trim().length > 0
          ? ` stderr: ${stderr.trim().slice(0, 400)}`
          : "";
      const exitHint = exitCodeDescription ? ` (${exitCodeDescription})` : "";
      throw new AdapterError(
        `harness produced no usable trajectory: ${message}${exitHint}${stderrHint}`,
        diagnostics,
      );
    }

    return { view, diagnostics, rawEvents };
  } finally {
    await spawned.cleanup();
  }
}

/** Registered {@link HarnessAdapter} for Gemini CLI headless runs. */
export const geminiCliAdapter: HarnessAdapter<GeminiCliAdapterConfig> = {
  id: "gemini-cli",
  run: runGeminiCli,
};
