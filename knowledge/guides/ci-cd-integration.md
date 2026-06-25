---
type: Playbook
title: CI/CD Integration
description: How to gate pull requests on behavioral assertion pass rates and run async outcome grading in a separate pipeline job.
tags: [ci-cd, github-actions, automation, testing]
timestamp: 2026-06-24T00:00:00Z
---

# Recommended split

harness-eval supports two CI patterns. Examples below use **Claude Code**; install and authenticate the CLI for whichever adapter your suite declares (`claude-code`, `codex`, or `gemini-cli`). See [Harness adapters](/architecture/adapters.md) for per-adapter requirements.

**Pattern A — unified pipeline (single job, when suite defines `pipeline:`):**

```
PR opened / push
    │
    └── Job: Full eval pipeline
          harness-eval pipeline → run + grade + envelope
          → writes report.json, grading.json, envelope.json
          → behavioral failures exit 1; grade failures exit 1
```

**Pattern B — split jobs (default for large suites or async grading):**

```
PR opened / push
    │
    ├── Job 1: Behavioral eval (fast, deterministic, blocks merge)
    │     harness-eval run → pass/fail on assertions
    │     → writes report.json as artifact
    │
    └── Job 2: Outcome grading (async, expensive, informational)
          harness-eval grade → LLM judge scores expectations
          → writes grading.json as artifact
          → merged into EvalRunEnvelope for DB storage
```

Job 1 (or the run step in Pattern A) blocks the PR. Job 2 can run after the PR merges, or on a nightly schedule.

# Harness CLI in CI

Install the CLI for the adapter your suite uses:

| Adapter | Install | Typical auth env |
|---------|---------|------------------|
| `claude-code` | `npm install -g @anthropic-ai/claude-code` | `ANTHROPIC_API_KEY` |
| `codex` | Follow OpenAI Codex CLI install docs | OpenAI auth / API key |
| `gemini-cli` | Follow Google Gemini CLI install docs | Google auth |

The workflow examples below install Claude Code; swap the install step and secrets for your adapter.

# GitHub Actions — Unified pipeline job

When your suite includes inline `judge:` and `pipeline:` blocks:

```yaml
      - name: Run full eval pipeline
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          npx harness-eval pipeline eval/ \
            --progress json \
            --max-concurrent 3

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: harness-eval-artifacts
          path: |
            eval/report.json
            eval/grading.json
            eval/envelope.json
```

Use `--steps run` to gate only on behavioral assertions while skipping grade/envelope.

# GitHub Actions — Behavioral eval job

```yaml
# .github/workflows/harness-eval.yml
name: Harness Eval

on:
  pull_request:
  push:
    branches: [main]

jobs:
  behavioral-eval:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: pnpm

      - run: pnpm install

      # Install Claude Code CLI
      - run: npm install -g @anthropic-ai/claude-code

      - name: Run behavioral eval
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          npx harness-eval run eval/suite.yaml \
            --output eval/report.json \
            --progress json \
            --max-concurrent 3

      - name: Upload report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: harness-eval-report
          path: eval/report.json
```

**Key points:**

- `--progress json` emits machine-readable JSON events to stderr. Useful if you have a log parser or dashboard ingesting CI output.
- Upload `report.json` as an artifact even on failure — you'll want it for debugging.
- `timeout-minutes: 20` is a safety net. Set it to something reasonable for your suite size × concurrency.

# Baseline comparison (regression detection)

To detect regressions in assertion pass rates across PRs, download the previous `report.json` and pass it as `--baseline`:

```yaml
      - name: Download baseline report
        uses: actions/download-artifact@v4
        with:
          name: harness-eval-report-main
          path: eval/
        continue-on-error: true           # first run has no baseline

      - name: Run eval with baseline comparison
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          npx harness-eval run eval/suite.yaml \
            --output eval/report.json \
            --baseline eval/report-main.json \
            --progress json
```

The diff output shows ↑/↓ changes in pass rates per assertion.

# GitHub Actions — Outcome grading job (async)

```yaml
  outcome-grading:
    runs-on: ubuntu-latest
    needs: behavioral-eval       # run after behavioral-eval
    if: github.ref == 'refs/heads/main'   # only on main, not PRs

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: pnpm
      - run: pnpm install
      - run: npm install -g @anthropic-ai/claude-code

      - name: Download report artifact
        uses: actions/download-artifact@v4
        with:
          name: harness-eval-report

      - name: Grade outcomes
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          npx harness-eval grade report.json \
            --suite eval/suite.yaml \
            --output eval/grading.json \
            --max-concurrent 2
          # alternate: --config eval/grading.yaml when using standalone grading file

      - name: Build EvalRunEnvelope
        run: |
          npx harness-eval envelope report.json \
            --grading eval/grading.json \
            --suite eval/suite.yaml \
            --output eval/envelope.json

      - name: Upload envelope to DB
        run: |
          curl -X POST "${{ secrets.EVAL_DB_URL }}/ingest" \
            -H "Authorization: Bearer ${{ secrets.EVAL_DB_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d @eval/envelope.json
```

# Provenance in envelopes

Add git and CI provenance to the envelope so runs are traceable in a database:

```bash
npx harness-eval envelope report.json \
  --grading eval/grading.json \
  --output eval/envelope.json
```

Or programmatically:

```typescript
import { buildEvalRunEnvelope } from "@alis-build/harness-eval";

const envelope = buildEvalRunEnvelope(report, {
  grading,
  suite: { uri: "./eval/suite.yaml" },
  provenance: {
    git: {
      commit: process.env.GITHUB_SHA,
      branch: process.env.GITHUB_REF_NAME,
      repository: process.env.GITHUB_REPOSITORY,
    },
    ci: {
      provider: "github-actions",
      jobId: process.env.GITHUB_RUN_ID,
      pipelineUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    },
    pluginVersion: process.env.PLUGIN_VERSION,
  },
});
```

# Exit codes

Use exit codes for CI gating:

| Scenario | Command | Exit code on failure |
|----------|---------|---------------------|
| Block PR on behavioral failures | `harness-eval run` or `pipeline --steps run` | `1` |
| Block PR on outcome failures | `harness-eval grade` or full `pipeline` | `1` |
| Full pipeline (run + grade + envelope) | `harness-eval pipeline` | `1` on first failing step |
| Build envelope (never gates) | `harness-eval envelope` | `2` (fatal only) |

```yaml
      - name: Run eval (gates PR)
        run: |
          npx harness-eval run eval/suite.yaml --output eval/report.json
          # non-zero exit code automatically fails the step → fails the job → blocks PR
```

# Caching

Cache `node_modules` between runs (`actions/cache` with pnpm or npm lockfile keys). Also cache the harness CLI binary location for whichever adapter you use (`claude`, `codex`, or `gemini`).

# Citations

[1] `src/cli/commands/run.ts` — run command, exit codes
[2] `src/cli/commands/grade.ts` — grade command, exit codes
[3] `src/cli/commands/envelope.ts` — envelope command
[4] `src/eval-record/build.ts` — buildEvalRunEnvelope with provenance
[5] `examples/basic.yaml` — example suite
[6] `examples/pipeline/` — unified pipeline example
[7] `src/cli/commands/pipeline.ts` — pipeline command
