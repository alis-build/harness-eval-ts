/**
 * Parse grader JSON from Claude stdout / response text.
 */

import type {
  EvalFeedback,
  GradedExpectation,
  GradingSummary,
  GraderOutput,
} from "./types";

export function extractClaudeResponseText(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return "";

  try {
    const data = JSON.parse(trimmed) as unknown;

    if (Array.isArray(data)) {
      return extractFromEventArray(data) ?? trimmed;
    }

    if (typeof data === "object" && data !== null) {
      const event = data as { type?: string; result?: string; message?: unknown };
      if (event.type === "result" && typeof event.result === "string") {
        return event.result;
      }
      if (event.type === "assistant" && event.message) {
        const text = textFromAssistantMessage(event.message);
        if (text) return text;
      }
    }
  } catch {
    // fall through to raw stdout
  }

  return trimmed;
}

function extractFromEventArray(events: unknown[]): string | null {
  const result = events.find(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      (e as { type?: string }).type === "result",
  ) as { result?: string } | undefined;
  if (result?.result) return result.result;

  const assistantTexts: string[] = [];
  for (const event of events) {
    if (
      typeof event === "object" &&
      event !== null &&
      (event as { type?: string }).type === "assistant"
    ) {
      const text = textFromAssistantMessage(
        (event as { message?: unknown }).message,
      );
      if (text) assistantTexts.push(text);
    }
  }
  if (assistantTexts.length > 0) {
    return assistantTexts[assistantTexts.length - 1];
  }
  return null;
}

function textFromAssistantMessage(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;

  const texts: string[] = [];
  for (const block of content) {
    if (
      typeof block === "object" &&
      block !== null &&
      (block as { type?: string }).type === "text" &&
      typeof (block as { text?: string }).text === "string"
    ) {
      texts.push((block as { text: string }).text);
    }
  }
  return texts.length > 0 ? texts.join("\n") : null;
}

export function parseGraderJson(text: string): GraderOutput | null {
  const candidates = [text.trim(), extractJsonBlock(text)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const raw = JSON.parse(candidate) as RawGraderJson;
      const normalized = normalizeGraderJson(raw);
      if (normalized.expectations.length > 0) {
        return normalized;
      }
    } catch {
      continue;
    }
  }
  return null;
}

interface RawGraderJson {
  expectations?: Array<{
    text?: string;
    passed?: boolean;
    evidence?: string;
  }>;
  summary?: {
    passed?: number;
    failed?: number;
    total?: number;
    pass_rate?: number;
    passRate?: number;
  };
  eval_feedback?: {
    suggestions?: Array<{ assertion?: string; reason?: string }>;
    overall?: string;
  };
}

function extractJsonBlock(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return null;
}

function normalizeGraderJson(raw: RawGraderJson): GraderOutput {
  const expectations: GradedExpectation[] = (raw.expectations ?? []).map(
    (e) => ({
      text: e.text ?? "",
      passed: Boolean(e.passed),
      evidence: e.evidence ?? "",
    }),
  );

  const passed = expectations.filter((e) => e.passed).length;
  const failed = expectations.length - passed;
  const total = expectations.length;
  const passRate =
    raw.summary?.pass_rate ??
    raw.summary?.passRate ??
    (total === 0 ? 0 : passed / total);

  const summary: GradingSummary = {
    passed: raw.summary?.passed ?? passed,
    failed: raw.summary?.failed ?? failed,
    total: raw.summary?.total ?? total,
    passRate,
  };

  let evalFeedback: EvalFeedback | undefined;
  if (raw.eval_feedback) {
    evalFeedback = {
      suggestions: (raw.eval_feedback.suggestions ?? []).map((s) => ({
        assertion: s.assertion,
        reason: s.reason ?? "",
      })),
      overall: raw.eval_feedback.overall ?? "",
    };
  }

  return { expectations, summary, evalFeedback };
}
