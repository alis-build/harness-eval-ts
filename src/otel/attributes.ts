/**
 * Helpers for OTLP attribute values.
 *
 * OTLP JSON uses typed value objects (`stringValue`, `intValue`, etc.) rather
 * than plain JSON scalars on attributes.
 */

import type { AnyValue, KeyValue } from "./types";

/** Build a string-typed OTLP attribute. */
export function strAttr(key: string, value: string): KeyValue {
  return { key, value: { stringValue: value } };
}

/** Build an integer-typed OTLP attribute (stored as decimal string). */
export function intAttr(key: string, value: number): KeyValue {
  return { key, value: { intValue: String(value) } };
}

/** Build a boolean-typed OTLP attribute. */
export function boolAttr(key: string, value: boolean): KeyValue {
  return { key, value: { boolValue: value } };
}

/** Build a JSON-serialized string attribute (common for message arrays). */
export function jsonAttr(key: string, value: unknown): KeyValue {
  return { key, value: { stringValue: JSON.stringify(value) } };
}

/** Coerce an arbitrary JS value into an OTLP {@link AnyValue}. */
export function anyValue(value: unknown): AnyValue {
  if (value === null || value === undefined) {
    return { stringValue: "" };
  }
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "boolean") {
    return { boolValue: value };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { intValue: String(value) };
    }
    return { doubleValue: value };
  }
  return { stringValue: JSON.stringify(value) };
}
