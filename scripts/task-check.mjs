#!/usr/bin/env node
/* eslint-env node */
/* global process, console */
import path from "node:path";
import { readFileSync } from "node:fs";

import { parse as parseYaml } from "yaml";

import { validateEaSchema } from "../dist/index.js";
import { fileExists, normalizePath } from "./harness-lib.mjs";

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
  };
}

const args = parseArgs(process.argv.slice(2));
const cwd = process.cwd();
const findings = [];

const requiredFiles = [
  ".anchored-spec/policy.json",
  "docs/AGENTS.md",
  "docs/workflows/repository-harness.md",
];

for (const filePath of requiredFiles) {
  findings.push({
    check: `file:${filePath}`,
    ok: fileExists(cwd, filePath),
    detail: fileExists(cwd, filePath) ? "present" : "missing",
  });
}

if (fileExists(cwd, ".anchored-spec/policy.json")) {
  const policyPath = ".anchored-spec/policy.json";
  const source = readFileSync(policyPath, "utf8");
  const policy = path.extname(policyPath) === ".json" ? JSON.parse(source) : parseYaml(source);
  const result = validateEaSchema(policy, "workflow-policy");
  findings.push({
    check: "schema:workflow-policy",
    ok: result.valid,
    detail: result.valid ? "valid" : result.errors.map((entry) => `${entry.path}: ${entry.message}`).join("; "),
  });
}

if (fileExists(cwd, "package.json")) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const scripts = pkg.scripts ?? {};
  for (const scriptName of ["task:start", "task:verify", "task:check", "task:close", "test:harness"]) {
    findings.push({
      check: `script:${scriptName}`,
      ok: typeof scripts[scriptName] === "string" && scripts[scriptName].length > 0,
      detail: typeof scripts[scriptName] === "string" ? scripts[scriptName] : "missing",
    });
  }
}

if (fileExists(cwd, ".gitignore")) {
  const gitignore = readFileSync(".gitignore", "utf8");
  for (const entry of [
    ".anchored-spec/task-brief.json",
    ".anchored-spec/verification-report.json",
    ".anchored-spec/verification-baseline.json",
    ".anchored-spec/execution-report.json",
  ]) {
    findings.push({
      check: `gitignore:${entry}`,
      ok: gitignore.includes(entry),
      detail: gitignore.includes(entry) ? "ignored" : "missing",
    });
  }
}

const ok = findings.every((entry) => entry.ok);
const report = {
  generatedAt: new Date().toISOString(),
  ok,
  findings: findings.map((entry) => ({ ...entry, check: normalizePath(entry.check) })),
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`# Harness Check\n\n${findings.map((entry) => `- [${entry.ok ? "ok" : "fail"}] ${entry.check}: ${entry.detail}`).join("\n")}`);
}

if (!ok) {
  process.exit(1);
}
