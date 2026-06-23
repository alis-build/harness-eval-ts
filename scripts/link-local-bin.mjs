#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const binPath = join(repoRoot, "dist", "cli", "bin.js");
const binDir = join(repoRoot, "node_modules", ".bin");
const linkPath = join(binDir, "harness-eval");

if (!existsSync(join(repoRoot, ".git")) || !existsSync(binPath)) {
  process.exit(0);
}

mkdirSync(binDir, { recursive: true });

try {
  unlinkSync(linkPath);
} catch (err) {
  if (err.code !== "ENOENT") {
    throw err;
  }
}

symlinkSync(relative(binDir, binPath), linkPath);
