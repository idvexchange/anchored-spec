/**
 * Anchored Spec — Tree-sitter Pattern → Entity Aggregator
 *
 * Aggregates raw query matches from Tree-sitter into meaningful
 * EA entity drafts by grouping, deduplicating, and inferring relations.
 */

import type { BackstageEntity } from "../../backstage/types.js";
import { getSchemaDescriptor } from "../../backstage/kind-mapping.js";
import { getEntityId, getEntityTitle } from "../../backstage/accessors.js";
import type { EntityDraft } from "../../discovery.js";
import type { QueryMatch } from "./types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function kebabCase(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function getDraftDescriptor(schema: string) {
  const descriptor = getSchemaDescriptor(schema);
  if (!descriptor) {
    throw new Error(`Unknown discovery schema "${schema}"`);
  }
  return descriptor;
}

function suggestedIdForSchema(schema: string, slug: string): string {
  return `${getDraftDescriptor(schema).kind.toLowerCase()}:${slug}`;
}

function dirGroupKey(filePath: string): string {
  const parts = filePath.split("/");
  // Use the first two directory levels as grouping key
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/") || "root";
}

function now(): string {
  return new Date().toISOString();
}

function stripQuotes(value: string): string {
  return value.replace(/['"`]/g, "");
}

function collectUniqueCaptureValues(
  matches: QueryMatch[],
  captureNames: string[],
): string[] {
  const values = new Set<string>();

  for (const match of matches) {
    for (const captureName of captureNames) {
      const value = match.captures[captureName];
      if (!value) continue;

      for (const part of value.split(",").map((entry) => stripQuotes(entry.trim()))) {
        if (part) values.add(part);
      }
    }
  }

  return [...values].sort();
}

function makeDraft(
  schema: string,
  slug: string,
  title: string,
  summary: string,
  confidence: "observed" | "inferred",
  options: {
    anchors?: Record<string, string[]>;
    schemaFields?: Record<string, unknown>;
  } = {},
): EntityDraft {
  const descriptor = getDraftDescriptor(schema);
  return {
    suggestedId: suggestedIdForSchema(descriptor.schema, slug),
    apiVersion: descriptor.apiVersion,
    kind: descriptor.kind,
    type: descriptor.specType,
    schema: descriptor.schema,
    title,
    summary,
    status: "draft",
    confidence,
    anchors: options.anchors,
    relations: [],
    discoveredBy: "tree-sitter",
    discoveredAt: now(),
    schemaFields: options.schemaFields,
  };
}

type FrameworkAreaId =
  | "cli"
  | "discovery-engine"
  | "resolver-runtime"
  | "backstage-model-layer"
  | "docs-facts-pipeline"
  | "generator-runtime"
  | "reporting-engine";

type FrameworkAreaDescriptor = {
  id: FrameworkAreaId;
  entityRef: string;
  title: string;
  summary: string;
};

const FRAMEWORK_AREAS: Record<FrameworkAreaId, FrameworkAreaDescriptor> = {
  cli: {
    id: "cli",
    entityRef: "component:anchored-spec-cli",
    title: "Anchored Spec CLI",
    summary: "Top-level command-line interface and command registration surface.",
  },
  "discovery-engine": {
    id: "discovery-engine",
    entityRef: "component:anchored-spec-discovery-engine",
    title: "Anchored Spec Discovery Engine",
    summary: "Core discovery, drift, graph, validation, and orchestration runtime.",
  },
  "resolver-runtime": {
    id: "resolver-runtime",
    entityRef: "component:anchored-spec-resolver-runtime",
    title: "Anchored Spec Resolver Runtime",
    summary: "Resolver execution framework, loader, and discovery adapters.",
  },
  "backstage-model-layer": {
    id: "backstage-model-layer",
    entityRef: "component:anchored-spec-backstage-model-layer",
    title: "Anchored Spec Backstage Model Layer",
    summary: "Entity typing, parsing, writing, and relation mapping over the Backstage model.",
  },
  "docs-facts-pipeline": {
    id: "docs-facts-pipeline",
    entityRef: "component:anchored-spec-docs-facts-pipeline",
    title: "Anchored Spec Docs And Facts Pipeline",
    summary: "Document scanning, fact extraction, and prose-aware discovery pipeline.",
  },
  "generator-runtime": {
    id: "generator-runtime",
    entityRef: "component:anchored-spec-generator-runtime",
    title: "Anchored Spec Generator Runtime",
    summary: "Specification and schema generation runtime for derived outputs.",
  },
  "reporting-engine": {
    id: "reporting-engine",
    entityRef: "component:anchored-spec-reporting-engine",
    title: "Anchored Spec Reporting Engine",
    summary: "Report builders, renderers, and explainability views.",
  },
};

type FrameworkAreaState = {
  files: Set<string>;
  symbols: Set<string>;
  commands: Set<string>;
  reports: Set<string>;
  categories: Set<string>;
};

function makeFrameworkDomainDraft(): EntityDraft {
  return makeDraft(
    "domain",
    "anchored-spec",
    "Anchored Spec",
    "Canonical architecture domain for the anchored-spec framework itself.",
    "observed",
  );
}

function makeFrameworkSystemDraft(): EntityDraft {
  return makeDraft(
    "system",
    "anchored-spec-framework",
    "Anchored Spec Framework",
    "Bounded system that delivers the anchored-spec CLI, discovery runtime, model layer, generators, and reporting.",
    "observed",
    {
      schemaFields: {
        domain: "anchored-spec",
      },
    },
  );
}

function getFrameworkAreaForFile(filePath: string): FrameworkAreaId {
  if (filePath.startsWith("src/cli/")) return "cli";
  if (filePath.startsWith("src/ea/backstage/")) return "backstage-model-layer";
  if (filePath.startsWith("src/ea/docs/") || filePath.startsWith("src/ea/facts/")) {
    return "docs-facts-pipeline";
  }
  if (filePath.startsWith("src/ea/generators/")) return "generator-runtime";
  if (filePath.startsWith("src/ea/resolvers/") || filePath.startsWith("src/resolvers/")) {
    return "resolver-runtime";
  }
  if (filePath === "src/ea/report.ts" || filePath === "src/ea/evidence-renderer.ts") {
    return "reporting-engine";
  }
  return "discovery-engine";
}

function collectFrameworkAreaState(matches: QueryMatch[]): Map<FrameworkAreaId, FrameworkAreaState> {
  const areas = new Map<FrameworkAreaId, FrameworkAreaState>();

  for (const match of matches) {
    const areaId = getFrameworkAreaForFile(match.file);
    const state = areas.get(areaId) ?? {
      files: new Set<string>(),
      symbols: new Set<string>(),
      commands: new Set<string>(),
      reports: new Set<string>(),
      categories: new Set<string>(),
    };

    state.files.add(match.file);
    state.categories.add(match.pattern.category ?? "uncategorized");

    for (const symbolCapture of ["@symbol.name", "@resolver.name", "@generator.name", "@exports.list"]) {
      const value = match.captures[symbolCapture];
      if (!value) continue;
      for (const part of value.split(",").map((entry) => stripQuotes(entry.trim()))) {
        if (part) state.symbols.add(part);
      }
    }

    const commandName = stripQuotes(match.captures["@command.name"] ?? "");
    if (commandName) state.commands.add(commandName);

    const reportName = stripQuotes(match.captures["@report.name"] ?? "");
    if (reportName) state.reports.add(reportName);

    areas.set(areaId, state);
  }

  return areas;
}

function summarizeAreaState(
  descriptor: FrameworkAreaDescriptor,
  state: FrameworkAreaState,
): string {
  const parts: string[] = [
    descriptor.summary,
    `Discovered ${state.files.size} file(s)`,
  ];

  if (state.commands.size > 0) {
    parts.push(`${state.commands.size} command(s)`);
  }
  if (state.reports.size > 0) {
    parts.push(`${state.reports.size} report view(s)`);
  }
  if (state.symbols.size > 0) {
    parts.push(`${state.symbols.size} exported symbol(s)`);
  }

  return parts.join(" ");
}

function makeAreaComponentDraft(
  descriptor: FrameworkAreaDescriptor,
  state: FrameworkAreaState,
): EntityDraft {
  return {
    ...makeDraft(
      "service",
      descriptor.entityRef.replace(/^component:/, ""),
      descriptor.title,
      summarizeAreaState(descriptor, state),
      "observed",
      {
        anchors: {
          files: [...state.files].sort(),
          ...(state.symbols.size > 0 ? { symbols: [...state.symbols].sort() } : {}),
          ...(state.commands.size > 0 ? { commands: [...state.commands].sort() } : {}),
          ...(state.reports.size > 0 ? { reports: [...state.reports].sort() } : {}),
        },
        schemaFields: {
          system: "anchored-spec-framework",
          moduleKind: descriptor.id,
        },
      },
    ),
    suggestedId: descriptor.entityRef,
  };
}

// ─── Route Aggregation ──────────────────────────────────────────────────────────

function aggregateRoutes(matches: QueryMatch[]): EntityDraft[] {
  // Group routes by directory
  const groups = new Map<string, QueryMatch[]>();
  for (const match of matches) {
    const key = dirGroupKey(match.file);
    const existing = groups.get(key) ?? [];
    existing.push(match);
    groups.set(key, existing);
  }

  const drafts: EntityDraft[] = [];

  for (const [dirKey, groupMatches] of groups) {
    // Extract unique route paths
    const routes = new Set<string>();
    const files = new Set<string>();
    const methods = new Set<string>();

    for (const match of groupMatches) {
      const path = match.captures["@route.path"] ?? match.captures["@path"];
      const method = match.captures["@method"] ?? match.captures["@route.method"];
      if (path) routes.add(path.replace(/['"]/g, ""));
      if (method) methods.add(method.toUpperCase());
      files.add(match.file);
    }

    if (routes.size === 0) continue;

    const firstMatch = groupMatches[0]!;
    const slug = kebabCase(dirKey.split("/").pop() ?? "api");
    const descriptor = getDraftDescriptor(firstMatch.pattern.inferredSchema);
    const routeList = [...routes].sort();

    drafts.push({
      suggestedId: suggestedIdForSchema(descriptor.schema, slug),
      apiVersion: descriptor.apiVersion,
      kind: descriptor.kind,
      type: descriptor.specType,
      schema: descriptor.schema,
      title: `${slug} API`,
      summary: `Discovered ${routeList.length} route(s) in ${dirKey}: ${routeList.slice(0, 5).join(", ")}${routeList.length > 5 ? "..." : ""}`,
      status: "draft",
      confidence: "observed",
      anchors: {
        apis: routeList.map((r) => {
          const methodList = [...methods];
          return methodList.length === 1 ? `${methodList[0]} ${r}` : r;
        }),
        files: [...files],
      },
      relations: [],
      discoveredBy: "tree-sitter",
      discoveredAt: now(),
    });
  }

  return drafts;
}

// ─── DB Access Aggregation ──────────────────────────────────────────────────────

function aggregateDbAccess(matches: QueryMatch[]): EntityDraft[] {
  // Group by table/model name
  const groups = new Map<string, QueryMatch[]>();
  for (const match of matches) {
    const table = match.captures["@table"] ?? match.captures["@model"];
    if (!table) continue;
    const key = table.toLowerCase();
    const existing = groups.get(key) ?? [];
    existing.push(match);
    groups.set(key, existing);
  }

  const drafts: EntityDraft[] = [];

  for (const [tableName, groupMatches] of groups) {
    const files = new Set<string>();
    const operations = new Set<string>();

    for (const match of groupMatches) {
      files.add(match.file);
      const op = match.captures["@operation"];
      if (op) operations.add(op);
    }

    const slug = kebabCase(tableName);
    const firstMatch = groupMatches[0]!;
    const descriptor = getDraftDescriptor(firstMatch.pattern.inferredSchema);

    drafts.push({
      suggestedId: suggestedIdForSchema(descriptor.schema, slug),
      apiVersion: descriptor.apiVersion,
      kind: descriptor.kind,
      type: descriptor.specType,
      schema: descriptor.schema,
      title: `${tableName} schema`,
      summary: `Discovered data access to "${tableName}" in ${files.size} file(s). Operations: ${[...operations].join(", ") || "unknown"}`,
      status: "draft",
      confidence: "observed",
      anchors: {
        files: [...files],
      },
      relations: [],
      discoveredBy: "tree-sitter",
      discoveredAt: now(),
      schemaFields: {
        tables: [tableName],
      },
    });
  }

  return drafts;
}

// ─── Event Aggregation ──────────────────────────────────────────────────────────

function aggregateEvents(matches: QueryMatch[]): EntityDraft[] {
  // Group by event name
  const groups = new Map<string, QueryMatch[]>();
  for (const match of matches) {
    const event = match.captures["@event"] ?? match.captures["@event.name"];
    if (!event) continue;
    const key = event.replace(/['"]/g, "");
    const existing = groups.get(key) ?? [];
    existing.push(match);
    groups.set(key, existing);
  }

  const drafts: EntityDraft[] = [];

  for (const [eventName, groupMatches] of groups) {
    const files = new Set<string>();
    for (const match of groupMatches) {
      files.add(match.file);
    }

    const slug = kebabCase(eventName);
    const firstMatch = groupMatches[0]!;
    const descriptor = getDraftDescriptor(firstMatch.pattern.inferredSchema);

    drafts.push({
      suggestedId: suggestedIdForSchema(descriptor.schema, slug),
      apiVersion: descriptor.apiVersion,
      kind: descriptor.kind,
      type: descriptor.specType,
      schema: descriptor.schema,
      title: `${eventName} event`,
      summary: `Discovered event "${eventName}" in ${files.size} file(s)`,
      status: "draft",
      confidence: "observed",
      anchors: {
        events: [eventName],
        files: [...files],
      },
      relations: [],
      discoveredBy: "tree-sitter",
      discoveredAt: now(),
    });
  }

  return drafts;
}

// ─── External Call Aggregation ──────────────────────────────────────────────────

function aggregateExternalCalls(matches: QueryMatch[]): EntityDraft[] {
  // Group by service/URL pattern
  const groups = new Map<string, QueryMatch[]>();
  for (const match of matches) {
    const service = match.captures["@service"] ?? match.captures["@url"];
    if (!service) continue;
    const key = service.replace(/['"]/g, "");
    const existing = groups.get(key) ?? [];
    existing.push(match);
    groups.set(key, existing);
  }

  const drafts: EntityDraft[] = [];

  for (const [serviceName, groupMatches] of groups) {
    const files = new Set<string>();
    for (const match of groupMatches) {
      files.add(match.file);
    }

    const slug = kebabCase(serviceName.replace(/https?:\/\//, "").split("/")[0] ?? serviceName);
    const descriptor = getDraftDescriptor("service");

    drafts.push({
      suggestedId: suggestedIdForSchema(descriptor.schema, slug),
      apiVersion: descriptor.apiVersion,
      kind: descriptor.kind,
      type: descriptor.specType,
      schema: descriptor.schema,
      title: `${serviceName} (external)`,
      summary: `Discovered external service call to "${serviceName}" in ${files.size} file(s)`,
      status: "draft",
      confidence: "inferred",
      anchors: {
        files: [...files],
      },
      relations: [],
      discoveredBy: "tree-sitter",
      discoveredAt: now(),
    });
  }

  return drafts;
}

// ─── Framework-Specific Aggregation ────────────────────────────────────────────

function aggregateCliCommands(matches: QueryMatch[]): EntityDraft[] {
  const groups = new Map<string, QueryMatch[]>();
  for (const match of matches) {
    const commandName = stripQuotes(match.captures["@command.name"] ?? "");
    if (!commandName) continue;
    const existing = groups.get(commandName) ?? [];
    existing.push(match);
    groups.set(commandName, existing);
  }

  const drafts: EntityDraft[] = [];

  for (const [commandName, groupMatches] of groups) {
    const files = collectUniqueCaptureValues(groupMatches, ["@file.path"]);
    if (files.length === 0) {
      files.push(...new Set(groupMatches.map((match) => match.file)));
    }
    const symbols = collectUniqueCaptureValues(groupMatches, ["@symbol.name"]);

    drafts.push(
      {
        ...makeDraft(
          "system-interface",
          `cli-${kebabCase(commandName)}`,
          `${commandName} CLI command`,
          `Discovered CLI command "${commandName}" in ${files.length} file(s)` +
            (symbols.length > 0 ? `. Handlers: ${symbols.join(", ")}` : ""),
          "observed",
          {
            anchors: {
              commands: [commandName],
              files,
              ...(symbols.length > 0 ? { symbols } : {}),
            },
            schemaFields: {
              command: commandName,
              handlers: symbols,
              direction: "inbound",
              ownership: "owned",
              protocol: "custom",
              system: "anchored-spec-framework",
            },
          },
        ),
      },
    );
  }

  return drafts;
}

function aggregateReportViews(matches: QueryMatch[]): EntityDraft[] {
  const groups = new Map<string, QueryMatch[]>();
  for (const match of matches) {
    const reportName = stripQuotes(match.captures["@report.name"] ?? match.captures["@symbol.name"] ?? "");
    if (!reportName) continue;
    const existing = groups.get(reportName) ?? [];
    existing.push(match);
    groups.set(reportName, existing);
  }

  const drafts: EntityDraft[] = [];

  for (const [reportName, groupMatches] of groups) {
    const files = [...new Set(groupMatches.map((match) => match.file))].sort();

    drafts.push(
      {
        ...makeDraft(
          "system-interface",
          `report-${kebabCase(reportName)}`,
          `${reportName} report view`,
          `Discovered report view "${reportName}" in ${files.length} file(s).`,
          "observed",
          {
            anchors: {
              files,
              reports: [reportName],
              symbols: [reportName],
            },
            schemaFields: {
              reportView: reportName,
              direction: "outbound",
              ownership: "owned",
              protocol: "custom",
              system: "anchored-spec-framework",
            },
          },
        ),
      },
    );
  }

  return drafts;
}

function aggregateFrameworkStructure(matches: QueryMatch[]): EntityDraft[] {
  if (matches.length === 0) return [];

  const drafts: EntityDraft[] = [
    makeFrameworkDomainDraft(),
    makeFrameworkSystemDraft(),
  ];
  const areaState = collectFrameworkAreaState(matches);

  for (const [areaId, state] of areaState) {
    drafts.push(makeAreaComponentDraft(FRAMEWORK_AREAS[areaId], state));
  }

  return drafts;
}

// ─── Deduplication ──────────────────────────────────────────────────────────────

function deduplicateAgainstExisting(
  drafts: EntityDraft[],
  existing: BackstageEntity[],
): EntityDraft[] {
  const existingIds = new Set(existing.map((a) => getEntityId(a)));
  const existingTitles = new Set(
    existing.map((a) => getEntityTitle(a).toLowerCase()),
  );

  return drafts.filter((draft) => {
    // Skip if exact ID already exists
    if (existingIds.has(draft.suggestedId)) return false;
    // Skip if title already exists for same kind
    const titleLower = draft.title.toLowerCase();
    if (existingTitles.has(titleLower)) return false;
    return true;
  });
}

// ─── Main Aggregator ────────────────────────────────────────────────────────────

/**
 * Aggregate raw query matches into EA entity drafts.
 *
 * Groups matches by category (route, db-access, event, external-call, and
 * framework-specific code structure categories),
 * then aggregates within each category by file proximity or name,
 * producing deduplicated entity drafts.
 */
export function aggregateMatches(
  matches: QueryMatch[],
  existingEntities: BackstageEntity[],
): EntityDraft[] {
  // Categorize matches
  const routes: QueryMatch[] = [];
  const dbAccess: QueryMatch[] = [];
  const events: QueryMatch[] = [];
  const externalCalls: QueryMatch[] = [];
  const cliCommands: QueryMatch[] = [];
  const resolvers: QueryMatch[] = [];
  const generators: QueryMatch[] = [];
  const frameworkModules: QueryMatch[] = [];
  const reportViews: QueryMatch[] = [];
  const uncategorized: QueryMatch[] = [];

  for (const match of matches) {
    const category = match.pattern.category;
    switch (category) {
      case "route":
        routes.push(match);
        break;
      case "db-access":
        dbAccess.push(match);
        break;
      case "event":
        events.push(match);
        break;
      case "external-call":
        externalCalls.push(match);
        break;
      case "cli-command":
        cliCommands.push(match);
        break;
      case "resolver":
        resolvers.push(match);
        break;
      case "generator":
        generators.push(match);
        break;
      case "framework-module":
        frameworkModules.push(match);
        break;
      case "report-view":
        reportViews.push(match);
        break;
      default:
        uncategorized.push(match);
        break;
    }
  }

  const allDrafts: EntityDraft[] = [
    ...aggregateRoutes(routes),
    ...aggregateDbAccess(dbAccess),
    ...aggregateEvents(events),
    ...aggregateExternalCalls(externalCalls),
    ...aggregateFrameworkStructure([
      ...cliCommands,
      ...resolvers,
      ...generators,
      ...frameworkModules,
      ...reportViews,
    ]),
    ...aggregateCliCommands(cliCommands),
    ...aggregateReportViews(reportViews),
  ];

  // Handle uncategorized matches as generic entities
  for (const match of uncategorized) {
    const title = match.captures["@title"] ?? match.captures["@name"] ?? match.pattern.name;
    const slug = kebabCase(title);
    const descriptor = getDraftDescriptor(match.pattern.inferredSchema);

    allDrafts.push({
      suggestedId: suggestedIdForSchema(descriptor.schema, slug),
      apiVersion: descriptor.apiVersion,
      kind: descriptor.kind,
      type: descriptor.specType,
      schema: descriptor.schema,
      title,
      summary: `Discovered ${match.pattern.name} in ${match.file}:${match.startLine + 1}`,
      status: "draft",
      confidence: "inferred",
      anchors: { files: [match.file] },
      relations: [],
      discoveredBy: "tree-sitter",
      discoveredAt: now(),
    });
  }

  // Deduplicate within results (by suggestedId)
  const seen = new Set<string>();
  const unique = allDrafts.filter((draft) => {
    if (seen.has(draft.suggestedId)) return false;
    seen.add(draft.suggestedId);
    return true;
  });

  // Deduplicate against existing entities
  return deduplicateAgainstExisting(unique, existingEntities);
}
