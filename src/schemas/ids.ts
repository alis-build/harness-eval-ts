/**
 * Canonical JSON Schema document IDs for published schema files.
 *
 * These match the `$id` written to `schemas/*.schema.json` on build.
 * Hosted on GitHub once the repo is published:
 * https://github.com/alis-build/harness-eval-ts
 */

export const SCHEMA_REPO_URL = "https://github.com/alis-build/harness-eval-ts";

/** Default branch for raw schema URLs (update tag when pinning releases). */
export const SCHEMA_REPO_BRANCH = "main";

const RAW_BASE = `https://raw.githubusercontent.com/alis-build/harness-eval-ts/${SCHEMA_REPO_BRANCH}/schemas`;

/** Canonical `$id` for trajectory-view.schema.json. */
export const TRAJECTORY_VIEW_SCHEMA_ID = `${RAW_BASE}/trajectory-view.schema.json`;

/** Canonical `$id` for eval-run-envelope.schema.json. */
export const EVAL_RUN_ENVELOPE_SCHEMA_ID = `${RAW_BASE}/eval-run-envelope.schema.json`;

/** Canonical `$id` for eval-interchange.schema.json. */
export const EVAL_INTERCHANGE_SCHEMA_ID = `${RAW_BASE}/eval-interchange.schema.json`;
