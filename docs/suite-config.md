# Suite & grading YAML reference

Reference for authoring **suite YAML** (behavioral eval) and **grading YAML** (outcome judges). For assertion syntax and statistical model, see [assertions.md](assertions.md). For Claude Code CLI flag mapping, see the [README Claude Code adapter table](../README.md#claude-code-adapter).

---

## Suite layouts

### Single file

One YAML file with inline `cases`:

```bash
harness-eval run examples/basic.yaml --output report.json
```

### Directory

A folder with `suite.yaml` plus optional case fragments under `cases/`:

```
my-suite/
  suite.yaml          # adapter, defaultConfig, matrix (cases optional)
  cases/
    smoke.yaml        # one case object or a list of cases
    routing.yaml
```

```bash
harness-eval run my-suite/ --output report.json
```

**Merge order:** inline cases from `suite.yaml` first, then files under `cases/` sorted lexicographically by path; within each file, array order is preserved. Each case file may be a single case object, a list of cases, or `{ cases: [...] }`.

Relative paths in config (`mcpConfig`, `pluginDirs`, `systemPromptFile`, etc.) resolve against the **`suite.yaml` directory**.

---

## Top-level suite fields

| Field | Required | Description |
|-------|----------|-------------|
| `matrix` | yes | At least one configuration cell (model, plugin setup, tool allowlist, …). |
| `cases` | yes* | Test cases inline in the file. *Optional in directory layout when cases live under `cases/`. |
| `adapter` | no | Harness adapter id (default: `claude-code`). |
| `defaultConfig` | no | Base harness config merged into every case and cell. |

---

## Matrix cells

Each entry in `matrix` defines one column in the report (one harness configuration per case).

| Field | Required | Description |
|-------|----------|-------------|
| `label` | yes | Short id used in reports and progress output (e.g. `sonnet`, `opus-with-mcp`). |
| `config` | yes | Partial harness config merged on top of `defaultConfig` and case config. |
| `axes` | no | Free-form string map for dashboards (e.g. `model: claude-sonnet-4-6`). Not applied to the harness — metadata only. |

Example — model matrix:

```yaml
matrix:
  - label: sonnet
    axes:
      model: claude-sonnet-4-6
    config:
      model: claude-sonnet-4-6

  - label: opus
    axes:
      model: claude-opus-4-6
    config:
      model: claude-opus-4-6
```

---

## Test case fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Stable case identifier in reports and envelopes. |
| `prompt` | yes | User message sent to the harness. |
| `assertions` | yes | Behavioral checks on the tool trajectory (see [assertions.md](assertions.md)). |
| `repetitions` | no | Runs per (case × matrix cell). Default: **5**. |
| `expectations` | no | Natural-language outcome checks for `harness-eval grade` or external judges. |
| `reference_trajectory` | no | Expected tool-call sequence for Vertex trajectory metrics and envelope export. |
| `human_ratings` | no | Optional numeric rubric scores copied into the eval envelope (e.g. `{ quality: 4 }`). |
| `category` | no | Grouping label for reports and dashboards. |
| `notes` | no | Human-readable description; not passed to the harness. |
| `config` | no | Per-case harness overrides (merged after `defaultConfig`, before cell config). |

### Config merge order

Later wins: `defaultConfig` → `case.config` → `cell.config`.

List fields such as `allowedTools` and `pluginDirs` are **replaced**, not merged.

### Generic config fields (`defaultConfig`, `case.config`, `cell.config`)

| Field | Description |
|-------|-------------|
| `model` | Model id passed to the harness adapter. |
| `cwd` | Working directory for the harness subprocess. |
| `timeoutMs` | Hard timeout per repetition (adapter kills the process group after this). |
| `env` | Extra environment variables (`KEY: value` strings). |
| `claudeCode` | Claude Code adapter options — see [README](../README.md#claude-code-adapter). |

---

## Reference trajectory

Optional ground-truth tool sequence for **trajectory metrics** (`harnessMetrics`) and **Vertex EvaluateInstances** payloads (`trajectoryInstances`) on the eval envelope. Does not affect behavioral assertions unless you write assertions that match the same tools.

### Shorthand — step array

```yaml
reference_trajectory:
  - tool_name: ListLandingZones
    tool_input: {}
  - tool_name: GetLandingZone
    tool_input: { name: "aibake" }
```

### Object form — with name mode

```yaml
reference_trajectory:
  tool_name_mode: bare   # harness (default) | bare
  steps:
    - tool_name: ListLandingZones
      tool_input: {}
```

| `tool_name_mode` | Behavior |
|------------------|----------|
| `harness` (default) | Tool names compared and exported as written. Use full MCP names when the harness emits them (e.g. `mcp__plugin_alis-build_api__ListLandingZones`). |
| `bare` | Strip the MCP namespace prefix (suffix after the last `__`) on **both** predicted and reference names before comparison and protojson export. Lets you author references with short names like `ListLandingZones` while the harness records `mcp__…__ListLandingZones`. |

**Important:** bare mode is a literal suffix match — `ListLandingZones` and `list_landing_zones` are different. Author reference steps using the exact suffix the harness emits (check a `report.json` or envelope after one run).

`tool_input` is JSON-serialized for comparison; object and string forms are equivalent when content matches.

When no reference trajectory is defined, envelope repetitions omit `trajectoryInstances` and `harnessMetrics`.

---

## Human ratings

Optional map of numeric scores for human review workflows or external analytics:

```yaml
human_ratings:
  quality: 4
  grounding: 5
```

Copied to `EvalRunEnvelope` cells and trajectory projection JSONL. Not used by assertions or the built-in grader.

---

## Assertions & thresholds

See [assertions.md](assertions.md) for the full DSL. Each assertion may include an optional `threshold` (default `1.0` — every evaluated rep must pass):

```yaml
assertions:
  - called: mcp__api__search_skills
    threshold: 0.8
```

Harness crashes and timeouts are excluded from pass-rate denominators and counted as `adapterErrors`.

---

## Grading config (`grading.yaml`)

Outcome grading uses a **separate file** from the suite. Point `harness-eval grade` at it with `--config`.

```yaml
judge:
  adapter: claude-code
  model: claude-sonnet-4-6
  timeoutMs: 300000
  maxConcurrent: 2
  system_instruction: "You are a strict evaluator. Cite evidence from the transcript."
  env:
    ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
  claudeCode:
    permissionMode: bypassPermissions
```

| Field | Description |
|-------|-------------|
| `judge.adapter` | Judge harness (default: `claude-code`). |
| `judge.model` | Model for the judge subprocess. |
| `judge.timeoutMs` | Per-expectation batch timeout. |
| `judge.maxConcurrent` | Parallel judge processes (default: **2** when unset). |
| `judge.system_instruction` | Optional prefix prepended to the built-in grading prompt. |
| `judge.env` | Environment for the judge process. |
| `judge.cwd` | Working directory for the judge. |
| `judge.claudeCode` | Same options as suite `claudeCode` — see [README](../README.md#claude-code-adapter). |

**Built-in judge defaults** (unless overridden under `judge.claudeCode`): `maxTurns: 1`, `bare: true`, `disableSlashCommands: true`, `noSessionPersistence: true`, `permissionMode: bypassPermissions`. These keep grading fast and isolated from plugins/MCP.

**Expectations source:** copied from the suite into `report.json` at `run` time. Use `--expectations` on the CLI only when the report lacks them.

**CLI overrides:** `--model`, `--binary`, `--timeout-ms`, and `--max-concurrent` override the YAML file.

Relative paths in grading config resolve against the **grading file directory**.

Load programmatically:

```typescript
import { loadGradingConfig } from "@alis-build/harness-eval/config";
import { resolveGradeOptions, gradeReport } from "@alis-build/harness-eval";

const gradingConfig = await loadGradingConfig("./examples/grading.yaml");
const grading = await gradeReport(report, resolveGradeOptions(gradingConfig));
```

See also [eval-record.md — Grading config](eval-record.md#grading-config-gradingyaml).

---

## Related docs

- [README — Quick start & CLI](../README.md)
- [assertions.md — Assertion DSL](assertions.md)
- [eval-record.md — EvalRunEnvelope & interchange](eval-record.md)
