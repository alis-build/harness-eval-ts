/**
 * Line-buffered NDJSON parser for Gemini CLI `stream-json` stdout.
 */

import type { Readable } from "node:stream";

import type { GeminiCliJsonEvent } from "./types";

/** Result of parsing one NDJSON line from Gemini stdout. */
export type GeminiCliParseResult =
  | { ok: true; event: GeminiCliJsonEvent; rawLine: string }
  | { ok: false; error: Error; rawLine: string };

/** Parse Gemini JSONL stdout into parsed event objects. */
export async function* parseGeminiCliJson(
  stream: Readable,
): AsyncGenerator<GeminiCliParseResult, void, void> {
  let buffer = "";
  stream.setEncoding("utf8");

  for await (const chunk of stream) {
    buffer += chunk as string;

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (line.length === 0) continue;
      yield tryParseLine(line);
    }
  }

  // Flush a final partial line when Gemini closes stdout without a trailing newline.
  const trailing = buffer.trim();
  if (trailing.length > 0) {
    yield tryParseLine(trailing);
  }
}

function tryParseLine(line: string): GeminiCliParseResult {
  try {
    const event = JSON.parse(line) as GeminiCliJsonEvent;
    return { ok: true, event, rawLine: line };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err : new Error(String(err)),
      rawLine: line,
    };
  }
}
