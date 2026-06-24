---
type: Playbook
title: Custom Judges
description: How to replace the built-in Claude grader with a custom judge function — using your own model, evaluation service, or scoring logic.
tags: [grading, judges, customization, programmatic]
timestamp: 2026-06-24T00:00:00Z
---

# When to use a custom judge

The built-in Claude grader works well for general-purpose outcome evaluation. Use a custom judge when you need to:

- Use a different model or provider (GPT-4, Gemini, a fine-tuned model)
- Connect to an external evaluation service (LangSmith, Ragas, UpTrain)
- Apply deterministic scoring logic (e.g., regex matching, schema validation)
- Control costs more precisely (e.g., batch calls to an API)
- Implement specialized rubrics for a specific domain

# GraderFn interface

```typescript
type GraderFn = (input: GraderInput) => Promise<GraderOutput>;

interface GraderInput {
  prompt: string;               // the original user prompt
  transcript: string;           // text transcript of the trajectory
  expectations: string[];       // expected outcome strings from suite YAML
  view: TrajectoryView;         // full trajectory (for custom analysis)
  caseId: string;
  cellLabel: string;
  repetitionIndex: number;
}

interface GraderOutput {
  expectations: GradedExpectation[];
  summary: GradingSummary;
}

interface GradedExpectation {
  expectation: string;          // original expectation text
  passed: boolean;
  score?: number;               // 0–1 score (optional)
  rationale?: string;           // judge's explanation
}

interface GradingSummary {
  total: number;
  passed: number;
  failed: number;
  skipped?: number;
}
```

# Basic custom judge

```typescript
import { loadSuite, loadGradingConfig } from "@alis-build/harness-eval/config";
import { runSuite, gradeReport, resolveGradeOptions } from "@alis-build/harness-eval";

const suite = await loadSuite("./eval/suite.yaml");
const report = await runSuite(suite, { maxConcurrent: 4 });

// Simple rule-based judge
const grading = await gradeReport(report, {
  gradeFn: async ({ prompt, transcript, expectations, view }) => {
    const results = expectations.map(expectation => {
      // Example: check that the transcript mentions a keyword
      const keyword = extractKeyword(expectation);
      const passed = keyword ? transcript.toLowerCase().includes(keyword) : true;
      return {
        expectation,
        passed,
        rationale: passed
          ? `Found "${keyword}" in transcript`
          : `"${keyword}" not found in transcript`,
      };
    });

    return {
      expectations: results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
      },
    };
  },
});
```

# Using a different LLM provider

```typescript
import Anthropic from "@anthropic-ai/sdk";
// or: import OpenAI from "openai";

const client = new Anthropic();

const grading = await gradeReport(report, {
  gradeFn: async ({ transcript, expectations }) => {
    const systemPrompt = `You are a strict evaluator. For each expectation, respond with JSON:
{"results": [{"expectation": "...", "passed": true/false, "rationale": "..."}]}`;

    const userMessage = `
Transcript:
${transcript}

Evaluate these expectations:
${expectations.map((e, i) => `${i + 1}. ${e}`).join("\n")}
`;

    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "{}";
    const parsed = JSON.parse(raw) as { results: GradedExpectation[] };

    return {
      expectations: parsed.results,
      summary: {
        total: parsed.results.length,
        passed: parsed.results.filter(r => r.passed).length,
        failed: parsed.results.filter(r => !r.passed).length,
      },
    };
  },
});
```

# Connecting to an external eval service

```typescript
import { gradeReport } from "@alis-build/harness-eval";

const grading = await gradeReport(report, {
  gradeFn: async ({ prompt, transcript, expectations, caseId, repetitionIndex }) => {
    // POST to your evaluation service
    const response = await fetch("https://eval.example.com/grade", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.EVAL_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        id: `${caseId}:${repetitionIndex}`,
        prompt,
        transcript,
        rubric: expectations,
      }),
    });

    const result = await response.json() as {
      scores: Array<{ criterion: string; score: number; feedback: string }>;
    };

    const graded = result.scores.map((s, i) => ({
      expectation: expectations[i],
      passed: s.score >= 0.7,
      score: s.score,
      rationale: s.feedback,
    }));

    return {
      expectations: graded,
      summary: {
        total: graded.length,
        passed: graded.filter(e => e.passed).length,
        failed: graded.filter(e => !e.passed).length,
      },
    };
  },
});
```

# Using the TrajectoryView in the judge

The `GraderInput.view` field gives you direct access to the full `TrajectoryView`, enabling judges that go beyond transcript text:

```typescript
gradeFn: async ({ view, expectations }) => {
  // Example: judge based on which tools were called, not the text response
  const toolNames = view.toolCalls.map(tc => tc.tool);
  const totalCost = view.usage.totalCostUsd ?? 0;

  return {
    expectations: expectations.map(expectation => {
      if (expectation.includes("SearchSkills")) {
        const called = toolNames.includes("mcp__plugin__SearchSkills");
        return { expectation, passed: called, rationale: called ? "Called" : "Not called" };
      }
      if (expectation.includes("cost")) {
        const withinBudget = totalCost <= 0.05;
        return { expectation, passed: withinBudget, rationale: `Cost: $${totalCost.toFixed(4)}` };
      }
      return { expectation, passed: true, rationale: "No specific check" };
    }),
    summary: { total: expectations.length, passed: expectations.length, failed: 0 },
  };
},
```

# Built-in Claude grader internals

For reference, the built-in grader (`src/grader/claude-grader.ts`) works as follows:

1. Calls `trajectoryToTranscript(view, prompt)` to produce a text transcript.
2. Renders a judge prompt from `src/grader/prompt.ts`.
3. Spawns a Claude Code subprocess with `--output-format json`, `--max-turns 1`, `bare: true`, `disableSlashCommands: true`, `noSessionPersistence: true`.
4. Parses the structured JSON response from `src/grader/parse.ts`.

You can reuse `trajectoryToTranscript` in your own judge:

```typescript
import { trajectoryToTranscript } from "@alis-build/harness-eval";

gradeFn: async ({ view, prompt, expectations }) => {
  const transcript = trajectoryToTranscript(view, prompt);
  // ... use transcript in your judge
},
```

# Citations

[1] `src/grader/types.ts` — GraderFn, GraderInput, GraderOutput interfaces
[2] `src/grader/grade-report.ts` — gradeReport() implementation
[3] `src/grader/claude-grader.ts` — built-in Claude grader
[4] `src/grader/transcript.ts` — trajectoryToTranscript()
[5] `src/grader/prompt.ts` — built-in judge prompt template
[6] [Library API reference](/reference/library-api.md)
