---
type: Reference
title: Codex CLI Adapter
description: Complete reference for the built-in Codex CLI harness adapter — configuration fields, CLI flag mapping, isolation modes, and subprocess protocol.
tags: [adapter, codex, configuration, reference]
timestamp: 2026-06-24T00:00:00Z
---

# Overview

The Codex CLI adapter is a built-in harness adapter for `harness-eval`. It spawns `codex exec --json` subprocesses, parses newline-delimited JSON events, maps them into the shared `StreamEvent` shape, and produces [`TrajectoryView`](/concepts/trajectory-view.md) objects via `TrajectoryBuilder`.

Configuration lives under the `codex` key in any config block (`defaultConfig`, `case.config`, `cell.config`).

# Configuration fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `binary` | string | `"codex"` | Path to the `codex` binary |
| `profile` | string | — | Layer `$CODEX_HOME/<profile>.config.toml` (`--profile`) |
| `sandbox` | enum | — | `read-only`, `workspace-write`, `danger-full-access` |
| `addDirs` | string[] | — | Extra writable directories (`--add-dir`, repeatable) |
| `configOverrides` | string[] | — | Inline `-c key=value` TOML overrides |
| `askForApproval` | enum | `"never"` | `untrusted`, `on-request`, `never` |
| `dangerouslyBypassApprovalsAndSandbox` | boolean | — | `--yolo` (hardened CI only) |
| `dangerouslyBypassHookTrust` | boolean | — | Skip hook trust prompts |
| `ephemeral` | boolean | — | No session rollout files |
| `ignoreUserConfig` | boolean | — | Skip `$CODEX_HOME/config.toml` |
| `skipGitRepoCheck` | boolean | — | Allow runs outside git repos |
| `outputSchema` | string | — | JSON Schema path for structured output |
| `outputLastMessage` | string | — | Write final message to file (auto-generated temp path when `captureLastMessage` is true) |
| `captureLastMessage` | boolean | `true` | Auto `--output-last-message` + read file into `finalResponse` when JSONL has no `assistant_message` |
| `isolateConfig` | boolean | `false` | Temp `$CODEX_HOME` per run when `true` |

Top-level fields (not under `codex`) that also affect the subprocess:

| Field | Type | Maps to |
|-------|------|---------|
| `model` | string | `--model` |
| `timeoutMs` | number | Process kill timeout |
| `cwd` | string | `--cd` / subprocess working directory |
| `env` | Record<string, string> | Extra environment variables |

# isolateConfig

```yaml
codex:
  isolateConfig: false     # (default) inherit ~/.codex config, plugins, MCP, stored auth
  # OR
  isolateConfig: true      # fresh temp $CODEX_HOME per run
```

**`isolateConfig: false` (default):** The subprocess uses the caller's Codex home directory. Use this for MCP/plugin evals that depend on configured servers and login state.

**`isolateConfig: true`:** Each run gets an empty temp `$CODEX_HOME`. Provide auth via `env` (e.g. `OPENAI_API_KEY`) when using isolation.

# Subprocess protocol

1. Builds CLI args via `src/adapters/codex/flags.ts` → `codex exec --json … "<prompt>"`.
2. Spawns the `codex` binary (configurable via `codex.binary`).
3. Reads stdout line-by-line; each line is a Codex thread event.
4. Maps events to `StreamEvent` via `CodexEventMapper`.
5. Passes mapped events to `TrajectoryBuilder`.
6. On process exit (or timeout), finalizes the `TrajectoryView`.
7. If `finalResponse` is still empty and `outputLastMessage` is set, reads that file into `finalResponse` (fallback when JSONL has no `assistant_message`).

# Tool name mapping

| Codex item type | TrajectoryView tool name |
|-----------------|--------------------------|
| `mcp_tool_call` | `mcp__<server>__<tool>` |
| `command_execution` | `Bash` (args: `{ command: "…" }`) — Codex often reads files via shell |

# Codex judge

Set `judge.adapter: codex` in grading YAML. Options nest under `judge.codex` with the same fields as harness `codex`.

Judge subprocess uses plain `codex exec` (no `--json`). Defaults: `ephemeral: true`, `ignoreUserConfig: true`, `skipGitRepoCheck: true`, `askForApproval: never`.

# Fixtures & CI

Committed NDJSON recordings live under `tests/fixtures/codex/`. Vitest validates the mapper and adapter without requiring `codex` on `PATH`.

# Example suite

See `examples/codex-basic.yaml` in the repository for a Read-tool smoke pattern with `adapter: codex`.

# Citations

[1] `src/adapters/codex/index.ts` — adapter entry point
[2] `src/adapters/codex/map-events.ts` — Codex JSONL → StreamEvent mapper
[3] `src/adapters/codex/flags.ts` — CLI flag builder
[4] [Codex CLI reference](https://developers.openai.com/codex/cli/reference)
