/**
 * Helpers for JSON Schema documentation fields on Zod schemas.
 * Metadata is exported via `z.toJSONSchema()` — see https://zod.dev/json-schema
 */

import type { z } from "zod";

export interface SchemaDoc {
  /** Stable name for `$defs` when `reused: "ref"` is enabled. */
  id?: string;
  title?: string;
  description: string;
  examples?: unknown[];
  [key: string]: unknown;
}

/** Attach title, description, and optional `id` for JSON Schema export. */
export function described<T extends z.ZodType>(schema: T, doc: SchemaDoc): T {
  return schema.meta(doc) as T;
}

/** Field-level description (no title). */
export function field<T extends z.ZodType>(
  schema: T,
  description: string,
  examples?: unknown[],
): T {
  return described(schema, { description, examples });
}
