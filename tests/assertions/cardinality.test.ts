import { describe, expect, it } from "vitest";

import {
  describeCardinality,
  parseCardinality,
} from "../../src/assertions/cardinality";

describe("cardinality", () => {
  it("parses operators", () => {
    expect(parseCardinality(">= 1")(3)).toBe(true);
    expect(parseCardinality("== 2")(2)).toBe(true);
    expect(parseCardinality("< 5")(4)).toBe(true);
    expect(parseCardinality("!= 2")(2)).toBe(false);
    expect(parseCardinality("!= 2")(3)).toBe(true);
    expect(parseCardinality("> 0")(1)).toBe(true);
    expect(parseCardinality("> 0")(0)).toBe(false);
    expect(parseCardinality("<= 3")(3)).toBe(true);
    expect(parseCardinality("<= 3")(4)).toBe(false);
  });

  it("defaults undefined to >= 1", () => {
    expect(parseCardinality(undefined)(0)).toBe(false);
    expect(parseCardinality(undefined)(1)).toBe(true);
  });

  it("describeCardinality resolves default", () => {
    expect(describeCardinality(undefined)).toBe(">= 1");
    expect(describeCardinality("== 2")).toBe("== 2");
  });

  it("throws on invalid format", () => {
    expect(() => parseCardinality("invalid")).toThrow();
  });
});
