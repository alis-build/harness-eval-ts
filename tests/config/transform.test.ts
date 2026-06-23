import { describe, expect, it } from "vitest";

import { ConfigError, parseSuite } from "../../src/config/loader";

describe("transform validation", () => {
  const base = `matrix:
  - label: x
    config: {}
cases:
  - id: c
    prompt: hi
    assertions:
`;

  it("rejects invalid cardinality at load time", () => {
    const yaml = `${base}      - called:
          tool: Bash
          times: "not valid"
`;
    expect(() => parseSuite(yaml)).toThrow(ConfigError);
  });

  it("rejects non-positive max", () => {
    const yaml = `${base}      - iterations_within: -1
`;
    expect(() => parseSuite(yaml)).toThrow(ConfigError);
  });

  it("rejects invalid predicate leaf types", () => {
    const yaml = `${base}      - called_with:
          tool: Bash
          args:
            x: { gte: "string" }
`;
    expect(() => parseSuite(yaml)).toThrow(ConfigError);
  });

  it("rejects invalid regex at load time", () => {
    const yaml = `${base}      - called_with:
          tool: Bash
          args:
            x: { regex: "[" }
`;
    expect(() => parseSuite(yaml)).toThrow(ConfigError);
  });
});
