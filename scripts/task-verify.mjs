#!/usr/bin/env node
/* eslint-env node */
/* global process, console, URL */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  TASK_BRIEF_PATH,
  VERIFICATION_BASELINE_PATH,
  VERIFICATION_REPORT_PATH,
  normalizePath,
  readJson,
  unique,
  writeJson,
} from "./harness-lib.mjs";

function parseArgs(argv) {
  const args = {
    json: false,
    failFast: false,
    allowFailures: false,
    broader: false,
    noRefresh: false,
    updateBaseline: false,
    baselinePath: VERIFICATION_BASELINE_PATH,
    briefPath: null,
    taskStartArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") {
      args.json = true;
      continue;
    }
    if (value === "--fail-fast") {
      args.failFast = true;
      continue;
    }
    if (value === "--allow-failures") {
      args.allowFailures = true;
      continue;
    }
    if (value === "--broader") {
      args.broader = true;
      continue;
    }
    if (value === "--no-refresh") {
      args.noRefresh = true;
      continue;
    }
    if (value === "--update-baseline") {
      args.updateBaseline = true;
      continue;
    }
    if (value === "--baseline") {
      args.baselinePath = argv[index + 1] ?? args.baselinePath;
      index += 1;
      continue;
    }
    if (value === "--brief") {
      args.briefPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    args.taskStartArgs.push(value);
  }

  return args;
}

function resolveTaskStartScript() {
  return path.join(path.dirname(new URL(import.meta.url).pathname), "task-start.mjs");
}

function runTaskStart(taskStartArgs) {
  const stdout = execSync(
    `node ${JSON.stringify(resolveTaskStartScript())} ${taskStartArgs.map((value) => JSON.stringify(value)).join(" ")} --json`,
    { encoding: "utf8" },
  );
  return JSON.parse(stdout);
}

function buildTaskStartArgsFromBrief(brief) {
  const request = brief.request ?? {
    ask: brief.ask ?? null,
    changed: brief.fromChangedPaths ?? false,
    staged: brief.fromStagedPaths ?? false,
    base: brief.baseRef ?? null,
    paths: brief.paths ?? [],
  };

  const args = [];
  if (request.ask) args.push("--ask", request.ask);
  if (request.changed) args.push("--changed");
  if (request.staged) args.push("--staged");
  if (request.base) args.push("--base", request.base);
  for (const filePath of request.paths ?? []) {
    args.push(filePath);
  }
  return args;
}

function resolveBrief(args) {
  if (args.briefPath && args.taskStartArgs.length > 0) {
    console.error("Use either --brief <path> or task:start arguments, not both.");
    process.exit(1);
  }

  if (args.taskStartArgs.length > 0) {
    return {
      brief: runTaskStart(args.taskStartArgs),
      sourceBrief: TASK_BRIEF_PATH,
      refreshed: true,
      refreshMode: "explicit",
    };
  }

  if (args.briefPath) {
    const briefPath = path.isAbsolute(args.briefPath)
      ? args.briefPath
      : path.join(process.cwd(), args.briefPath);
    if (!fs.existsSync(briefPath)) {
      console.error(`Brief not found: ${args.briefPath}`);
      process.exit(1);
    }
    return {
      brief: JSON.parse(fs.readFileSync(briefPath, "utf8")),
      sourceBrief: normalizePath(path.relative(process.cwd(), briefPath)),
      refreshed: false,
      refreshMode: "disabled",
    };
  }

  const briefPath = path.join(process.cwd(), TASK_BRIEF_PATH);
  if (!fs.existsSync(briefPath)) {
    console.error(`No ${TASK_BRIEF_PATH} found. Run pnpm task:start first.`);
    process.exit(1);
  }

  const existingBrief = readJson(process.cwd(), TASK_BRIEF_PATH);
  if (args.noRefresh) {
    return {
      brief: existingBrief,
      sourceBrief: TASK_BRIEF_PATH,
      refreshed: false,
      refreshMode: "disabled",
    };
  }

  const refreshArgs = buildTaskStartArgsFromBrief(existingBrief);
  if (refreshArgs.length === 0) {
    return {
      brief: existingBrief,
      sourceBrief: TASK_BRIEF_PATH,
      refreshed: false,
      refreshMode: "none",
    };
  }

  return {
    brief: runTaskStart(refreshArgs),
    sourceBrief: TASK_BRIEF_PATH,
    refreshed: true,
    refreshMode: "auto",
  };
}

function runCommand(command) {
  const startedAt = new Date();
  const startedMs = Date.now();
  try {
    const stdout = execSync(command, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: "pipe",
    });
    return {
      command,
      status: "passed",
      exitCode: 0,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedMs,
      stdout,
      stderr: "",
    };
  } catch (error) {
    return {
      command,
      status: "failed",
      exitCode: error.status ?? 1,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedMs,
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? error.message ?? String(error),
    };
  }
}

function summarizeResults(results) {
  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.filter((result) => result.status === "failed").length;
  return {
    total: results.length,
    passed,
    failed,
    status: failed > 0 ? "failed" : "passed",
  };
}

function buildBaselineDescriptor(sourceBrief, report, commands) {
  return {
    sourceBrief,
    commandMode: report.commandMode,
    commands,
    scope: {
      paths: report.scope.paths ?? [],
      matchedTaskRoutes: report.scope.matchedTaskRoutes ?? [],
    },
  };
}

function computeBaselineKey(descriptor) {
  return createHash("sha256")
    .update(JSON.stringify(descriptor))
    .digest("hex")
    .slice(0, 16);
}

function readBaseline(pathname) {
  const fullPath = path.isAbsolute(pathname) ? pathname : path.join(process.cwd(), pathname);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function summarizeBaselineDelta(currentResults, baseline) {
  if (!baseline?.results || !Array.isArray(baseline.results)) {
    return {
      newFailures: 0,
      stillFailing: 0,
      resolved: 0,
      stillPassing: 0,
    };
  }

  const baselineByCommand = new Map(
    baseline.results.map((entry) => [entry.command, entry.status]),
  );

  let newFailures = 0;
  let stillFailing = 0;
  let resolved = 0;
  let stillPassing = 0;

  for (const result of currentResults) {
    const previousStatus = baselineByCommand.get(result.command);
    if (previousStatus === "failed" && result.status === "failed") stillFailing += 1;
    else if (previousStatus === "failed" && result.status === "passed") resolved += 1;
    else if (previousStatus === "passed" && result.status === "failed") newFailures += 1;
    else if (previousStatus === "passed" && result.status === "passed") stillPassing += 1;
  }

  return {
    newFailures,
    stillFailing,
    resolved,
    stillPassing,
  };
}

function trimOutput(value, maxChars = 4000) {
  if (!value) return "";
  return value.length > maxChars ? `${value.slice(0, maxChars)}\n... [truncated]` : value;
}

const args = parseArgs(process.argv.slice(2));
const { brief, sourceBrief, refreshed, refreshMode } = resolveBrief(args);
const commands = unique([
  ...(brief.commands ?? []),
  ...(args.broader ? brief.broaderCommands ?? [] : []),
]);

const results = [];
for (const command of commands) {
  const result = runCommand(command);
  results.push(result);
  if (args.failFast && result.status === "failed") break;
}

const summary = summarizeResults(results);
const commandMode = args.broader ? "focused+broader" : "focused";
const report = {
  generatedAt: new Date().toISOString(),
  sourceBrief,
  artifacts: {
    json: VERIFICATION_REPORT_PATH,
  },
  commandMode,
  refresh: {
    applied: refreshed,
    mode: refreshMode,
  },
  baselineManaged: Boolean(brief.baseline?.managed),
  scope: {
    paths: brief.paths ?? [],
    matchedTaskRoutes: brief.matchedTaskRoutes ?? [],
    matchedEntities: (brief.matchedEntities ?? []).map((entry) => entry.ref),
  },
  summary,
  failures: results.filter((result) => result.status === "failed").map((result) => ({
    command: result.command,
    exitCode: result.exitCode,
    stderr: trimOutput(result.stderr),
  })),
  postVerificationActions: summary.status === "passed" ? brief.actionCommands ?? [] : [],
  nextCommands: summary.status === "passed" ? brief.actionCommands ?? [] : [],
  results,
};

const baselineDescriptor = buildBaselineDescriptor(sourceBrief, report, commands);
const baselineKey = computeBaselineKey(baselineDescriptor);
const baseline = readBaseline(args.baselinePath);
report.baseline = {
  artifact: args.baselinePath,
  available: Boolean(baseline),
  capturedAt: baseline?.capturedAt ?? null,
  key: baselineKey,
  summary: summarizeBaselineDelta(results, baseline),
  commands,
  omittedBaselineCommands: [],
  updated: false,
  recommendedCommand:
    !baseline && report.baselineManaged
      ? "pnpm task:verify --update-baseline"
      : null,
};

if (args.updateBaseline) {
  const payload = {
    capturedAt: new Date().toISOString(),
    key: baselineKey,
    descriptor: baselineDescriptor,
    results: results.map((result) => ({
      command: result.command,
      status: result.status,
      exitCode: result.exitCode,
    })),
  };
  writeJson(process.cwd(), args.baselinePath, payload);
  report.baseline.available = true;
  report.baseline.updated = true;
  report.baseline.capturedAt = payload.capturedAt;
}

writeJson(process.cwd(), VERIFICATION_REPORT_PATH, report);

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const lines = [
    "# Verification Report",
    "",
    `**Status:** ${summary.status}`,
    `**Commands:** ${summary.passed}/${summary.total} passed`,
  ];
  for (const result of results) {
    lines.push(`- [${result.status}] ${result.command}`);
  }
  console.log(lines.join("\n"));
}

if (summary.status === "failed" && !args.allowFailures) {
  process.exit(1);
}
