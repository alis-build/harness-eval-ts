---
type: Reference
title: Claude Code Adapter
description: Complete reference for the built-in Claude Code harness adapter — configuration fields, CLI flag mapping, isolation modes, and subprocess protocol.
tags: [adapter, claude-code, configuration, reference]
timestamp: 2026-06-24T00:00:00Z
---

# Overview

The Claude Code adapter is a built-in harness adapter for `harness-eval`. It spawns `claude` CLI subprocesses with `--output-format stream-json`, parses the event stream, and produces [`TrajectoryView`](/concepts/trajectory-view.md) objects. See also [Codex](/reference/codex-adapter.md) and [Gemini CLI](/reference/gemini-cli-adapter.md) adapters.

Configuration lives under the `claudeCode` key in any config block (`defaultConfig`, `case.config`, `cell.config`).

# Configuration fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `binary` | string | `"claude"` | Path to the `claude` binary |
| `permissionMode` | enum | `"default"` | Permission mode passed to `--permission-mode` |
| `allowedTools` | string[] | — | Auto-approved tools passed to `--allowedTools` |
| `pluginDirs` | string[] | — | Plugin directories, each passed as `--plugin-dir` |
| `pluginUrls` | string[] | — | Plugin URLs, each passed as `--plugin-url` |
| `isolateConfig` | boolean | `true` | Use isolated config dir (prevents cross-test state) |
| `effort` | enum | — | Reasoning effort level (`--effort`) |
| `agent` | string | — | Subagent name (`--agent`) |
| `maxTurns` | number | — | Max assistant turns (`--max-turns`) |
| `systemPrompt` | string | — | Replace default system prompt (`--system-prompt`) |
| `bare` | boolean | — | Minimal system prompt mode (`--bare`) |
| `noSessionPersistence` | boolean | — | No session persistence (`--no-session`) |
| `disableSlashCommands` | boolean | — | Disable slash commands (`--disable-slash-commands`) |
| `env` | Record<string, string> | — | Extra environment variables for the subprocess |

Top-level fields (not under `claudeCode`) that also affect the subprocess:

| Field | Type | Maps to |
|-------|------|---------|
| `model` | string | `--model` |
| `timeoutMs` | number | Process kill timeout |
| `cwd` | string | `cwd` option for subprocess spawn |
| `maxTurns` | number | `--max-turns` (top-level; merged with `claudeCode.maxTurns`) |

# Permission modes

The `permissionMode` field controls which Claude Code permission mode is used:

| Value | Description |
|-------|-------------|
| `default` | Standard interactive mode (may prompt for permissions) |
| `acceptEdits` | Auto-accept file edits without prompting |
| `plan` | Plan mode — no execution, plan output only |
| `auto` | Fully automatic — accept all permissions |
| `dontAsk` | Never ask for permissions (same as auto) |
| `bypassPermissions` | Bypass all permission checks — use only in controlled eval environments |

**Recommended for evals:** `bypassPermissions` or `auto`. Interactive modes (`default`, `acceptEdits`) may pause and wait for user input, hanging the subprocess.

# isolateConfig

```yaml
claudeCode:
  isolateConfig: false     # use the current user's logged-in Claude config
  # OR
  isolateConfig: true      # (default) use a fresh, empty config directory
```

**`isolateConfig: true` (default):** The adapter creates a temporary config directory for each run. The subprocess sees no logged-in user, no MCP servers from the user's config, and no session history. Useful for testing tool-call behavior without any ambient config.

**`isolateConfig: false`:** The subprocess inherits the current user's Claude config directory. Use this when testing MCP servers that require an authenticated plugin setup, or when the harness depends on the user's logged-in config.

# allowedTools

```yaml
claudeCode:
  allowedTools:
    - Read
    - Write
    - Bash
    - "mcp__plugin__*"      # glob patterns are supported
```

Maps to `--allowedTools`. These tools are auto-approved — the harness will not prompt for permission to use them. Be deliberate: over-permissioning can produce incorrect test results (the agent may use tools that aren't available in production).

# pluginDirs and pluginUrls

```yaml
claudeCode:
  pluginDirs:
    - /path/to/local/plugin
  pluginUrls:
    - https://registry.example.com/plugin/v1
```

Each entry maps to a `--plugin-dir` or `--plugin-url` flag (repeated). Use these to load specific MCP plugin versions for a cell without modifying the global Claude config.

# Subprocess protocol

The adapter always appends these flags, regardless of config:

```bash
-p "<prompt>" --output-format stream-json --verbose
```

- `-p` — non-interactive prompt mode.
- `--output-format stream-json` — emits one JSON object per line. Each line is a `StreamEvent`.
- `--verbose` — required to see tool call events in the stream.

The adapter reads stdout line-by-line, parses each line as a `StreamEvent`, and feeds it to `TrajectoryBuilder`. On process exit (or timeout), the trajectory is finalized.

# StreamEvent types

The Claude `stream-json` format produces these event types (captured in `src/types/stream.ts`):

| Type | Description |
|------|-------------|
| `message_start` | Session metadata (model, usage) |
| `content_block_start` / `_delta` / `_stop` | Assistant text or tool use |
| `tool_result` | Result of a tool call |
| `message_delta` | Token usage and stop reason |
| `message_stop` | Session complete |
| `system` | System-level events (rate limit, error) |

Only the Claude Code adapter parses these event types directly. All other harness-eval code operates on `TrajectoryView`.

# Full example

```yaml
defaultConfig:
  model: claude-sonnet-4-6
  timeoutMs: 90000
  cwd: /path/to/repo

  claudeCode:
    binary: claude                      # default
    permissionMode: bypassPermissions
    isolateConfig: false                # use logged-in config (for MCP access)
    allowedTools:
      - Read
      - mcp__my_plugin__MethodA
      - mcp__my_plugin__MethodB
    pluginDirs:
      - /path/to/my-plugin
    maxTurns: 8
    effort: medium
```

# Citations

[1] `src/adapters/claude-code/index.ts` — adapter implementation
[2] `src/adapters/claude-code/flags.ts` — flag builder
[3] `src/adapters/claude-code/types.ts` — ClaudeCodeOptions type
[4] `src/adapters/claude-code/process.ts` — subprocess management
[5] `src/types/stream.ts` — StreamEvent types
