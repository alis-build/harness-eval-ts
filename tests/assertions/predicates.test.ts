import { describe, expect, it } from "vitest";

import { matches } from "../../src/assertions/predicates";

describe("predicates", () => {
  it("scalar equals shortcut", () => {
    expect(matches("deploy", "deploy")).toBe(true);
    expect(matches("deploy", "other")).toBe(false);
  });

  it("leaf operators", () => {
    expect(matches("hello world", { contains: "world" })).toBe(true);
    expect(matches("hello", { not_contains: "x" })).toBe(true);
    expect(matches(5, { gte: 3 })).toBe(true);
    expect(matches(5, { gt: 4 })).toBe(true);
    expect(matches(3, { lt: 5 })).toBe(true);
    expect(matches(5, { one_of: [1, 5, 9] })).toBe(true);
    expect(matches("nope", { one_of: [1, 5, 9] })).toBe(false);
  });

  it("deep equality", () => {
    expect(matches(null, null)).toBe(true);
    expect(matches([1, 2], [1, 2])).toBe(true);
    expect(matches([1, 2], [1])).toBe(false);
  });

  it("regex — invalid pattern returns false", () => {
    expect(matches("abc", { regex: "[" })).toBe(false);
  });

  it("compound any_of / all_of / not", () => {
    expect(matches("x", { any_of: [{ equals: "x" }, { equals: "y" }] })).toBe(
      true,
    );
    expect(
      matches("z", { any_of: [{ equals: "x" }, { equals: "y" }] }),
    ).toBe(false);
    expect(matches({ a: 1, b: 2 }, { a: { gte: 0 }, b: { lte: 5 } })).toBe(
      true,
    );
    expect(matches("x", { not: { equals: "y" } })).toBe(true);
    expect(matches("x", { not: { equals: "x" } })).toBe(false);
  });

  it("nested and multi-field object predicates", () => {
    expect(matches({ a: { b: "x" } }, { a: { b: "x" } })).toBe(true);
    expect(matches({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
  });

  it("object predicate disambiguation", () => {
    expect(matches({ field: "value" }, { field: "value" })).toBe(true);
  });
});
