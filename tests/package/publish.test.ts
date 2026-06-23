import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "../..");
const packageJsonPath = join(repoRoot, "package.json");

type PackageJson = {
  bin?: Record<string, string>;
  files?: string[];
  scripts?: Record<string, string>;
  publishConfig?: { access?: string };
  repository?: string | { type?: string; url?: string };
  homepage?: string;
  bugs?: string | { url?: string };
};

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
}

describe("npm publish configuration", () => {
  it("runs build before publish via prepublishOnly", () => {
    const pkg = readPackageJson();
    expect(pkg.scripts?.prepublishOnly).toMatch(/build/);
  });

  it("runs build before pack via prepack", () => {
    const pkg = readPackageJson();
    expect(pkg.scripts?.prepack).toMatch(/build/);
  });

  it("configures scoped package for public npm access", () => {
    const pkg = readPackageJson();
    expect(pkg.publishConfig?.access).toBe("public");
  });

  it("exposes harness-eval bin at dist/cli/bin.js", () => {
    const pkg = readPackageJson();
    expect(pkg.bin?.["harness-eval"]).toBe("./dist/cli/bin.js");
  });

  it("ships dist, schemas, README, and LICENSE in the tarball", () => {
    const pkg = readPackageJson();
    expect(pkg.files).toEqual(
      expect.arrayContaining(["dist", "schemas", "README.md", "LICENSE"]),
    );
  });

  it("includes repository, homepage, and bugs metadata", () => {
    const pkg = readPackageJson();
    const repoUrl =
      typeof pkg.repository === "string"
        ? pkg.repository
        : pkg.repository?.url;
    expect(repoUrl).toMatch(/github\.com\/alis-build\/harness-eval-ts/i);
    expect(pkg.homepage).toMatch(/github\.com\/alis-build\/harness-eval-ts/i);
    const bugsUrl =
      typeof pkg.bugs === "string" ? pkg.bugs : pkg.bugs?.url;
    expect(bugsUrl).toMatch(/github\.com\/alis-build\/harness-eval-ts/i);
  });

  it("includes LICENSE file on disk when listed in files", () => {
    const pkg = readPackageJson();
    expect(pkg.files).toContain("LICENSE");
    expect(existsSync(join(repoRoot, "LICENSE"))).toBe(true);
  });
});
