/**
 * Claude Code adapter — public API.
 */

import { parseStreamJson } from "../../parsers/stream-json";
import { TrajectoryBuilder } from "../../trajectory/builder";
import type { StreamEvent } from "../../types/stream";

import { AdapterError } from "../types";
import { spawnClaude } from "./process";
import type {
  AdapterDiagnostics,
  ClaudeCodeAdapterConfig,
  ClaudeCodeAdapterResult,
  ParseErrorRecord,
} from "./types";
import type { HarnessAdapter } from "../types";

export { AdapterError } from "../types";
export type {
  AdapterDiagnostics,
  AdapterResult,
  ClaudeCodeAdapterConfig,
  ClaudeCodeAdapterResult,
  ClaudeCodeOptions,
  ParseErrorRecord,
  PermissionMode,
} from "./types";

/**
 * Run Claude Code in headless mode and return a trajectory.
 */
export async function runClaudeCode(
  config: ClaudeCodeAdapterConfig,
): Promise<ClaudeCodeAdapterResult> {
  const startTs = Date.now();
  const spawned = await spawnClaude(config);

  const builder = new TrajectoryBuilder();
  const rawEvents: StreamEvent[] = [];
  const parseErrors: ParseErrorRecord[] = [];

  try {
    for await (const result of parseStreamJson(spawned.stdout)) {
      if (result.ok) {
        builder.consume(result.event);
        rawEvents.push(result.event);
      } else {
        parseErrors.push({
          line: result.rawLine,
          error: result.error.message,
        });
      }
    }

    const [{ exitCode, signal }, stderr] = await Promise.all([
      spawned.done,
      spawned.stderrCollected,
    ]);

    const diagnostics: AdapterDiagnostics = {
      exitCode,
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
      throw new AdapterError(
        `harness produced no usable trajectory: ${message}`,
        diagnostics,
      );
    }

    return { view, diagnostics, rawEvents };
  } finally {
    await spawned.cleanup();
  }
}

/** Registered {@link HarnessAdapter} for Claude Code headless runs. */
export const claudeCodeAdapter: HarnessAdapter<ClaudeCodeAdapterConfig> = {
  id: "claude-code",
  run: runClaudeCode,
};
