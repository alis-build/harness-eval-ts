/**
 * Helpers for OTLP attribute values.
 */

import type { AnyValue, KeyValue } from "./types";

export function strAttr(key: string, value: string): KeyValue {
  return { key, value: { stringValue: value } };
}

export function intAttr(key: string, value: number): KeyValue {
  return { key, value: { intValue: String(value) } };
}

export function boolAttr(key: string, value: boolean): KeyValue {
  return { key, value: { boolValue: value } };
}

export function jsonAttr(key: string, value: unknown): KeyValue {
  return { key, value: { stringValue: JSON.stringify(value) } };
}

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
