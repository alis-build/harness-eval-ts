---
type: Reference
title: Gemini CLI Adapter
description: Complete reference for the built-in Gemini CLI harness adapter — configuration fields, CLI flag mapping, isolation modes, and subprocess protocol.
tags: [adapter, gemini-cli, configuration, reference]
timestamp: 2026-06-25T00:00:00Z
---

# Overview

The Gemini CLI adapter is a built-in harness adapter for `harness-eval`. It spawns `gemini -p … --output-format stream-json` subprocesses, parses newline-delimited JSON events, maps them into the shared `StreamEvent` shape, and produces [`TrajectoryView`](/concepts/trajectory-view.md) objects via `TrajectoryBuilder`.

Configuration lives under the `geminiCli` key in any config block (`defaultConfig`, `case.config`, `cell.config`).

# Configuration fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `binary` | string | `"gemini"` | Path to the `gemini` binary |
| `approvalMode` | enum | `"yolo"` | `default`, `auto_edit`, `yolo`, `plan` |
| `sandbox` | string | — | Sandboxed execution (`--sandbox`) |
| `skipTrust` | boolean | `true` | Skip folder trust check (`--skip-trust`); default `true` for headless harness and judge runs |
| `includeDirectories` | string[] | — | Extra workspace dirs (`--include-directories`, repeatable) |
| `allowedMcpServerNames` | string[] | — | MCP server allowlist (`--allowed-mcp-server-names`) |
| `extensions` | string[] | — | Extension allowlist (`--extensions`) |
| `debug` | boolean | — | Verbose logging (`--debug`) |
| `isolateConfig` | boolean | `false` | Temp config dir per run when `true` |

Top-level fields (not under `geminiCli`) that also affect the subprocess:

| Field | Type | Maps to |
|-------|------|---------|
| `model` | string | `--model` |
| `timeoutMs` | number | Process kill timeout |
| `cwd` | string | Subprocess working directory |
| `env` | Record<string, string> | Extra environment variables |

# isolateConfig

```yaml
geminiCli:
  isolateConfig: false     # (default) inherit caller Gemini CLI config, MCP, extensions, auth
  # OR
  isolateConfig: true      # fresh temp config directory per run (set GEMINI_CONFIG_DIR)
```

**`isolateConfig: false` (default):** The subprocess uses the caller's Gemini CLI configuration and logged-in state. Use this for MCP/plugin evals that depend on configured servers.

**`isolateConfig: true`:** Each run gets an empty temp config directory. Provide auth via `env` (e.g. `GEMINI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`) when using isolation.

# Subprocess protocol

1. Builds CLI args via `src/adapters/gemini-cli/flags.ts` → `gemini -p "<prompt>" --output-format stream-json …`.
2. Spawns the `gemini` binary (configurable via `geminiCli.binary`).
3. Reads stdout line-by-line; each line is a Gemini stream-json event (`init`, `message`, `tool_use`, `tool_result`, `error`, `result`).
4. Maps events to `StreamEvent` via `GeminiCliEventMapper`.
5. Passes mapped events to `TrajectoryBuilder`.
6. On process exit (or timeout), finalizes the `TrajectoryView`.

# Event mapping

| Gemini event | Action |
|--------------|--------|
| `init` | `system/init` with session_id and model |
| `message` (assistant) | Assistant text → `finalResponse` |
| `message` (user) | Ignored (prompt echo) |
| `tool_use` | Tool call start; MCP names use `mcp__<server>__<tool>` |
| `tool_result` | Tool result attached to matching call |
| `error` | Non-fatal diagnostic (ignored in trajectory) |
| `result` | Session end with usage stats |

# Judge

Set `judge.adapter: gemini-cli` and nest options under `judge.geminiCli` in grading YAML. The judge subprocess uses `--output-format json` and parses `{ response, stats, error? }`.

Default judge options: `approvalMode: yolo`, `isolateConfig: true` (temp `GEMINI_CONFIG_DIR` per grade — avoids loading user MCP servers, skills, and extensions).

# Exit codes

Gemini CLI headless runs may exit with documented codes. The adapter preserves `diagnostics.exitCode` and sets `diagnostics.exitCodeDescription` for non-zero codes:

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `42` | Input error |
| `53` | Turn limit exceeded |

Trajectory `success` still follows the stream `result` event when present; exit-code labels enrich diagnostics and `AdapterError` messages when the stream is unusable.

# Package export

```typescript
import { runGeminiCli, geminiCliAdapter } from "@alis-build/harness-eval/adapters/gemini-cli";
```

# Citations

[1] `src/adapters/gemini-cli/index.ts` — adapter orchestrator
[2] `src/adapters/gemini-cli/map-events.ts` — event mapper
[3] `src/adapters/gemini-cli/flags.ts` — CLI arg builder
[4] [Gemini CLI headless reference](https://geminicli.com/docs/cli/headless/)
