# Assertions & adapters

Reference for the behavioral assertion DSL and for extending harness-eval with new assertion types or harness adapters.

For installation, CLI usage, and the two-layer eval workflow (`run` + `grade`), see the [README](../README.md).

---

## What assertions read

Every assertion runs against one **`TrajectoryView`** — a normalized snapshot of a single harness run:

| Field | Use in assertions |
|-------|-------------------|
| `toolCalls[]` | Name, args, result, order (`callIndex`, `turnIndex`) |
| `turns[]` | Per-assistant-turn text and tool calls |
| `finalResponse` | Concatenated assistant text |
| `usage` | Cost, duration, token counts |
| `success` | Whether the harness reported a clean completion |

Adapters translate vendor output (Claude `stream-json`, Cursor SDK events, etc.) into this shape. The runner and assertion engine never parse raw harness stdout directly.

---

## YAML shape vs runtime shape

**YAML** (authoring) uses single-key objects for ergonomics and LLM bulk-generation:

```yaml
- called: mcp__api__search_skills
- called_before:
    first: mcp__api__search_skills
    then: mcp__api__load_skill
```

**Runtime** (evaluator) uses a tagged union with a `type` field for exhaustiveness checking. The loader in `src/config/transform.ts` transforms YAML → runtime types and returns path-qualified `ConfigError` on invalid shapes. Grading config uses `GradingConfigSchema` / `grading-loader.ts` (separate from suite loading).

Shortcuts (bare scalar instead of object):

| Assertion | Shortcut |
|-----------|----------|
| `called` | `- called: tool_name` |
| `not_called` | `- not_called: tool_name` |
| `response_contains` | `- response_contains: "text"` |
| `responded_without_tool_calls` | `- responded_without_tool_calls: true` |

Everything else uses the verbose object form.

---

## Thresholds and statistical model

Each assertion in a case is wrapped in a **threshold** — the minimum pass rate across repetitions:

```yaml
assertions:
  - called: mcp__api__search_skills
    threshold: 0.8
```

- Default threshold: `1.0` (every evaluated rep must pass).
- Default repetitions: `5` per (case, matrix cell).
- A **cell passes** only if **every** assertion meets its threshold.

### Adapter errors

If the harness crashes, times out, or never emits a usable session, that repetition is **excluded** from assertion pass-rate denominators. It is counted on `CellReport.adapterErrors`.

Watch for misleading stats when many reps crash: e.g. `2/2 = 100%` on `called(...)` with `adapterErrors: 8` means only two reps actually ran.

### Why repetitions matter

Tool selection is non-deterministic. A single run answers “did it happen once?” — repetitions answer “does it happen reliably?” Typical values: 5 for development, 10 for release gates.

---

## Assertion reference

All assertions evaluate against one `TrajectoryView`. Cardinality for `called` defaults to `">= 1"`.

### Tool-call presence

```yaml
# Was a tool called?
- called: mcp__api__search_skills
- called:
    tool: mcp__api__search_skills
    times: ">= 2"

# Glob patterns
- called: { tool: { pattern: "mcp__api__*" } }
- called: { tool: "mcp__*" }

# Was a tool NOT called?
- not_called: Bash
- not_called: { tool: WebSearch }

# Any / all of a set
- called_any_of: [mcp__api__load_skill, mcp__api__load_skill_resources]
- called_all_of: [mcp__api__search_skills, mcp__api__load_skill]
```

**Cardinality** (`times`): `"== n"`, `"!= n"`, `">= n"`, `"<= n"`, `"> n"`, `"< n"`.

### Tool-call ordering

Ordering uses **`turnIndex`**, not wall-clock time. Parallel tool calls in the same assistant message share a `turnIndex` and are unordered relative to each other.

```yaml
# Tool A strictly before tool B (by turn)
- called_before:
    first: mcp__api__search_skills
    then: mcp__api__load_skill

# Sequence in order; interleaving with other tools allowed
- sequence: [mcp__api__search_skills, mcp__api__load_skill]

# Contiguous sequence — no extra tools between members
- sequence:
    tools: [mcp__api__search_skills, mcp__api__load_skill]
    strict: true
```

### Tool-call arguments

```yaml
- called_with:
    tool: mcp__api__search_skills
    args:
      query: { contains: deploy }

# Multiple predicates compose as AND on fields
- called_with:
    tool: mcp__api__search_skills
    args:
      query:
        all_of:
          - { contains: neuron }
          - { not_contains: delete }
      limit: { gte: 5 }
```

Scalar arg values are `equals` shortcuts: `query: deploy` ≡ `query: { equals: deploy }`.

#### Predicate operators

| Operator | Meaning | Value type |
|----------|---------|------------|
| `equals` | Deep equality | any |
| `contains` | Substring | string |
| `not_contains` | Absence of substring | string |
| `regex` | Regex match | string |
| `gte`, `lte`, `gt`, `lt` | Numeric comparison | number |
| `one_of` | Deep-equal to any of | array |
| `any_of` | OR of predicates | array of predicates |
| `all_of` | AND of predicates | array of predicates |
| `not` | Inversion | predicate |

Object-shaped predicates descend into fields: `{ query: ..., limit: ... }` requires both fields to match.

### Behavior

```yaml
# Answered without calling any tool (common failure mode for MCP skills)
- responded_without_tool_calls: true

# Efficiency budgets
- iterations_within: 8
- iterations_within: { max: 8 }
- cost_within_usd: 0.10
- duration_within_ms: 30000

# Stop reason of the final assistant turn
- finished_with: end_turn
- finished_with: [end_turn, max_tokens]
```

### Response text

Checks `finalResponse` (accumulated assistant text across turns).

```yaml
- response_contains: "neuron-deploy"
- response_not_contains: "I don't have access to"
- response_matches:
    pattern: "step \\d+:"
    flags: i
```

### Compound assertions

```yaml
- all_of:
    - called: mcp__api__search_skills
    - called: mcp__api__load_skill

- any_of:
    - called: mcp__api__load_skill
    - called: mcp__api__load_skill_resources

- not:
    called: { pattern: "WebFetch|WebSearch" }
- not:
    responded_without_tool_calls: true
```

### Code-only: custom predicate

For programmatic suites (not YAML):

```typescript
{
  type: "predicate",
  fn: (view) => view.toolCalls.some((c) => c.name.startsWith("mcp__api__")),
  description: "called some mcp__api__ tool",
}
```

---

## Example case

```yaml
- id: deploy-neuron-implicit
  prompt: "I want to deploy this neuron to staging"
  category: deploy-flow
  notes: Implicit invocation — no slash command
  repetitions: 10
  config:
    timeoutMs: 90000

  assertions:
    - called: mcp__api__search_skills
      threshold: 0.8

    - called_with:
        tool: mcp__api__search_skills
        args:
          query: { contains: deploy }
      threshold: 0.7

    - called_before:
        first: mcp__api__search_skills
        then: { pattern: "mcp__api__load_*" }
      threshold: 0.75

    - not:
        responded_without_tool_calls: true
      threshold: 1.0

    - iterations_within: 8
      threshold: 0.9
```

Per-assertion thresholds give diagnostic shape: strict floor on blind answers, softer target on search invocation rate.

---

## Outcome expectations (not assertions)

Natural-language checks live in `expectations` on each case. They are **not** evaluated by the assertion engine — use `harness-eval grade` to run an LLM judge against the trajectory transcript.

```yaml
expectations:
  - "The response lists multiple landing zone names"
  - "Each zone includes a status such as ACTIVE or FAILED"
```

Judge model, timeout, and env live in a separate **`grading.yaml`** (`judge` block). See [eval-record.md](eval-record.md#grading-config-gradingyaml) and the [README](../README.md) `grade` command (`--config`, `--expectations` sidecar).

---

## Extending: new assertion type

1. Add a variant to the `Assertion` union in `src/types/assertions.ts`.
2. Implement an evaluator in the appropriate `src/assertions/<group>.ts` module.
3. Wire the variant in `src/assertions/evaluator.ts` (the `default: never` case enforces exhaustiveness).
4. Add YAML transformation in `src/config/transform.ts`.
5. Add tests in `tests/assertions/` with `makeView()` / `makeToolCall()` fixtures.
6. Document the YAML shape in this file.

---

## Extending: new harness adapter

### Contract

Implement `HarnessAdapter`:

```typescript
interface HarnessAdapter<TConfig extends BaseAdapterConfig> {
  readonly id: string;
  run(config: TConfig): Promise<AdapterResult>;
}

interface AdapterResult {
  view: TrajectoryView;
  diagnostics: AdapterDiagnostics;
}
```

The runner injects the adapter via `runSuite(suite, { adapter })`. YAML selects it with `adapter: <id>`.

### Recommended steps

1. Create `src/adapters/<harness-id>/` with:
   - `types.ts` — config extending `BaseAdapterConfig`
   - Process/SDK runner (spawn, SDK client, etc.)
   - `translate.ts` (if needed) — native events → `StreamEvent`
   - `index.ts` — orchestrator: run → `TrajectoryBuilder` → `AdapterResult`

2. **Prefer translation to `StreamEvent`** rather than building `TrajectoryView` by hand. Feed events through `TrajectoryBuilder` in `src/trajectory/builder.ts` so tool-result matching and turn indexing stay consistent.

3. Register the adapter in `src/adapters/registry.ts`:

   ```typescript
   const ADAPTERS: Record<string, HarnessAdapter> = {
     "claude-code": claudeCodeAdapter,
     "your-harness": yourAdapter,
   };
   ```

4. Add suite config schema under a nested key in `src/config/schema.ts` (mirror `claudeCode`), and flatten in `src/config/resolve-config.ts` if the runner needs a typed adapter config.

5. Export optionally from `src/index.ts` (`export * as yourHarness from "./adapters/your-harness"`).

6. Add integration tests with recorded event fixtures; avoid requiring the real binary in CI where possible.

### Claude Code adapter (reference)

| Piece | Role |
|-------|------|
| `flags.ts` | Pure: config → CLI argv (`stream-json`, `--verbose`, etc.) |
| `process.ts` | Spawn, timeout, abort, process-group kill, optional config isolation |
| `index.ts` | `parseStreamJson` → `TrajectoryBuilder` → return view |

Nested YAML config:

```yaml
defaultConfig:
  model: claude-sonnet-4-6
  claudeCode:
    isolateConfig: false
    allowedTools: [mcp__plugin_alis-build_api__*]
```

### Cursor adapter (sketch)

Use `@cursor/sdk` (or equivalent) for programmatic runs. Translate SDK callbacks to `StreamEvent`, then reuse `TrajectoryBuilder`. Suggested layout:

```
src/adapters/cursor/
├── types.ts
├── translate.ts    # CursorEvent → StreamEvent
├── runner.ts       # SDK invocation
└── index.ts
```

### Gemini CLI adapter (sketch)

Headless spawn + JSON/stream output, same pattern as Claude Code. Document any fields that are best-effort if the native event surface is thinner.

### Suite config for multiple adapters

Top-level generic fields (`model`, `cwd`, `timeoutMs`, `env`) apply to all adapters. Adapter-specific options use nested blocks:

```yaml
adapter: claude-code
defaultConfig:
  timeoutMs: 60000
  claudeCode:
    pluginDirs: [./plugins/v1.2.0]
```

Future adapters would use their own key (e.g. `cursor:`, `gemini:`).

---

## Module map (assertions)

```
src/
├── types/
│   ├── trajectory.ts      TrajectoryView, ToolCall
│   └── assertions.ts      Assertion union, Predicate, AssertionResult
├── assertions/
│   ├── cardinality.ts     Parse ">= 2" etc.
│   ├── patterns.ts        Glob tool name matching
│   ├── predicates.ts      Argument predicate engine
│   ├── tool-calls.ts      called, called_before, sequence, ...
│   ├── behavior.ts        responded_without_tool_calls, cost, duration
│   ├── compound.ts        all_of, any_of, not
│   └── evaluator.ts       Top-level dispatcher
├── trajectory/
│   └── builder.ts         StreamEvent[] → TrajectoryView
├── adapters/
│   ├── types.ts           HarnessAdapter, AdapterResult
│   ├── registry.ts        Adapter id resolution
│   └── claude-code/        Reference implementation
├── config/
│   ├── transform.ts       YAML assertions → Assertion tagged union
│   ├── loader.ts          loadSuite, parseSuite
│   ├── grading-schema.ts  Grading YAML Zod schema
│   └── grading-loader.ts  loadGradingConfig, parseGradingConfig
├── grader/                Built-in Claude judge, resolveGradeOptions
├── eval-record/           buildEvalRunEnvelope
└── schemas/               Zod → JSON Schema (eval envelope, trajectory)
```

---

## Design notes

- **TrajectoryView is the universal contract.** Assertions and grading should read the view, not vendor streams.
- **OTel export is optional.** `trajectoryToOtlp()` produces side artifacts for observability; scoring uses `TrajectoryView` directly.
- **Unknown stream events are ignored** in `TrajectoryBuilder` so Claude Code schema evolution does not break CI.
- **`turnIndex` over wall-clock** for ordering assertions — parallel tools in one message do not have reliable timestamp order.
