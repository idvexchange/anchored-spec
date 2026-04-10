#!/usr/bin/env node
/* eslint-env node */
/* global process, console */
import {
  EXECUTION_REPORT_PATH,
  TASK_BRIEF_PATH,
  VERIFICATION_REPORT_PATH,
  fileExists,
  normalizePath,
  readJson,
  unique,
  writeJson,
} from "./harness-lib.mjs";

function parseArgs(argv) {
  const args = {
    json: false,
    briefPath: TASK_BRIEF_PATH,
    reportPath: VERIFICATION_REPORT_PATH,
    outputPath: EXECUTION_REPORT_PATH,
    readPaths: [],
    leafAgents: [],
    crossHints: [],
    commands: [],
    extraCommands: [],
    notes: [],
    scopeDrift: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") {
      args.json = true;
      continue;
    }
    if (value === "--brief") {
      args.briefPath = argv[index + 1] ?? args.briefPath;
      index += 1;
      continue;
    }
    if (value === "--report") {
      args.reportPath = argv[index + 1] ?? args.reportPath;
      index += 1;
      continue;
    }
    if (value === "--output") {
      args.outputPath = argv[index + 1] ?? args.outputPath;
      index += 1;
      continue;
    }
    if (value === "--read") {
      args.readPaths.push(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (value === "--agent") {
      args.leafAgents.push(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (value === "--hint") {
      args.crossHints.push(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (value === "--command") {
      args.commands.push(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (value === "--extra-command") {
      args.extraCommands.push(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (value === "--note") {
      args.notes.push(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (value === "--scope-drift") {
      args.scopeDrift.push(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
  }

  return args;
}

function summarizeCompliance(recommended, observed) {
  const missing = recommended.filter((entry) => !observed.includes(entry));
  return {
    recommended,
    observed,
    missing,
    complete: missing.length === 0,
  };
}

const args = parseArgs(process.argv.slice(2));
if (!fileExists(process.cwd(), args.briefPath)) {
  console.error(`Brief not found: ${args.briefPath}`);
  process.exit(1);
}

const brief = readJson(process.cwd(), args.briefPath);
const report = fileExists(process.cwd(), args.reportPath)
  ? readJson(process.cwd(), args.reportPath)
  : null;

const recommendedCommands = unique([
  ...(brief.commands ?? []),
  ...((report?.commandMode === "focused+broader") ? brief.broaderCommands ?? [] : []),
]);
const observedCommands = unique([
  ...((report?.results ?? []).map((result) => result.command)),
  ...args.commands,
]);
const extraCommands = unique([
  ...args.extraCommands,
  ...observedCommands.filter((command) => !recommendedCommands.includes(command)),
]);

const observedReadPaths = unique(args.readPaths.map((entry) => normalizePath(entry)));
const recommendedReadFirst = unique((brief.readFirst ?? []).map((entry) => normalizePath(entry)));
const recommendedLeafAgents = unique((brief.leafAgents ?? []).map((entry) => normalizePath(entry)));
const recommendedCrossHints = unique((brief.crossHints ?? []).map((entry) => normalizePath(entry)));

const executionReport = {
  generatedAt: new Date().toISOString(),
  sourceBrief: args.briefPath,
  sourceVerificationReport: report ? args.reportPath : null,
  artifacts: {
    json: args.outputPath,
  },
  scope: {
    paths: brief.paths ?? [],
    matchedTaskRoutes: brief.matchedTaskRoutes ?? [],
    matchedCommonRoute: brief.matchedCommonRoute ?? null,
  },
  recommended: {
    readFirst: recommendedReadFirst,
    leafAgents: recommendedLeafAgents,
    crossHints: recommendedCrossHints,
    commands: recommendedCommands,
  },
  observed: {
    readPaths: observedReadPaths,
    leafAgents: unique(args.leafAgents.map((entry) => normalizePath(entry))),
    crossHints: unique(args.crossHints.map((entry) => normalizePath(entry))),
    commands: observedCommands,
  },
  gaps: {
    unreadRecommendedDocs: summarizeCompliance(recommendedReadFirst, observedReadPaths).missing,
    unreadRecommendedLeafAgents: summarizeCompliance(recommendedLeafAgents, unique(args.leafAgents.map((entry) => normalizePath(entry)))).missing,
    unconsideredCrossHints: summarizeCompliance(recommendedCrossHints, unique(args.crossHints.map((entry) => normalizePath(entry)))).missing,
    unobservedRecommendedCommands: summarizeCompliance(recommendedCommands, observedCommands).missing,
    extraCommands,
  },
  compliance: {
    docs: summarizeCompliance(recommendedReadFirst, observedReadPaths).complete,
    leafAgents: summarizeCompliance(recommendedLeafAgents, unique(args.leafAgents.map((entry) => normalizePath(entry)))).complete,
    crossHints: summarizeCompliance(recommendedCrossHints, unique(args.crossHints.map((entry) => normalizePath(entry)))).complete,
    commands: summarizeCompliance(recommendedCommands, observedCommands).complete,
  },
  notes: unique(args.notes),
  scopeDrift: unique(args.scopeDrift),
};

writeJson(process.cwd(), args.outputPath, executionReport);

if (args.json) {
  console.log(JSON.stringify(executionReport, null, 2));
} else {
  console.log(`# Execution Report\n\n**Docs Read:** ${executionReport.observed.readPaths.length}/${executionReport.recommended.readFirst.length}`);
}
