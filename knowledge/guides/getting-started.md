---
type: Playbook
title: Getting Started
description: Write your first harness-eval suite and run a behavioral evaluation against a harness adapter (Claude Code, Codex, or Gemini CLI).
tags: [getting-started, quickstart, tutorial, claude-code, codex, gemini-cli]
timestamp: 2026-06-24T00:00:00Z
---

# Prerequisites

- Node.js ≥22.12.0 (24 LTS recommended)
- A harness CLI installed and authenticated for the adapter you choose:
  - **Claude Code:** `claude` CLI (`npm install -g @anthropic-ai/claude-code`); `ANTHROPIC_API_KEY` or `claude` auth
  - **Codex:** `codex` CLI; OpenAI auth
  - **Gemini CLI:** `gemini` CLI; Google auth
- See [Harness adapters](/architecture/adapters.md) and per-adapter references for full requirements.

This tutorial uses **Claude Code** (`adapter: claude-code`). Equivalent examples for Codex and Gemini CLI live in [`examples/codex-basic.yaml`](https://github.com/alis-build/harness-eval/tree/main/examples/codex-basic.yaml) and [`examples/gemini-cli-basic.yaml`](https://github.com/alis-build/harness-eval/tree/main/examples/gemini-cli-basic.yaml).

# Install

```bash
npm install -D @alis-build/harness-eval
# or
pnpm add -D @alis-build/harness-eval
```

After install, the `harness-eval` binary is available via `npx harness-eval` or directly if using pnpm scripts.

# Step 1 — Write a suite YAML

Create `eval/suite.yaml` in your project root. This example tests that the harness reads a file when asked.

**Recommended:** one unified `suite.yaml` with optional inline `judge:` and `pipeline:` blocks. See [`examples/pipeline/`](https://github.com/alis-build/harness-eval/tree/main/examples/pipeline) for the full layout.

```yaml
adapter: claude-code

defaultConfig:
  model: claude-sonnet-4-6
  timeoutMs: 60000
  cwd: .                         # harness runs in current directory

  claudeCode:
    isolateConfig: false         # use logged-in Claude config
    permissionMode: bypassPermissions
    allowedTools:
      - Read                     # only allow Read for this test

cases:
  - id: read-readme
    prompt: "Read README.md and tell me the project name in one sentence."
    repetitions: 3
    assertions:
      - called: Read             # must call Read (100% of reps)
      - not_called: Bash         # must NOT call Bash
      - iterations_within: 3    # must finish within 3 turns
    expectations:
      - "States the correct project name from the README"
      - "Response is a single sentence as instructed"

# Optional — inline judge (alternative to standalone grading.yaml)
judge:
  adapter: claude-code
  model: claude-sonnet-4-6
  timeoutMs: 120000
  claudeCode:
    permissionMode: bypassPermissions

# Optional — orchestrate run → grade → envelope
pipeline:
  run:
    output: eval/report.json
  grade:
    output: eval/grading.json
  envelope:
    output: eval/envelope.json
```

**Key decisions made here:**

- `isolateConfig: false` — allows the harness to use the current user's logged-in Claude config and any MCP plugins you have configured. If you're testing MCP tools, this is required.
- `permissionMode: bypassPermissions` — prevents the harness from pausing to ask for permission, which would hang the subprocess.
- `allowedTools: [Read]` — restricts which tools the model can call, making the test focused.
- `repetitions: 3` — runs the case 3 times. With only `threshold: 1.0` assertions, all 3 must pass.

# Step 2 — Run the behavioral eval

**Unified pipeline (when `pipeline:` is defined):**

```bash
npx harness-eval pipeline eval/
```

**Or run only the harness step:**

```bash
npx harness-eval run eval/suite.yaml --output eval/report.json
```

You'll see per-repetition progress and a summary:

```
✓ cell: default
  ✓ called: Read          [3/3 = 100%]  threshold=1.0
  ✓ not_called: Bash      [3/3 = 100%]  threshold=1.0
  ✓ iterations_within: 3  [3/3 = 100%]  threshold=1.0

All 1 cell(s) passed.
```

If any assertion fails, the exit code is `1`. Use this in CI scripts:

```bash
npx harness-eval run eval/suite.yaml --output eval/report.json || exit 1
```

# Step 3 — Grade outcomes (optional)

Behavioral assertions catch tool-call problems. To also verify that the *response content* is correct, use the inline **`judge:`** block from step 1 (or a standalone **`grading.yaml`** — still supported).

**With unified suite:**

```bash
npx harness-eval grade eval/report.json --suite eval/suite.yaml --output eval/grading.json
# or: npx harness-eval pipeline eval/ --steps grade
```

**With standalone grading file:**

```yaml
# eval/grading.yaml (alternate layout)
judge:
  adapter: claude-code
  model: claude-sonnet-4-6
  timeoutMs: 120000
  maxConcurrent: 1

  claudeCode:
    permissionMode: bypassPermissions
```

```bash
npx harness-eval grade eval/report.json \
  --config eval/grading.yaml \
  --output eval/grading.json
```

The grader evaluates each `expectations` string against each repetition's transcript and emits a pass/fail for each.

# Step 4 — Add more cases

Iterate by adding more cases to your suite. Common patterns:

**Test tool ordering:**
```yaml
- id: search-then-load
  prompt: "Search for a skill related to building neurons, then load the first result."
  assertions:
    - called: mcp__plugin__SearchSkills
    - called: mcp__plugin__LoadSkill
    - called_before:
        first: mcp__plugin__SearchSkills
        then: mcp__plugin__LoadSkill
    - iterations_within: 5
      threshold: 0.8
```

**Test that the agent doesn't over-call:**
```yaml
- id: simple-read
  prompt: "What is the first line of README.md?"
  assertions:
    - called: Read
    - called:
        tool: Read
        times: "== 1"      # should read exactly once, not repeatedly
    - not_called: Bash
    - iterations_within: 2
```

**Test argument content:**
```yaml
- id: targeted-search
  prompt: "Search for skills about deploying to production."
  assertions:
    - called_with:
        tool: mcp__plugin__SearchSkills
        args:
          query:
            contains: "deploy"     # must include relevant search term
```

# Step 5 — Test a matrix

To compare two models side by side:

```yaml
adapter: claude-code

defaultConfig:
  timeoutMs: 90000
  cwd: .
  claudeCode:
    isolateConfig: false
    permissionMode: bypassPermissions
    allowedTools: [Read, mcp__plugin__SearchSkills]

matrix:
  - label: sonnet
    config:
      model: claude-sonnet-4-6
  - label: opus
    config:
      model: claude-opus-4-8

cases:
  - id: read-readme
    prompt: "Read README.md and summarize in one sentence."
    repetitions: 5
    assertions:
      - called: Read
        threshold: 1.0
```

Run and see pass rates per cell:

```
✓ cell: sonnet   called: Read   5/5 = 100%
✓ cell: opus     called: Read   5/5 = 100%
```

# Common mistakes

**Hanging subprocess:** If a repetition hangs, `permissionMode` is likely not set to a non-interactive mode. Set `permissionMode: bypassPermissions` or `auto`.

**Too-strict thresholds:** If your test is flaky, try lowering `threshold` from `1.0` to `0.8` and increasing `repetitions` from 3 to 5 or 10. A 1.0 threshold on 3 reps means 3/3 must pass — very strict.

**Wrong cwd:** The harness subprocess runs with `cwd` as its working directory. If you're testing `Read README.md` but `cwd` doesn't contain `README.md`, the tool call will fail. Use an absolute path or check that the relative path resolves correctly.

**Tool not in allowedTools (Claude Code):** If a tool is called but not in `allowedTools`, Claude Code may prompt for permission — hanging the subprocess. Add the tool to `allowedTools` or check `permissionMode`. Codex and Gemini CLI have their own permission/approval settings; see [Codex adapter](/reference/codex-adapter.md) and [Gemini CLI adapter](/reference/gemini-cli-adapter.md).

# Citations

[1] `examples/basic.yaml` — minimal example suite
[2] `examples/pipeline/` — unified judge + pipeline example
[3] `examples/matrix.yaml` — multi-cell matrix example
[4] [Suite YAML reference](/reference/suite-yaml.md)
[5] [Assertion DSL reference](/reference/assertion-dsl.md)
[6] [Claude Code adapter reference](/reference/claude-code-adapter.md)
[7] [Codex adapter reference](/reference/codex-adapter.md)
[8] [Gemini CLI adapter reference](/reference/gemini-cli-adapter.md)
