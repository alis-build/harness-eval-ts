import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "adapters/claude-code/index": "src/adapters/claude-code/index.ts",
    "runner/suite": "src/runner/suite.ts",
    "config/loader": "src/config/loader.ts",
    "cli/bin": "src/cli/bin.ts",
  },
  format: "esm",
  dts: true,
  clean: true,
  sourcemap: true,
  checks: { sourcemapBroken: false },
  platform: "node",
  target: "node24",
  outDir: "dist",
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
