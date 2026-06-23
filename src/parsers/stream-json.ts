/**
 * Line-buffered NDJSON parser for Claude Code's `--output-format stream-json`.
 *
 * Claude Code emits one JSON object per line on stdout. The parser:
 *   - buffers across chunk boundaries (a single JSON line may arrive in two reads)
 *   - skips empty lines (defensive — shouldn't occur, but harmless if it does)
 *   - emits a discriminated `ParseResult` per line so callers can decide whether
 *     a malformed line should abort the run or just be logged.
 *
 * Why a generator (and not a Transform stream)?
 *   The eval adapter consumes events sequentially and synchronously updates a
 *   builder. Async iteration is the simplest interface for that pattern and
 *   composes cleanly with `for await` in the adapter. A Transform would force
 *   the builder into event-handler style.
 */

import type { Readable } from "node:stream";
import type { StreamEvent } from "../types/stream";

/**
 * Result of attempting to parse a single line.
 *
 * Successful parses yield `{ ok: true }` with the typed event and the raw line
 * (kept for diagnostics and OTel `events.attributes.raw`). Failed parses yield
 * `{ ok: false }` with the parse error and the raw line — callers can log,
 * skip, or fail the run as they see fit.
 */
export type ParseResult =
  | { ok: true; event: StreamEvent; rawLine: string }
  | { ok: false; error: Error; rawLine: string };

/**
 * Parse a readable stream of NDJSON into a sequence of typed stream-json events.
 *
 * @example
 *   const child = spawn("claude", ["-p", prompt, "--output-format", "stream-json", "--verbose"]);
 *   for await (const result of parseStreamJson(child.stdout)) {
 *     if (result.ok) builder.consume(result.event);
 *     else console.warn("malformed stream line:", result.rawLine, result.error);
 *   }
 */
export async function* parseStreamJson(
  stream: Readable,
): AsyncGenerator<ParseResult, void, void> {
  let buffer = "";
  // The Node child_process stdout is a binary stream by default. Setting the
  // encoding here means `for await (const chunk of stream)` yields strings.
  stream.setEncoding("utf8");

  for await (const chunk of stream) {
    buffer += chunk as string;

    // Drain every complete line currently in the buffer before reading more.
    // Multiple JSON objects can arrive in one chunk (e.g. when the harness
    // emits a burst of events at session start).
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (line.length === 0) continue;
      yield tryParseLine(line);
    }
  }

  // Flush any trailing content that arrived without a final newline. Stream-json
  // typically ends with a newline-terminated `result` event, but a killed
  // process may not flush, so we still try to emit what we have.
  const trailing = buffer.trim();
  if (trailing.length > 0) {
    yield tryParseLine(trailing);
  }
}

/**
 * Parse a single line. Extracted as a helper so the generator stays readable.
 *
 * Note: we do not validate the event structure beyond `JSON.parse`. Runtime
 * validation (e.g. zod) is overkill here — the schema is stable enough at
 * runtime, and the TrajectoryBuilder is tolerant of missing fields. Adding
 * validation would be premature.
 */
function tryParseLine(line: string): ParseResult {
  try {
    const event = JSON.parse(line) as StreamEvent;
    return { ok: true, event, rawLine: line };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err : new Error(String(err)),
      rawLine: line,
    };
  }
}
