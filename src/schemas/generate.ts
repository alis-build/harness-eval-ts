/**
 * Generate JSON Schema files from Zod definitions (build step).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { evalRunEnvelopeSchema } from "./eval-run-envelope";
import {
  evalDatasetRowSchema,
  instancesJsonlRowSchema,
} from "./eval-interchange";
import {
  EVAL_INTERCHANGE_SCHEMA_ID,
  EVAL_RUN_ENVELOPE_SCHEMA_ID,
  TRAJECTORY_VIEW_SCHEMA_ID,
} from "./ids";
import { trajectoryViewExportSchema } from "./trajectory-view";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = join(__dirname, "../../schemas");

const JSON_SCHEMA_DRAFT =
  "https://json-schema.org/draft/2020-12/schema" as const;

/** Metadata for one generated JSON Schema file. */
interface SchemaFileMeta {
  $id: string;
  title: string;
  description: string;
}

/** Convert a Zod schema to JSON Schema draft 2020-12 with document metadata. */
function toJsonSchema(
  schema: z.ZodType,
  meta: SchemaFileMeta,
): Record<string, unknown> {
  const body = z.toJSONSchema(schema, {
    unrepresentable: "any",
    reused: "ref",
  }) as Record<string, unknown>;

  return {
    $schema: JSON_SCHEMA_DRAFT,
    $id: meta.$id,
    title: meta.title,
    description: meta.description,
    ...body,
  };
}

/** Write one `.schema.json` file under the repo `schemas/` directory. */
/** Write one schema file under `schemas/` at repo root. */
async function writeSchema(
  filename: string,
  schema: z.ZodType,
  meta: SchemaFileMeta,
): Promise<void> {
  const path = join(schemasDir, filename);
  const json = toJsonSchema(schema, meta);
  await writeFile(path, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  console.log(`wrote ${path}`);
}

async function main(): Promise<void> {
  await mkdir(schemasDir, { recursive: true });

  await writeSchema(
    "trajectory-view.schema.json",
    trajectoryViewExportSchema,
    {
      $id: TRAJECTORY_VIEW_SCHEMA_ID,
      title: "TrajectoryView",
      description:
        "Cross-harness normalized agent session. Canonical contract for behavioral assertions, judges, and DB storage. Not Claude stream-json.",
    },
  );

  await writeSchema("eval-run-envelope.schema.json", evalRunEnvelopeSchema, {
    $id: EVAL_RUN_ENVELOPE_SCHEMA_ID,
    title: "EvalRunEnvelope",
    description:
      "Cross-harness eval run record for CI/CD, APIs, and databases. See docs/eval-record.md.",
  });

  await writeSchema("eval-interchange.schema.json", evalDatasetRowSchema, {
    $id: EVAL_INTERCHANGE_SCHEMA_ID,
    title: "EvalInterchange",
    description:
      "Trajectory projection row with Vertex EvaluationInstance wire fields.",
  });

  await writeSchema(
    "eval-interchange-instances.schema.json",
    instancesJsonlRowSchema,
    {
      $id: `${EVAL_INTERCHANGE_SCHEMA_ID}#InstancesJsonlRow`,
      title: "InstancesJsonlRow",
      description:
        "Type-tagged JSONL row for Vertex Trajectory*Instance batch export.",
    },
  );
}

await main();
