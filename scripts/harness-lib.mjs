/* eslint-env node */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { minimatch } from "minimatch";
import { parse as parseYaml } from "yaml";

import {
  EaRoot,
  buildRelationGraph,
  buildSuggestedCommandPlan,
  createDefaultRegistry,
  loadProjectConfig,
  loadRepositoryEvidenceAdapters,
} from "../dist/index.js";
import {
  getEntityCodeLocation,
  getEntityId,
  getEntityKind,
  getEntitySource,
  getEntityTitle,
  getEntityTraceRefs,
} from "../dist/ea/backstage/accessors.js";
import { scanDocs } from "../dist/ea/docs/scanner.js";
import { resolveFromFiles } from "../dist/ea/reverse-resolution.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const TOOL_ROOT = path.resolve(SCRIPT_DIR, "..");
export const TASK_BRIEF_PATH = ".anchored-spec/task-brief.json";
export const VERIFICATION_REPORT_PATH = ".anchored-spec/verification-report.json";
export const VERIFICATION_BASELINE_PATH = ".anchored-spec/verification-baseline.json";
export const EXECUTION_REPORT_PATH = ".anchored-spec/execution-report.json";

export function normalizePath(filePath) {
  return String(filePath).replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

export function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

export function uniqueBy(items, selector) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = selector(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function fileExists(cwd, relativePath) {
  const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(cwd, relativePath);
  return existsSync(fullPath);
}

export function readJson(cwd, relativePath) {
  const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(cwd, relativePath);
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

export function writeJson(cwd, relativePath, value) {
  const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(cwd, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

export function readYamlIfExists(cwd, relativePath) {
  const fullPath = path.join(cwd, relativePath);
  if (!existsSync(fullPath)) return null;
  return parseYaml(readFileSync(fullPath, "utf8"));
}

export function quoteShellArg(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function matchesAnyGlob(filePath, patterns = []) {
  const normalized = normalizePath(filePath);
  return patterns.some((pattern) => minimatch(normalized, pattern));
}

export function collectGitPaths(cwd, args) {
  const commandArgs = ["diff", "--name-only"];
  if (args.staged) {
    commandArgs.push("--cached");
  } else if (args.base) {
    commandArgs.push(`${args.base}...HEAD`);
  }

  const output = execFileSync("git", commandArgs, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return unique(
    output
      .split(/\r?\n/u)
      .map((entry) => normalizePath(entry))
      .filter(Boolean),
  );
}

export async function buildHarnessContext(cwd) {
  const config = loadProjectConfig(cwd);
  const root = new EaRoot(cwd, config);
  const loaded = await root.loadEntities();
  const docs = scanDocs(cwd, { dirs: config.docs?.scanDirs ?? ["docs"] }).docs;
  const graph = buildRelationGraph(loaded.entities, createDefaultRegistry());
  const entityByRef = new Map(loaded.entities.map((entity) => [getEntityId(entity), entity]));
  const policy = root.loadPolicy();
  const adapters = await loadRepositoryEvidenceAdapters(config, cwd);

  return {
    config,
    root,
    entities: loaded.entities,
    docs,
    graph,
    entityByRef,
    policy,
    adapters,
  };
}

function getHarnessExtensions(policy) {
  if (!policy || typeof policy !== "object") return {};
  const extensions = policy.extensions;
  if (!extensions || typeof extensions !== "object" || Array.isArray(extensions)) return {};
  const harness = extensions.harness;
  if (!harness || typeof harness !== "object" || Array.isArray(harness)) return {};
  return harness;
}

export function getPathRoutes(policy) {
  const raw = getHarnessExtensions(policy).pathRoutes;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((route) => route && typeof route === "object" && typeof route.id === "string" && Array.isArray(route.include))
    .map((route) => ({
      id: route.id,
      include: route.include,
      entityRefs: Array.isArray(route.entityRefs) ? route.entityRefs : [],
      readFirst: Array.isArray(route.readFirst) ? route.readFirst : [],
      crossHints: Array.isArray(route.crossHints) ? route.crossHints : [],
      alsoUpdate: Array.isArray(route.alsoUpdate) ? route.alsoUpdate : [],
      leafAgents: Array.isArray(route.leafAgents) ? route.leafAgents : [],
      warnings: Array.isArray(route.warnings) ? route.warnings : [],
      baselineManaged: route.baselineManaged === true,
    }));
}

export function getCommonRequestRoutes(policy) {
  const raw = getHarnessExtensions(policy).commonRequestRouting;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((route) => route && typeof route === "object" && typeof route.id === "string")
    .map((route) => ({
      id: route.id,
      matchSignals: Array.isArray(route.matchSignals) ? route.matchSignals : [],
      strongSignals: Array.isArray(route.strongSignals) ? route.strongSignals : [],
      negativeSignals: Array.isArray(route.negativeSignals) ? route.negativeSignals : [],
      defaultPaths: Array.isArray(route.defaultPaths) ? route.defaultPaths : [],
      entityRefs: Array.isArray(route.entityRefs) ? route.entityRefs : [],
      readFirst: Array.isArray(route.readFirst) ? route.readFirst : [],
      crossHints: Array.isArray(route.crossHints) ? route.crossHints : [],
      alsoUpdate: Array.isArray(route.alsoUpdate) ? route.alsoUpdate : [],
      leafAgents: Array.isArray(route.leafAgents) ? route.leafAgents : [],
      warnings: Array.isArray(route.warnings) ? route.warnings : [],
      baselineManaged: route.baselineManaged === true,
    }));
}

export function routeAsk(policy, ask) {
  const normalizedAsk = String(ask ?? "").toLowerCase();
  if (!normalizedAsk) return null;

  let bestRoute = null;
  let bestScore = 0;

  for (const route of getCommonRequestRoutes(policy)) {
    if (route.negativeSignals.some((signal) => normalizedAsk.includes(String(signal).toLowerCase()))) {
      continue;
    }

    let score = 0;
    for (const signal of route.matchSignals) {
      if (normalizedAsk.includes(String(signal).toLowerCase())) score += 1;
    }
    for (const signal of route.strongSignals) {
      if (normalizedAsk.includes(String(signal).toLowerCase())) score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestRoute = route;
    }
  }

  return bestScore > 0 ? bestRoute : null;
}

export function routePaths(policy, paths) {
  const normalized = paths.map((entry) => normalizePath(entry));
  return getPathRoutes(policy).filter((route) => normalized.some((filePath) => matchesAnyGlob(filePath, route.include)));
}

export function findNearestAgentsFile(cwd, filePath) {
  let current = path.dirname(path.join(cwd, filePath));
  const root = cwd;

  while (current.startsWith(root)) {
    const candidate = path.join(current, "AGENTS.md");
    if (existsSync(candidate)) {
      return normalizePath(path.relative(cwd, candidate));
    }
    if (current === root) break;
    current = path.dirname(current);
  }

  return existsSync(path.join(cwd, "AGENTS.md")) ? "AGENTS.md" : null;
}

export function collectReadFirstDocs(policy, entityRefs, entityKinds, focusPaths) {
  const readFirstRules = Array.isArray(policy?.readFirstRules) ? policy.readFirstRules : [];
  const docs = [];
  for (const rule of readFirstRules) {
    if (!rule || typeof rule !== "object" || typeof rule.id !== "string" || !Array.isArray(rule.docs)) {
      continue;
    }

    if (Array.isArray(rule.entityRefs) && rule.entityRefs.length > 0 && !rule.entityRefs.some((ref) => entityRefs.includes(ref))) {
      continue;
    }

    if (Array.isArray(rule.entityKinds) && rule.entityKinds.length > 0 && !rule.entityKinds.some((kind) => entityKinds.includes(kind))) {
      continue;
    }

    if (Array.isArray(rule.pathMatches) && rule.pathMatches.length > 0) {
      if (!focusPaths.some((filePath) => matchesAnyGlob(filePath, rule.pathMatches))) continue;
    }

    for (const filePath of [...rule.docs, ...(Array.isArray(rule.secondaryDocs) ? rule.secondaryDocs : [])]) {
      docs.push(normalizePath(filePath));
    }
  }
  return unique(docs);
}

export function resolvePathEntities(context, paths, routeEntityRefs = []) {
  const resolutions = resolveFromFiles(paths, context.entities, context.docs, context.root.projectRoot);
  const refs = unique([
    ...routeEntityRefs,
    ...resolutions.map((entry) => entry.resolvedEntityRef),
  ]);

  return uniqueBy(
    refs
      .map((ref) => context.entityByRef.get(ref))
      .filter(Boolean)
      .map((entity) => ({
        ref: getEntityId(entity),
        title: getEntityTitle(entity),
        kind: getEntityKind(entity),
        codeLocation: getEntityCodeLocation(entity) ?? null,
        source: getEntitySource(entity) ?? null,
      })),
    (entity) => entity.ref,
  );
}

export function collectEntityReadFirstPaths(context, matchedEntities) {
  return unique(
    matchedEntities.flatMap((entry) => {
      const entity = context.entityByRef.get(entry.ref);
      if (!entity) return [];
      return [
        getEntitySource(entity),
        ...getEntityTraceRefs(entity).map((traceRef) => traceRef.path),
      ].filter(Boolean).map((filePath) => normalizePath(filePath));
    }),
  );
}

export function buildRelatedEntities(context, matchedEntities) {
  return matchedEntities.map((entry) => {
    const directDependencies = context.graph
      .outgoing(entry.ref)
      .filter((edge) => !edge.isVirtual)
      .map((edge) => context.entityByRef.get(edge.target))
      .filter(Boolean)
      .map((entity) => ({ ref: getEntityId(entity), title: getEntityTitle(entity) }));

    const directDependents = context.graph
      .incoming(entry.ref)
      .filter((edge) => !edge.isVirtual)
      .map((edge) => context.entityByRef.get(edge.source))
      .filter(Boolean)
      .map((entity) => ({ ref: getEntityId(entity), title: getEntityTitle(entity) }));

    return {
      ref: entry.ref,
      title: entry.title,
      directDependencies: uniqueBy(directDependencies, (item) => item.ref).sort((a, b) => a.title.localeCompare(b.title)),
      directDependents: uniqueBy(directDependents, (item) => item.ref).sort((a, b) => a.title.localeCompare(b.title)),
    };
  });
}

export function buildLookupCommands(matchedEntities, focusPaths) {
  const focusPath = focusPaths[0];
  return matchedEntities.flatMap((entity) => [
    `pnpm exec anchored-spec trace ${entity.ref}`,
    `pnpm exec anchored-spec context ${entity.ref} --tier llm${focusPath ? ` --focus-path ${quoteShellArg(focusPath)}` : ""}`,
  ]);
}

function existingPaths(cwd, paths) {
  return paths.filter((filePath) => existsSync(path.join(cwd, filePath)));
}

function resolveModuleCandidates(baseFilePath, specifier) {
  const sourceDir = path.posix.dirname(baseFilePath);
  const normalizedBase = path.posix.normalize(path.posix.join(sourceDir, specifier));
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
  const ext = path.posix.extname(normalizedBase);

  if (ext) {
    if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
      const withoutExt = normalizedBase.slice(0, -ext.length);
      return unique([
        normalizedBase,
        `${withoutExt}.ts`,
        `${withoutExt}.tsx`,
        `${withoutExt}.mts`,
        `${withoutExt}.cts`,
      ]);
    }
    return [normalizedBase];
  }

  return unique([
    ...extensions.map((extension) => `${normalizedBase}${extension}`),
    ...extensions.map((extension) => `${normalizedBase}/index${extension}`),
  ]);
}

function readLocalImportPaths(cwd, filePath) {
  const fullPath = path.join(cwd, filePath);
  if (!existsSync(fullPath) || statSync(fullPath).isDirectory()) return [];
  const source = readFileSync(fullPath, "utf8");
  const importPatterns = [
    /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]/gu,
    /\bexport\s+(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]/gu,
  ];

  const specifiers = [];
  for (const pattern of importPatterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.push(match[1]);
    }
  }

  return existingPaths(
    cwd,
    unique(specifiers.flatMap((specifier) => resolveModuleCandidates(filePath, specifier))),
  );
}

function buildTestCandidates(cwd, filePath) {
  if (!filePath.startsWith("src/") && !filePath.startsWith("scripts/")) return [];
  if (/\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/u.test(filePath)) return [filePath];

  const directory = path.posix.dirname(filePath);
  const ext = path.posix.extname(filePath);
  const withoutExt = filePath.slice(0, -ext.length);
  const baseName = path.posix.basename(withoutExt);
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
  const candidates = [];

  for (const suffix of [".test", ".spec"]) {
    for (const candidateExt of extensions) {
      candidates.push(`${withoutExt}${suffix}${candidateExt}`);
      candidates.push(`${directory}/__tests__/${baseName}${suffix}${candidateExt}`);
      if (filePath.startsWith("src/")) {
        const parentDir = path.posix.dirname(directory);
        candidates.push(`${parentDir}/__tests__/${baseName}${suffix}${candidateExt}`);
      }
    }
  }

  return existingPaths(cwd, unique(candidates));
}

export function buildFocusedTestCommand(cwd, scopePaths) {
  const searchPaths = unique([
    ...scopePaths,
    ...scopePaths.flatMap((filePath) => readLocalImportPaths(cwd, filePath)),
  ]);
  const tests = unique(searchPaths.flatMap((filePath) => buildTestCandidates(cwd, filePath))).slice(0, 8);
  if (tests.length === 0) return null;
  return `pnpm exec vitest run ${tests.map((filePath) => quoteShellArg(filePath)).join(" ")}`;
}

export function buildVerificationCommands(cwd, scopePaths, matchedRouteIds, policyPlans = []) {
  const commands = [];
  const broaderCommands = [];
  const normalizedPaths = scopePaths.map((filePath) => normalizePath(filePath));

  const touchesCode = normalizedPaths.some((filePath) =>
    /^(src|scripts)\//u.test(filePath) || /\.(?:[cm]?[jt]sx?)$/u.test(filePath),
  );
  const touchesArchitecture = normalizedPaths.some((filePath) =>
    filePath === "catalog-info.yaml" ||
    filePath === ".anchored-spec/config.json" ||
    filePath === ".anchored-spec/policy.json" ||
    filePath.startsWith("docs/") ||
    [
      "AGENTS.md",
      "docs/workflows/agent-guide.md",
    ].includes(filePath),
  );
  const touchesHarness = normalizedPaths.some((filePath) =>
    filePath.startsWith("scripts/") ||
    filePath === ".anchored-spec/policy.json" ||
    filePath === "docs/AGENTS.md" ||
    filePath === "docs/workflows/repository-harness.md" ||
    [
      "AGENTS.md",
      "docs/workflows/agent-guide.md",
      "package.json",
      ".gitignore",
    ].includes(filePath),
  ) || matchedRouteIds.includes("repository-harness");

  if (touchesCode) {
    commands.push("pnpm exec tsc --noEmit");
    const testCommand = buildFocusedTestCommand(cwd, normalizedPaths);
    if (testCommand) commands.push(testCommand);
    broaderCommands.push("pnpm run lint");
    broaderCommands.push("pnpm run build");
    broaderCommands.push("pnpm run test");
  }

  if (touchesArchitecture) {
    commands.push("pnpm exec anchored-spec validate");
    commands.push("pnpm exec anchored-spec trace --summary");
    broaderCommands.push("pnpm exec anchored-spec drift");
  }

  if (touchesHarness) {
    commands.push("pnpm run task:check");
    broaderCommands.push("pnpm run test:harness");
  }

  for (const plan of policyPlans) {
    for (const command of plan.actionCommands ?? []) {
      // Action commands are intentionally not part of default verify.
      void command;
    }
  }

  return {
    commands: unique(commands),
    broaderCommands: unique(broaderCommands.filter((command) => !commands.includes(command))),
  };
}

export function buildPolicyPlans(context, matchedEntities) {
  return matchedEntities.map((entity) => {
    const report = {
      sourceRef: entity.ref,
      sourceTitle: entity.title,
      sourceKind: "Component",
      sourceSchema: "application",
      impacted: [],
      totalImpacted: 0,
      maxDepth: 0,
      byDomain: [],
      byCategory: [],
    };
    return buildSuggestedCommandPlan(report, context.entities, context.root.projectRoot, context.policy, {
      adapters: context.adapters,
    });
  });
}

export function buildImpactPlans(context, matchedEntities) {
  return matchedEntities.map((entity) => {
    const report = {
      sourceRef: entity.ref,
      sourceTitle: entity.title,
      sourceKind: "Component",
      sourceSchema: "application",
      impacted: Array.from(context.graph.traverseWithPaths(entity.ref, { direction: "incoming", maxDepth: 2 }).values()).map((entry) => ({
        id: entry.node.id,
        kind: entry.node.kind,
        schema: entry.node.schema,
        domain: entry.node.domain,
        title: entry.node.title,
        depth: entry.depth,
        viaRelations: entry.path.map((edge) => edge.type),
        score: 0,
        scoreBreakdown: {
          distance: 0,
          edgeType: 0,
          confidence: 0,
          canonicality: 0,
          directionality: 0,
          changeType: 0,
        },
        category: "code",
        confidence: entry.node.confidence,
      })),
      totalImpacted: 0,
      maxDepth: 0,
      byDomain: [],
      byCategory: [],
    };
    report.totalImpacted = report.impacted.length;
    report.maxDepth = report.impacted.reduce((max, entry) => Math.max(max, entry.depth), 0);
    return buildSuggestedCommandPlan(report, context.entities, context.root.projectRoot, context.policy, {
      adapters: context.adapters,
    });
  });
}
