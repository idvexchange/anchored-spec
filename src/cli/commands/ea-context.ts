/**
 * anchored-spec ea context
 *
 * Assemble a complete AI context package for an entity by following
 * its trace links and relations.  Reads traced documents in full,
 * follows `requires` in frontmatter for transitive context, collects
 * related entity metadata, and respects an optional token budget.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { EaRoot } from "../../ea/loader.js";
import { resolveConfigV1 } from "../../ea/config.js";
import { scanDocs, buildDocIndex } from "../../ea/docs/scanner.js";
import type { ScannedDoc } from "../../ea/docs/scanner.js";
import { parseFrontmatter } from "../../ea/docs/frontmatter.js";
import type { BackstageEntity } from "../../ea/backstage/types.js";
import {
  getEntityAnchors,
  getEntityConfidence,
  getEntityDescription,
  getEntityId,
  getEntityLegacyKind,
  getEntityOwnerRef,
  getEntitySpecRelations,
  getEntityStatus,
  getEntityTags,
  getEntityTraceRefs,
} from "../../ea/backstage/accessors.js";
import { buildEntityLookup, suggestEntities } from "../entity-ref.js";
import { CliError } from "../errors.js";

// ─── Constants ────────────────────────────────────────────────────────

/** Role priority — lower index = higher priority. */
const ROLE_PRIORITY: readonly string[] = [
  "specification",
  "rationale",
  "context",
  "evidence",
  "implementation",
  "test",
];

// ─── Types (internal) ─────────────────────────────────────────────────

interface TracedDoc {
  path: string;
  role: string | undefined;
  content: string;
  tokens: number;
}

interface RequiredDoc {
  path: string;
  content: string;
  tokens: number;
}

interface EntityContextView {
  entityRef: string;
  kind: string;
  status: string;
  summary: string;
  owners: string[];
  tags: string[];
  confidence: "declared" | "observed" | "inferred";
  traceRefs: Array<{ path: string; role?: string }>;
  relations: Array<{ type: string; target: string }>;
  anchors?: Record<string, unknown>;
}

interface RelatedEntityInfo {
  entityRef: string;
  kind: string;
  status: string;
  summary: string;
  owners: string[];
}

interface ContextResult {
  entity: EntityContextView;
  tracedDocs: TracedDoc[];
  requiredDocs: RequiredDoc[];
  relatedEntities: RelatedEntityInfo[];
  additionalRefs: string[];
  tokenEstimate: number;
  truncated: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Returns `true` when `ref` looks like an HTTP(S) URL. */
function isUrl(ref: string): boolean {
  return ref.startsWith("http://") || ref.startsWith("https://");
}

/** Estimate token count from raw text (~4 chars per token). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Return the priority index for a trace-ref role (lower is higher priority). */
function rolePriority(role: string | undefined): number {
  if (!role) return ROLE_PRIORITY.length;
  const idx = ROLE_PRIORITY.indexOf(role);
  return idx === -1 ? ROLE_PRIORITY.length : idx;
}

/**
 * Read a file's content safely.  Returns `undefined` when the file
 * cannot be read.
 */
function safeReadFile(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

// ─── Context assembly ─────────────────────────────────────────────────

/**
 * Collect related artifact IDs by walking relations up to `maxDepth`
 * levels.  Uses a visited set to avoid cycles and excludes the
 * source artifact itself.
 */
function toEntityContextView(entity: BackstageEntity): EntityContextView {
  const entityRef = getEntityId(entity);
  const ownerRef = getEntityOwnerRef(entity);

  return {
    entityRef,
    kind: getEntityLegacyKind(entity),
    status: getEntityStatus(entity),
    summary: getEntityDescription(entity),
    owners: ownerRef ? [ownerRef] : [],
    tags: getEntityTags(entity),
    confidence: getEntityConfidence(entity),
    traceRefs: getEntityTraceRefs(entity),
    relations: getEntitySpecRelations(entity).flatMap((relation) =>
      relation.targets.map((target) => ({
        type: relation.legacyType,
        target,
      })),
    ),
    anchors: getEntityAnchors(entity) as Record<string, unknown> | undefined,
  };
}

function collectRelatedIds(
  sourceId: string,
  entityMap: Map<string, EntityContextView>,
  maxDepth: number,
): string[] {
  const visited = new Set<string>([sourceId]);
  let frontier = [sourceId];

  for (let depth = 0; depth < maxDepth; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      const entity = entityMap.get(id);
      if (!entity) continue;
      for (const rel of entity.relations ?? []) {
        if (!visited.has(rel.target)) {
          visited.add(rel.target);
          next.push(rel.target);
        }
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  visited.delete(sourceId);
  return Array.from(visited);
}

/**
 * Assemble the full context for a single entity.
 */
function assembleContext(
  target: EntityContextView,
  entities: EntityContextView[],
  docs: ScannedDoc[],
  cwd: string,
  maxDepth: number,
): ContextResult {
  const entityMap = new Map<string, EntityContextView>();
  for (const entity of entities) entityMap.set(entity.entityRef, entity);

  // ── 1. Traced documents ───────────────────────────────────────────
  const tracedDocs: TracedDoc[] = [];

  for (const ref of target.traceRefs ?? []) {
    if (isUrl(ref.path)) continue;

    const absPath = resolve(cwd, ref.path);
    const content = safeReadFile(absPath);
    if (content == null) continue;

    // Check frontmatter for a pre-computed token count
    const parsed = parseFrontmatter(content);
    const tokens = parsed.frontmatter.tokens ?? estimateTokens(content);

    tracedDocs.push({ path: ref.path, role: ref.role, content, tokens });
  }

  // Sort by role priority
  tracedDocs.sort((a, b) => rolePriority(a.role) - rolePriority(b.role));

  // ── 2. Transitive required documents ──────────────────────────────
  const requiredDocs: RequiredDoc[] = [];
  const seenRequired = new Set<string>();

  for (const td of tracedDocs) {
    const parsed = parseFrontmatter(td.content);
    for (const reqPath of parsed.frontmatter.requires ?? []) {
      if (seenRequired.has(reqPath)) continue;
      seenRequired.add(reqPath);

      const absPath = resolve(cwd, reqPath);
      const content = safeReadFile(absPath);
      if (content == null) continue;

      const reqParsed = parseFrontmatter(content);
      const tokens = reqParsed.frontmatter.tokens ?? estimateTokens(content);
      requiredDocs.push({ path: reqPath, content, tokens });
    }
  }

  // ── 3. Related entities ───────────────────────────────────────────
  const relatedIds = collectRelatedIds(target.entityRef, entityMap, maxDepth);
  const relatedEntities: RelatedEntityInfo[] = [];

  for (const relatedId of relatedIds) {
    const relatedEntity = entityMap.get(relatedId);
    if (!relatedEntity) continue;
    relatedEntities.push({
      entityRef: relatedEntity.entityRef,
      kind: relatedEntity.kind,
      status: relatedEntity.status,
      summary: relatedEntity.summary,
      owners: relatedEntity.owners,
    });
  }

  // ── 4. Additional doc references (doc frontmatter → entity) ───────
  const docIndex = buildDocIndex(docs);
  const referencingDocs = docIndex.get(target.entityRef) ?? [];
  const tracedPaths = new Set(tracedDocs.map((d) => d.path));
  const additionalRefs: string[] = [];

  for (const doc of referencingDocs) {
    if (!tracedPaths.has(doc.relativePath)) {
      additionalRefs.push(doc.relativePath);
    }
  }

  // ── 5. Token estimate ─────────────────────────────────────────────
  let tokenEstimate = estimateTokens(JSON.stringify(target));
  for (const td of tracedDocs) tokenEstimate += td.tokens;
  for (const rd of requiredDocs) tokenEstimate += rd.tokens;
  for (const relatedEntity of relatedEntities) {
    tokenEstimate += estimateTokens(JSON.stringify(relatedEntity));
  }

  return {
    entity: target,
    tracedDocs,
    requiredDocs,
    relatedEntities,
    additionalRefs,
    tokenEstimate,
    truncated: false,
  };
}

/**
 * Apply token budget constraints.  Includes items in priority order
 * and marks the result as truncated when the budget is exceeded.
 */
function applyTokenBudget(result: ContextResult, maxTokens: number): ContextResult {
  let remaining = maxTokens;

  // Always include the entity spec itself
  remaining -= estimateTokens(JSON.stringify(result.entity));
  if (remaining <= 0) {
    return { ...result, tracedDocs: [], requiredDocs: [], relatedEntities: [], additionalRefs: [], tokenEstimate: maxTokens, truncated: true };
  }

  // Traced docs in priority order (already sorted)
  const keptTraced: TracedDoc[] = [];
  for (const td of result.tracedDocs) {
    if (remaining - td.tokens < 0) break;
    remaining -= td.tokens;
    keptTraced.push(td);
  }
  const tracedTruncated = keptTraced.length < result.tracedDocs.length;

  // Required docs
  const keptRequired: RequiredDoc[] = [];
  for (const rd of result.requiredDocs) {
    if (remaining - rd.tokens < 0) break;
    remaining -= rd.tokens;
    keptRequired.push(rd);
  }
  const requiredTruncated = keptRequired.length < result.requiredDocs.length;

  // Related entities (metadata only — cheap)
  const keptRelated: RelatedEntityInfo[] = [];
  for (const relatedEntity of result.relatedEntities) {
    const cost = estimateTokens(JSON.stringify(relatedEntity));
    if (remaining - cost < 0) break;
    remaining -= cost;
    keptRelated.push(relatedEntity);
  }
  const relatedTruncated = keptRelated.length < result.relatedEntities.length;

  const truncated = tracedTruncated || requiredTruncated || relatedTruncated;
  const tokenEstimate = maxTokens - remaining;

  return {
    ...result,
    tracedDocs: keptTraced,
    requiredDocs: keptRequired,
    relatedEntities: keptRelated,
    tokenEstimate,
    truncated,
  };
}

// ─── Render helpers (human-readable) ──────────────────────────────────

/** Format anchors for display. */
function formatAnchors(entity: EntityContextView): string[] {
  const anchors = entity.anchors as Record<string, string[] | Record<string, string[]> | undefined> | undefined;
  if (!anchors) return [];

  const lines: string[] = [];
  const fields: [string, string[] | undefined][] = [
    ["symbols", anchors.symbols as string[] | undefined],
    ["apis", anchors.apis as string[] | undefined],
    ["events", anchors.events as string[] | undefined],
    ["schemas", anchors.schemas as string[] | undefined],
    ["infra", anchors.infra as string[] | undefined],
    ["catalogRefs", anchors.catalogRefs as string[] | undefined],
    ["iam", anchors.iam as string[] | undefined],
    ["network", anchors.network as string[] | undefined],
  ];

  for (const [name, values] of fields) {
    if (values && values.length > 0) {
      lines.push(`- ${name}: ${values.join(", ")}`);
    }
  }

  if (anchors.other && typeof anchors.other === "object") {
    for (const [name, values] of Object.entries(
      anchors.other as Record<string, string[]>,
    )) {
      if (values && values.length > 0) {
        lines.push(`- ${name}: ${values.join(", ")}`);
      }
    }
  }

  return lines;
}

function renderMarkdown(result: ContextResult): string {
  const { entity, tracedDocs, requiredDocs, relatedEntities, additionalRefs, tokenEstimate, truncated } = result;
  const lines: string[] = [];

  // ── Entity Specification ──────────────────────────────────────────
  lines.push(`# Context: ${entity.entityRef}`);
  lines.push("");
  lines.push("## Entity Specification");
  lines.push(`- ${chalk.bold("Entity Ref")}: ${entity.entityRef}`);
  lines.push(`- ${chalk.bold("Kind")}: ${entity.kind}`);
  lines.push(`- ${chalk.bold("Status")}: ${entity.status}`);
  lines.push(`- ${chalk.bold("Summary")}: ${entity.summary}`);
  lines.push(`- ${chalk.bold("Owners")}: ${entity.owners.join(", ")}`);
  if (entity.tags.length > 0) {
    lines.push(`- ${chalk.bold("Tags")}: ${entity.tags.join(", ")}`);
  }
  lines.push(`- ${chalk.bold("Confidence")}: ${entity.confidence}`);

  // Relations
  const relations = entity.relations ?? [];
  if (relations.length > 0) {
    lines.push("");
    lines.push("### Relations");
    for (const rel of relations) {
      lines.push(`- ${rel.type} → ${rel.target}`);
    }
  }

  // Anchors
  const anchorLines = formatAnchors(entity);
  if (anchorLines.length > 0) {
    lines.push("");
    lines.push("### Anchors");
    lines.push(...anchorLines);
  }

  // ── Traced Documents ──────────────────────────────────────────────
  if (tracedDocs.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Traced Documents");
    for (const td of tracedDocs) {
      const roleTag = td.role ? ` (${td.role})` : "";
      lines.push("");
      lines.push(`### ${td.path}${roleTag}`);
      lines.push(td.content);
    }
  }

  // ── Required Documents (transitive) ───────────────────────────────
  if (requiredDocs.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Required Documents (transitive)");
    for (const rd of requiredDocs) {
      lines.push("");
      lines.push(`### ${rd.path}`);
      lines.push(rd.content);
    }
  }

  // ── Related Entities ──────────────────────────────────────────────
  if (relatedEntities.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Related Entities");
    for (const relatedEntity of relatedEntities) {
      lines.push("");
      lines.push(`### ${relatedEntity.entityRef} (${relatedEntity.kind}, ${relatedEntity.status})`);
      lines.push(`- ${chalk.bold("Summary")}: ${relatedEntity.summary}`);
      lines.push(`- ${chalk.bold("Owners")}: ${relatedEntity.owners.join(", ")}`);
    }
  }

  // ── Additional References ─────────────────────────────────────────
  if (additionalRefs.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Additional References (from doc frontmatter)");
    lines.push("");
    for (const ref of additionalRefs) {
      lines.push(`- ${ref} (references this entity)`);
    }
  }

  // ── Footer ────────────────────────────────────────────────────────
  lines.push("");
  lines.push("---");
  lines.push("");
  const truncNote = truncated ? " (truncated due to token budget)" : "";
  lines.push(`*Context assembled by anchored-spec. Token estimate: ~${tokenEstimate}${truncNote}*`);

  return lines.join("\n");
}

function buildJsonOutput(result: ContextResult): Record<string, unknown> {
  return {
    entity: {
      entityRef: result.entity.entityRef,
      kind: result.entity.kind,
      status: result.entity.status,
      summary: result.entity.summary,
      owners: result.entity.owners,
      tags: result.entity.tags,
      confidence: result.entity.confidence,
    },
    tracedDocs: result.tracedDocs.map((td) => ({
      path: td.path,
      role: td.role,
      content: td.content,
      tokens: td.tokens,
    })),
    requiredDocs: result.requiredDocs.map((rd) => ({
      path: rd.path,
      content: rd.content,
      tokens: rd.tokens,
    })),
    relatedEntities: result.relatedEntities.map((relatedEntity) => ({
      entityRef: relatedEntity.entityRef,
      kind: relatedEntity.kind,
      status: relatedEntity.status,
      summary: relatedEntity.summary,
    })),
    additionalRefs: result.additionalRefs,
    tokenEstimate: result.tokenEstimate,
    truncated: result.truncated,
  };
}

// ─── Command ──────────────────────────────────────────────────────────

export function eaContextCommand(): Command {
  return new Command("context")
    .description("Assemble a complete AI context package for an entity")
    .argument("<entity-ref>", "Entity ref to assemble context for")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--doc-dirs <dirs>", "Comma-separated doc directories to scan", "docs,specs,.")
    .option("--max-tokens <n>", "Maximum estimated tokens for the output")
    .option("--depth <n>", "Maximum depth to follow relations", "1")
    .option("--json", "Output as JSON")
    .action(async (entityInput: string, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError("EA not initialized. Run 'anchored-spec init' first.", 2);
      }

      const loadResult = await root.loadEntities();
      const lookup = buildEntityLookup(loadResult.entities);
      const entities = loadResult.entities.map((entity) => {
        return toEntityContextView(entity);
      });

      // Find target entity
      const resolvedEntity = lookup.byInput.get(entityInput);
      const resolvedId = resolvedEntity ? getEntityId(resolvedEntity) : entityInput;
      const target = entities.find(
        (entity) => entity.entityRef === resolvedId,
      );
      if (!target) {
        const similar = suggestEntities(entityInput, loadResult.entities);
        const hint = similar.length > 0 ? `\n  Did you mean: ${similar.join(", ")}?` : "";
        throw new CliError(`Entity "${entityInput}" not found.${hint}`, 1);
      }

      // Scan docs
      const docDirs = (options.docDirs as string).split(",").map((d: string) => d.trim());
      const normalizedDocs = scanDocs(cwd, { dirs: docDirs }).docs;

      // Depth
      const depth = parseInt(options.depth as string, 10);
      if (Number.isNaN(depth) || depth < 0) {
        throw new CliError("--depth must be a non-negative integer", 1);
      }

      // Assemble context
      let result = assembleContext(target, entities, normalizedDocs, cwd, depth);

      // Apply token budget
      if (options.maxTokens != null) {
        const maxTokens = parseInt(options.maxTokens as string, 10);
        if (Number.isNaN(maxTokens) || maxTokens <= 0) {
          throw new CliError("--max-tokens must be a positive integer", 1);
        }
        result = applyTokenBudget(result, maxTokens);
      }

      // Output
      if (options.json) {
        process.stdout.write(JSON.stringify(buildJsonOutput(result), null, 2) + "\n");
      } else {
        process.stdout.write(renderMarkdown(result) + "\n");
      }
    });
}
