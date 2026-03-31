/**
 * Anchored Spec — Tree-sitter Pattern → Artifact Aggregator
 *
 * Aggregates raw query matches from Tree-sitter into meaningful
 * EA artifact drafts by grouping, deduplicating, and inferring relations.
 */

import type { BackstageEntity } from "../../backstage/types.js";
import { getEntityId, getEntityTitle } from "../../backstage/accessors.js";
import type { EaArtifactDraft } from "../../discovery.js";
import type { QueryMatch } from "./types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function kebabCase(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function prefixForKind(kind: string): string {
  const map: Record<string, string> = {
    "api-contract": "API",
    "physical-schema": "SCHEMA",
    "event-contract": "EVT",
    service: "SVC",
    application: "APP",
    "data-store": "DS",
  };
  return map[kind] ?? kind.split("-").map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function dirGroupKey(filePath: string): string {
  const parts = filePath.split("/");
  // Use the first two directory levels as grouping key
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/") || "root";
}

function now(): string {
  return new Date().toISOString();
}

// ─── Route Aggregation ──────────────────────────────────────────────────────────

function aggregateRoutes(matches: QueryMatch[]): EaArtifactDraft[] {
  // Group routes by directory
  const groups = new Map<string, QueryMatch[]>();
  for (const match of matches) {
    const key = dirGroupKey(match.file);
    const existing = groups.get(key) ?? [];
    existing.push(match);
    groups.set(key, existing);
  }

  const drafts: EaArtifactDraft[] = [];

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
    const prefix = prefixForKind(firstMatch.pattern.inferredKind);
    const routeList = [...routes].sort();

    drafts.push({
      suggestedId: `${prefix}-${slug}`,
      kind: firstMatch.pattern.inferredKind,
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

function aggregateDbAccess(matches: QueryMatch[]): EaArtifactDraft[] {
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

  const drafts: EaArtifactDraft[] = [];

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
    const prefix = prefixForKind(firstMatch.pattern.inferredKind);

    drafts.push({
      suggestedId: `${prefix}-${slug}`,
      kind: firstMatch.pattern.inferredKind,
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
      kindSpecificFields: {
        tables: [tableName],
      },
    });
  }

  return drafts;
}

// ─── Event Aggregation ──────────────────────────────────────────────────────────

function aggregateEvents(matches: QueryMatch[]): EaArtifactDraft[] {
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

  const drafts: EaArtifactDraft[] = [];

  for (const [eventName, groupMatches] of groups) {
    const files = new Set<string>();
    for (const match of groupMatches) {
      files.add(match.file);
    }

    const slug = kebabCase(eventName);
    const firstMatch = groupMatches[0]!;
    const prefix = prefixForKind(firstMatch.pattern.inferredKind);

    drafts.push({
      suggestedId: `${prefix}-${slug}`,
      kind: firstMatch.pattern.inferredKind,
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

function aggregateExternalCalls(matches: QueryMatch[]): EaArtifactDraft[] {
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

  const drafts: EaArtifactDraft[] = [];

  for (const [serviceName, groupMatches] of groups) {
    const files = new Set<string>();
    for (const match of groupMatches) {
      files.add(match.file);
    }

    const slug = kebabCase(serviceName.replace(/https?:\/\//, "").split("/")[0] ?? serviceName);
    const prefix = prefixForKind("service");

    drafts.push({
      suggestedId: `${prefix}-${slug}`,
      kind: "service",
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

// ─── Deduplication ──────────────────────────────────────────────────────────────

function deduplicateAgainstExisting(
  drafts: EaArtifactDraft[],
  existing: BackstageEntity[],
): EaArtifactDraft[] {
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
 * Aggregate raw query matches into EA artifact drafts.
 *
 * Groups matches by category (route, db-access, event, external-call),
 * then aggregates within each category by file proximity or name,
 * producing deduplicated artifact drafts.
 */
export function aggregateMatches(
  matches: QueryMatch[],
  existingArtifacts: BackstageEntity[],
): EaArtifactDraft[] {
  // Categorize matches
  const routes: QueryMatch[] = [];
  const dbAccess: QueryMatch[] = [];
  const events: QueryMatch[] = [];
  const externalCalls: QueryMatch[] = [];
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
      default:
        uncategorized.push(match);
        break;
    }
  }

  const allDrafts: EaArtifactDraft[] = [
    ...aggregateRoutes(routes),
    ...aggregateDbAccess(dbAccess),
    ...aggregateEvents(events),
    ...aggregateExternalCalls(externalCalls),
  ];

  // Handle uncategorized matches as generic artifacts
  for (const match of uncategorized) {
    const title = match.captures["@title"] ?? match.captures["@name"] ?? match.pattern.name;
    const slug = kebabCase(title);
    const prefix = prefixForKind(match.pattern.inferredKind);

    allDrafts.push({
      suggestedId: `${prefix}-${slug}`,
      kind: match.pattern.inferredKind,
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

  // Deduplicate against existing artifacts
  return deduplicateAgainstExisting(unique, existingArtifacts);
}
