/**
 * Codex CLI adapter — public API.
 */

import { readFile } from "node:fs/promises";

import { TrajectoryBuilder } from "../../trajectory/builder";
import type { StreamEvent } from "../../types/stream";

import { AdapterError } from "../types";
import type { HarnessAdapter } from "../types";
import { CodexEventMapper } from "./map-events";
import { parseCodexJson } from "./parse-json";
import { spawnCodex } from "./process";
import type {
  AdapterDiagnostics,
  CodexAdapterConfig,
  CodexAdapterResult,
  ParseErrorRecord,
} from "./types";

export { AdapterError } from "../types";
export type {
  AdapterDiagnostics,
  AdapterResult,
  CodexAdapterConfig,
  CodexAdapterResult,
  CodexOptions,
  ParseErrorRecord,
} from "./types";
export { mcpToolName, mapCodexEvents, CodexEventMapper } from "./map-events";
export {
  buildArgs,
  buildJudgeArgs,
  appendCodexFlags,
  appendGlobalCodexFlags,
  appendExecCodexFlags,
  ensureHarnessOutputLastMessage,
} from "./flags";

/** Run Codex in headless `exec --json` mode and return a trajectory. */
export async function runCodex(
  config: CodexAdapterConfig,
): Promise<CodexAdapterResult> {
  const startTs = Date.now();
  const spawned = await spawnCodex(config);

  const builder = new TrajectoryBuilder();
  const mapper = new CodexEventMapper();
  const rawEvents: StreamEvent[] = [];
  const parseErrors: ParseErrorRecord[] = [];

  try {
    for await (const result of parseCodexJson(spawned.stdout)) {
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

    if (!view.finalResponse && config.outputLastMessage) {
      try {
        const lastMsg = await readFile(config.outputLastMessage, "utf8");
        if (lastMsg.trim()) {
          view.finalResponse = lastMsg.trim();
        }
      } catch {
        // Codex may omit the file when the run times out or exits before writing.
      }
    }

    return { view, diagnostics, rawEvents };
  } finally {
    await spawned.cleanup();
  }
}

/** Registered {@link HarnessAdapter} for Codex CLI headless runs. */
export const codexAdapter: HarnessAdapter<CodexAdapterConfig> = {
  id: "codex",
  run: runCodex,
};
