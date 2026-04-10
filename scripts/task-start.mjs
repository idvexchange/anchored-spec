/* eslint-env node */
/* global process, console */
import {
  TASK_BRIEF_PATH,
  VERIFICATION_BASELINE_PATH,
  VERIFICATION_REPORT_PATH,
  EXECUTION_REPORT_PATH,
  buildHarnessContext,
  collectEntityReadFirstPaths,
  buildImpactPlans,
  buildLookupCommands,
  buildPolicyPlans,
  buildRelatedEntities,
  buildVerificationCommands,
  collectGitPaths,
  collectReadFirstDocs,
  fileExists,
  findNearestAgentsFile,
  normalizePath,
  routeAsk,
  routePaths,
  resolvePathEntities,
  unique,
  uniqueBy,
  writeJson,
} from "./harness-lib.mjs";

function parseArgs(argv) {
  const args = {
    ask: null,
    changed: false,
    staged: false,
    base: null,
    json: false,
    paths: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--ask") {
      args.ask = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (value === "--changed") {
      args.changed = true;
      continue;
    }
    if (value === "--staged") {
      args.staged = true;
      continue;
    }
    if (value === "--base") {
      args.base = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (value === "--json") {
      args.json = true;
      continue;
    }
    args.paths.push(value);
  }

  return args;
}

function renderList(title, items) {
  if (items.length === 0) return `${title}\n- none\n`;
  return `${title}\n${items.map((item) => `- ${item}`).join("\n")}\n`;
}

function pathExists(cwd, candidate) {
  return fileExists(cwd, candidate);
}

async function main() {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const context = await buildHarnessContext(cwd);

  let scopePaths = unique(args.paths.map((entry) => normalizePath(entry)));
  if (scopePaths.length === 0 && (args.changed || args.staged || args.base)) {
    scopePaths = collectGitPaths(cwd, args);
  }

  const askRoute = routeAsk(context.policy, args.ask);
  if (scopePaths.length === 0 && askRoute?.defaultPaths?.length) {
    scopePaths = unique(askRoute.defaultPaths.map((entry) => normalizePath(entry)));
  }

  const matchedPathRoutes = routePaths(context.policy, scopePaths);
  const routeEntityRefs = unique([
    ...(askRoute?.entityRefs ?? []),
    ...matchedPathRoutes.flatMap((route) => route.entityRefs ?? []),
  ]);

  const matchedEntities = uniqueBy(
    resolvePathEntities(context, scopePaths, routeEntityRefs),
    (entity) => entity.ref,
  ).sort((a, b) => a.title.localeCompare(b.title));

  const matchedTaskRoutes = unique([
    ...(askRoute ? [askRoute.id] : []),
    ...matchedPathRoutes.map((route) => route.id),
  ]);

  const entityRefs = matchedEntities.map((entity) => entity.ref);
  const entityKinds = matchedEntities.map((entity) => entity.kind);
  const readFirst = unique([
    ...scopePaths.map((filePath) => findNearestAgentsFile(cwd, filePath)).filter(Boolean),
    ...(askRoute?.readFirst ?? []),
    ...matchedPathRoutes.flatMap((route) => route.readFirst ?? []),
    ...collectEntityReadFirstPaths(context, matchedEntities),
    ...collectReadFirstDocs(context.policy, entityRefs, entityKinds, scopePaths),
  ].map((entry) => normalizePath(entry))).filter((entry) => pathExists(cwd, entry));

  const crossHints = unique([
    ...(askRoute?.crossHints ?? []),
    ...matchedPathRoutes.flatMap((route) => route.crossHints ?? []),
  ]).filter((entry) => pathExists(cwd, entry));

  const alsoUpdate = unique([
    ...(askRoute?.alsoUpdate ?? []),
    ...matchedPathRoutes.flatMap((route) => route.alsoUpdate ?? []),
  ]).filter((entry) => pathExists(cwd, entry));

  const leafAgents = unique([
    ...(askRoute?.leafAgents ?? []),
    ...matchedPathRoutes.flatMap((route) => route.leafAgents ?? []),
    ...scopePaths.map((filePath) => findNearestAgentsFile(cwd, filePath)).filter(Boolean),
  ]).filter((entry) => entry.endsWith("AGENTS.md") && pathExists(cwd, entry));

  const policyPlans = buildPolicyPlans(context, matchedEntities);
  const impactPlans = buildImpactPlans(context, matchedEntities);
  const verification = buildVerificationCommands(cwd, scopePaths, matchedTaskRoutes, policyPlans);
  const actionCommands = unique(impactPlans.flatMap((plan) => plan.actionCommands ?? []));
  const suggestions = uniqueBy(
    impactPlans.flatMap((plan) => plan.suggestions ?? []),
    (item) => item.id,
  );
  const repositoryImpact = uniqueBy(
    impactPlans.flatMap((plan) => plan.repositoryImpact?.targets ?? []),
    (item) => `${item.adapterId}:${item.id}`,
  );
  const warnings = unique([
    ...(scopePaths.length === 0 ? ["No explicit path scope resolved; brief was built from route defaults only."] : []),
    ...(matchedEntities.length === 0 ? ["No entities resolved from scope. Use `anchored-spec search <query>` before broad repo scanning."] : []),
    ...(askRoute?.warnings ?? []),
    ...matchedPathRoutes.flatMap((route) => route.warnings ?? []),
  ]);

  const brief = {
    generatedAt: new Date().toISOString(),
    request: {
      ask: args.ask,
      changed: args.changed,
      staged: args.staged,
      base: args.base,
      paths: args.paths.map((entry) => normalizePath(entry)),
    },
    ask: args.ask,
    fromChangedPaths: args.changed,
    fromStagedPaths: args.staged,
    baseRef: args.base,
    paths: scopePaths,
    matchedCommonRoute: askRoute?.id ?? null,
    matchedTaskRoutes,
    matchedEntities,
    relatedEntities: buildRelatedEntities(context, matchedEntities),
    readFirst,
    leafAgents,
    crossHints,
    alsoUpdate,
    lookupCommands: buildLookupCommands(matchedEntities, scopePaths),
    repositoryImpact,
    suggestions,
    commands: verification.commands,
    broaderCommands: verification.broaderCommands,
    actionCommands,
    warnings,
    artifacts: {
      json: TASK_BRIEF_PATH,
      verificationJson: VERIFICATION_REPORT_PATH,
      verificationBaselineJson: VERIFICATION_BASELINE_PATH,
      executionJson: EXECUTION_REPORT_PATH,
    },
    baseline: {
      managed: Boolean(
        askRoute?.baselineManaged ||
        matchedPathRoutes.some((route) => route.baselineManaged === true),
      ),
    },
  };

  writeJson(cwd, TASK_BRIEF_PATH, brief);

  if (args.json) {
    console.log(JSON.stringify(brief, null, 2));
    return;
  }

  const summary = [
    "# Task Brief",
    "",
    `**Paths:** ${scopePaths.length > 0 ? scopePaths.join(", ") : "route defaults only"}`,
    `**Matched Route:** ${askRoute?.id ?? "none"}`,
    renderList("Read First", readFirst),
    renderList("Lookup Commands", brief.lookupCommands),
    renderList("Focused Commands", brief.commands),
    renderList("Broader Commands", brief.broaderCommands),
    renderList("Action Commands", brief.actionCommands),
  ].join("\n");

  console.log(summary);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
