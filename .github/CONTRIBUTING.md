# Contributing to @alis-build/harness-eval

Thank you for helping improve this project. Clear contribution guidelines save time for both maintainers and contributors. GitHub surfaces this file on the repository **Contributing** tab and when opening issues or pull requests; see [Setting guidelines for repository contributors](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors) for how that works.

## Code of conduct

Be respectful and constructive. Assume good intent, keep feedback specific, and focus on the problem or the code.

## What to contribute

Useful contributions include bug reports with reproduction steps (minimal suite YAML and CLI invocation when possible), failing tests, documentation fixes, and focused pull requests that solve one problem at a time.

## Before you start

- Read [README.md](../README.md) for installation, suite YAML, CLI commands, and how consumers use the library.
- For the eval record contract and assertion DSL, see [docs/eval-record.md](../docs/eval-record.md) and [docs/assertions.md](../docs/assertions.md).

## Development setup

### Requirements

- **Node.js** — ≥ 22.12 required; Node 24 LTS recommended for development and CI.
- **pnpm** — this repo uses pnpm; install it from [pnpm.io](https://pnpm.io/installation) if needed.
- **`claude` on PATH** — required when running suites or tests against the Claude Code adapter.

### Clone and install

```shell
git clone https://github.com/alis-build/harness-eval-ts.git
cd harness-eval-ts
pnpm install
pnpm run build
```

If you use a fork, run `pnpm install` from the directory that contains this package's `package.json`.

## Common commands

| Command | Purpose |
| ------- | ------- |
| `pnpm run build` | Generate JSON schemas and compile TypeScript → `dist/` |
| `pnpm test` | Full Vitest suite |
| `pnpm run typecheck` | `tsc --noEmit` |
| `pnpm run generate-schemas` | Regenerate `schemas/*.schema.json` from Zod (also runs as part of `build`) |

Run `pnpm run build`, `pnpm run typecheck`, and `pnpm test` before opening a PR that changes library code.

## Schemas

- **`schemas/*.schema.json` is generated** — do not edit by hand. Change Zod schemas under `src/schemas/`, then run `pnpm run generate-schemas` (or `pnpm run build`).
- JSON Schema `$id` URLs and repo links are defined in `src/schemas/ids.ts`.

## Making a change

1. **Prefer small PRs** — one logical change per pull request when possible.
2. **Add or extend tests** for behavior you fix or introduce (Vitest under `tests/`).
3. **Run `pnpm test`, `pnpm run typecheck`, and `pnpm run build`** before opening a PR.
4. **Documentation** — update **README.md** or **docs/** when the change affects suite YAML, CLI flags, adapters, assertions, or the eval record contract.

## Pull requests

A good PR usually includes:

- A short description of the problem and what you changed.
- Test updates when behavior changes.
- Regenerated schema output (`pnpm run generate-schemas`) when Zod schemas change — review the diff carefully.
- No unrelated refactors or formatting-only churn in files you did not need to touch.

If the change is user-visible (bug fix or feature), note it in the PR body so maintainers can decide whether release notes or a version bump are needed.

## Issues

**Bug reports** are most actionable when they include:

- Versions: Node, `pnpm`, `@alis-build/harness-eval` (or commit), and harness adapter (`claude-code`, etc.) when relevant.
- Expected vs actual behavior (CLI output, assertion results, grading, or envelope shape).
- Minimal reproduction: suite YAML snippet, CLI command, and relevant paths from `report.json` or `envelope.json` when applicable.

**Feature requests** are welcome; describe the use case (for example a new assertion kind, harness adapter, grading workflow, or eval interchange field) so maintainers can weigh design trade-offs.

## License

By contributing, you agree your contributions are licensed under the same terms as the project — see [LICENSE](../LICENSE).
