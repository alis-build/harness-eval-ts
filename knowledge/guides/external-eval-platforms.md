---
type: Playbook
title: External Eval Platforms
description: Integration patterns for LangSmith, Braintrust, Vertex AI, and other evaluation platforms alongside harness-eval.
tags: [integration, langsmith, braintrust, vertex-ai, external-platforms]
timestamp: 2026-06-24T00:00:00Z
---

# Philosophy

harness-eval handles **what is deterministic**: tool-call behavior, ordering, arguments, efficiency. External platforms handle **what requires scale or platform-specific features**: LLM-as-judge at scale, human review, dataset management, leaderboards.

The two are complementary. The recommended pattern:

1. harness-eval produces a `SuiteReport` (behavioral) and optionally a `SuiteGradingReport` (outcome).
2. External platform runs its own judges or evaluators on the trajectories.
3. External platform scores flow back into the `EvalRunEnvelope` as `externalScores`.
4. The envelope is stored in a DB for unified dashboards.

# Pattern 1 — Behavioral only (no external platform)

The simplest CI pipeline. Gate on assertion pass rates from `harness-eval run`.

```bash
harness-eval run eval/suite.yaml --output report.json
# Exit code 0 = all assertions met thresholds. Gate PR on this.
```

Add `harness-eval grade` for outcome grading with the built-in Claude judge. No external platform required.

---

# Pattern 2 — LangSmith

Send trajectories to LangSmith as runs, then apply LangSmith evaluators.

```typescript
import { Client } from "langsmith";
import { loadSuite } from "@alis-build/harness-eval/config";
import { runSuite, buildEvalRunEnvelope } from "@alis-build/harness-eval";

const client = new Client();
const suite = await loadSuite("./eval/suite.yaml");
const report = await runSuite(suite, { maxConcurrent: 4 });

// Upload each repetition to LangSmith
const externalScores: Record<string, any[]> = {};

for (const cell of report.cells) {
  for (const rep of cell.repetitions) {
    if (!rep.adapterResult) continue;
    const { view } = rep.adapterResult;

    // Create a LangSmith run for this repetition
    const runId = await client.createRun({
      name: `${cell.caseId}:${cell.cellLabel}:${rep.repetitionIndex}`,
      run_type: "chain",
      inputs: { prompt: cell.prompt },
      outputs: { response: view.finalResponse },
      extra: {
        tool_calls: view.toolCalls.map(tc => ({ tool: tc.tool, args: tc.args })),
        model: view.meta.model,
        total_cost_usd: view.usage.totalCostUsd,
      },
    });

    // Apply a LangSmith evaluator
    const evalResult = await client.evaluateRun(runId, {
      evaluator: "criteria",
      criteria: { helpfulness: "Is the response helpful?" },
    });

    // Collect scores for the envelope
    const key = `${cell.caseId}:${cell.cellLabel}:${rep.repetitionIndex}`;
    externalScores[key] = [
      {
        provider: "langsmith",
        metric: "helpfulness",
        score: evalResult.score,
        runUrl: `https://smith.langchain.com/runs/${runId}`,
      },
    ];
  }
}

// Build envelope with external scores
const envelope = buildEvalRunEnvelope(report, {
  provenance: { git: { commit: process.env.GITHUB_SHA } },
  // externalScores are attached per-repetition in the envelope builder
});
```

---

# Pattern 3 — Braintrust

Use Braintrust's `Eval` function alongside harness-eval's behavioral layer.

```typescript
import { Eval } from "braintrust";
import { loadSuite } from "@alis-build/harness-eval/config";
import { runSuite } from "@alis-build/harness-eval";

const suite = await loadSuite("./eval/suite.yaml");
const report = await runSuite(suite, { maxConcurrent: 4 });

// Run Braintrust evaluation over harness trajectories
for (const cell of report.cells) {
  await Eval("harness-eval", {
    data: cell.repetitions
      .filter(r => r.adapterResult)
      .map(r => ({
        input: cell.prompt,
        expected: cell.expectations?.join("; ") ?? "",
        metadata: {
          caseId: cell.caseId,
          cellLabel: cell.cellLabel,
          repetitionIndex: r.repetitionIndex,
          toolCalls: r.adapterResult!.view.toolCalls.map(tc => tc.tool),
        },
        actual: r.adapterResult!.view.finalResponse,
      })),

    task: async (input) => input,   // data is already computed

    scores: [
      // Use Braintrust's built-in scorers
      (args) => ({
        name: "contains_expected_tools",
        score: args.metadata.toolCalls.includes("mcp__plugin__SearchSkills") ? 1 : 0,
      }),
    ],

    projectName: "my-harness-eval",
    experimentName: `${cell.caseId}-${cell.cellLabel}-${Date.now()}`,
  });
}
```

---

# Pattern 4 — Vertex AI

harness-eval has first-class support for the Vertex AI evaluation format via the `EvalRunEnvelope` projection options.

**Generate trajectory JSONL for Vertex:**

```bash
harness-eval envelope report.json \
  --projection trajectory \
  --output trajectory.jsonl
```

**Generate evaluation instances JSONL for Vertex:**

```bash
harness-eval envelope report.json \
  --projection instances \
  --output instances.jsonl
```

**Programmatic access:**

```typescript
import { toTrajectory, toInstancesJsonl } from "@alis-build/harness-eval";
// (available via eval-interchange subpath)
```

The Vertex format is defined in `src/eval-interchange/` and validated against `schemas/eval-interchange.schema.json`.

---

# Pattern 5 — Dual pipeline (recommended for production)

Behavioral gates run on every PR. Outcome/external platform evals run async after merge.

```
PR:
  harness-eval run → gate on behavioral assertions (fast, ~5 min)

Post-merge:
  harness-eval run → report.json
  harness-eval grade → grading.json
  External platform → externalScores
  harness-eval envelope (or custom script) → envelope.json
  → DB storage for trending dashboards
```

This gives you:
- Reliable, fast PR gates (no LLM calls blocking the developer loop).
- Rich outcome data accumulating over time without blocking PRs.
- A single `EvalRunEnvelope` per run that unifies behavioral + outcome + external scores.

# Attaching external scores to the envelope

The `EvalRepetition.externalScores` field in `EvalRunEnvelope` is a list of `ExternalScore` objects:

```typescript
interface ExternalScore {
  provider: string;     // "langsmith" | "braintrust" | "ragas" | ...
  metric: string;       // metric name
  score: number;        // 0–1
  runUrl?: string;      // link to the platform run
}
```

To attach them, either:

1. Build the envelope after collecting external scores (pass them into the builder).
2. POST-process the envelope JSON to insert scores per repetition.

The harness-eval library currently requires passing scores at envelope build time via the programmatic API. Envelope JSON can also be patched in a post-processing step before DB ingestion.

# Citations

[1] `src/types/eval-record.ts` — ExternalScore, EvalRepetition types
[2] `src/eval-record/build.ts` — buildEvalRunEnvelope
[3] `src/eval-interchange/` — Vertex AI protojson support
[4] `schemas/eval-interchange.schema.json` — Vertex AI schema
[5] [EvalRunEnvelope concept](/concepts/eval-run-envelope.md)
[6] [CI/CD integration guide](/guides/ci-cd-integration.md)
