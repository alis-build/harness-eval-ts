/**
 * Build the grader prompt for Claude subprocess grading.
 */

import type { GraderInput } from "./types";

export function buildGraderPrompt(input: GraderInput): string {
  const expectationList = input.expectations
    .map((e, i) => `${i + 1}. ${e}`)
    .join("\n");

  const prefix = input.systemInstruction
    ? `${input.systemInstruction.trim()}\n\n`
    : "";

  return `${prefix}You are an automated evaluation grader (not the agent under test). Your only job is to score expectations against the transcript below.

Your job is to evaluate each expectation against the transcript and final response.
PASS only when there is clear evidence in the transcript or final response.
When uncertain, FAIL — burden of proof is on PASS.

Also critique the expectations themselves if any are trivially satisfied or miss important outcomes.

## Eval prompt

${input.prompt}

## Execution transcript

${input.transcript}

## Expectations to grade

${expectationList}

## Output format

Respond with ONLY a single JSON object (no markdown fences, no commentary) matching this schema:

{
  "expectations": [
    { "text": "<original expectation>", "passed": true|false, "evidence": "<quote or description>" }
  ],
  "summary": { "passed": <int>, "failed": <int>, "total": <int>, "pass_rate": <0.0-1.0> },
  "eval_feedback": {
    "suggestions": [{ "assertion": "<optional>", "reason": "<string>" }],
    "overall": "<brief assessment>"
  }
}

Include every expectation in the same order. summary must match the expectations array.`;
}
