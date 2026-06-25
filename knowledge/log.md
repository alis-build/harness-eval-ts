# Knowledge Bundle Update Log

## 2026-06-25 (multi-adapter docs)

* **Update**: [overview](/knowledge/overview.md) — three built-in adapters (Claude Code, Codex, Gemini CLI); version 0.1.3.
* **Update**: [getting started](/knowledge/guides/getting-started.md), [CI/CD](/knowledge/guides/ci-cd-integration.md), [custom judges](/knowledge/guides/custom-judges.md), [external eval platforms](/knowledge/guides/external-eval-platforms.md) — adapter-neutral framing; Claude tutorial retained with cross-links.
* **Update**: [data flow](/knowledge/architecture/data-flow.md), [two-layer evaluation](/knowledge/architecture/two-layer-evaluation.md), [adapters](/knowledge/architecture/adapters.md) — vendor-neutral pipeline and judge descriptions.
* **Update**: [suite YAML](/knowledge/reference/suite-yaml.md), [library API](/knowledge/reference/library-api.md), [Claude Code adapter](/knowledge/reference/claude-code-adapter.md), [trajectory-view](/knowledge/concepts/trajectory-view.md) — multi-adapter references.

## 2026-06-24 (unified suite config)

* **Update**: [suite YAML reference](/knowledge/reference/suite-yaml.md) — inline `judge:` and `pipeline:` blocks, input resolution, auth notes.
* **Update**: [CLI commands](/knowledge/reference/cli-commands.md) — `harness-eval pipeline`, `--suite` on `grade`.
* **Update**: [data flow](/knowledge/architecture/data-flow.md) — `loadSuiteDocument`, `runPipeline`, `resolvePipelineInputs`.
* **Update**: [library API](/knowledge/reference/library-api.md) — `loadSuiteDocument`, `runPipeline`, `resolvePipelineInputs`; fixed complete example.
* **Update**: [getting started](/knowledge/guides/getting-started.md) — unified suite first; standalone `grading.yaml` as alternate.
* **Update**: [CI/CD integration](/knowledge/guides/ci-cd-integration.md) — optional single `pipeline` job pattern.

## 2026-06-24

* **Initialization**: Established the knowledge bundle for `@alis-build/harness-eval` v0.1.2.
* **Creation**: Authored [overview](/knowledge/overview.md) covering project purpose and key design decisions.
* **Creation**: Authored architecture documents covering [data flow](/knowledge/architecture/data-flow.md), [two-layer evaluation](/knowledge/architecture/two-layer-evaluation.md), and the [adapter pattern](/knowledge/architecture/adapters.md).
* **Creation**: Authored concept documents for [TrajectoryView](/knowledge/concepts/trajectory-view.md), [SuiteReport](/knowledge/concepts/suite-report.md), [EvalRunEnvelope](/knowledge/concepts/eval-run-envelope.md), [matrix cells](/knowledge/concepts/matrix-cells.md), and [statistical thresholds](/knowledge/concepts/statistical-thresholds.md).
* **Creation**: Authored reference documents for [CLI commands](/knowledge/reference/cli-commands.md), the [assertion DSL](/knowledge/reference/assertion-dsl.md), [suite YAML](/knowledge/reference/suite-yaml.md), the [Claude Code adapter](/knowledge/reference/claude-code-adapter.md), and the [library API](/knowledge/reference/library-api.md).
* **Creation**: Authored guides for [getting started](/knowledge/guides/getting-started.md), [CI/CD integration](/knowledge/guides/ci-cd-integration.md), [custom judges](/knowledge/guides/custom-judges.md), and [external eval platforms](/knowledge/guides/external-eval-platforms.md).
* **Creation**: Authored schema reference documents for [TrajectoryView](/knowledge/schemas/trajectory-view.md) and [EvalRunEnvelope](/knowledge/schemas/eval-run-envelope.md).
