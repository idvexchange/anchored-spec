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
import { minimatch } from "minimatch";
import { EaRoot } from "../../ea/loader.js";
import {
  loadProjectConfig,
  getConfiguredDocScanDirs,
} from "../../ea/config.js";
import { scanDocs, buildDocIndex } from "../../ea/docs/scanner.js";
import type { ScannedDoc } from "../../ea/docs/scanner.js";
import { parseFrontmatter } from "../../ea/docs/frontmatter.js";
import type { BackstageEntity } from "../../ea/backstage/types.js";
import {
  getEntityAnchors,
  getEntityConfidence,
  getEntityDescription,
  getEntityId,
  getEntityKind,
  getEntitySchema,
  getEntityOwnerRef,
  getEntitySpecType,
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

// ─── Tier Presets ─────────────────────────────────────────────────────

type ContextTier = "brief" | "standard" | "deep" | "llm";

interface TierPreset {
  depth: number;
  maxTokens: number | undefined;
  maxTracedDocs: number | undefined;
  includeConstraintBrief: boolean;
  includeChangeRisks: boolean;
  preferCanonical: boolean;
}

const TIER_PRESETS: Record<ContextTier, TierPreset> = {
  brief: {
    depth: 0,
    maxTokens: 2000,
    maxTracedDocs: 3,
    includeConstraintBrief: false,
    includeChangeRisks: false,
    preferCanonical: false,
  },
  standard: {
    depth: 1,
    maxTokens: 8000,
    maxTracedDocs: undefined,
    includeConstraintBrief: true,
    includeChangeRisks: false,
    preferCanonical: false,
  },
  deep: {
    depth: 3,
    maxTokens: undefined,
    maxTracedDocs: undefined,
    includeConstraintBrief: true,
    includeChangeRisks: true,
    preferCanonical: false,
  },
  llm: {
    depth: 2,
    maxTokens: 8000,
    maxTracedDocs: undefined,
    includeConstraintBrief: true,
    includeChangeRisks: true,
    preferCanonical: true,
  },
};

// ─── Types (internal) ─────────────────────────────────────────────────

interface TracedDoc {
  path: string;
  role: string | undefined;
  content: string;
  tokens: number;
  inclusionReason?: string;
  isCanonical?: boolean;
  isDerived?: boolean;
  derivedFrom?: string;
}

interface RequiredDoc {
  path: string;
  content: string;
  tokens: number;
  inclusionReason?: string;
}

interface EntityContextView {
  entityRef: string;
  kind: string;
  type?: string;
  schema: string;
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
  type?: string;
  schema: string;
  status: string;
  summary: string;
  owners: string[];
  inclusionReason?: string;
}

interface ConstraintEntry {
  entityRef: string;
  kind: string;
  title: string;
  description: string;
  depth: number;
  inclusionReason: string;
}

interface ChangeRisk {
  type: "drift" | "deprecated-relation";
  description: string;
}

interface ContextResult {
  entity: EntityContextView;
  tracedDocs: TracedDoc[];
  requiredDocs: RequiredDoc[];
  relatedEntities: RelatedEntityInfo[];
  additionalRefs: string[];
  constraints: ConstraintEntry[];
  changeRisks: ChangeRisk[];
  tokenEstimate: number;
  truncated: boolean;
  tier?: ContextTier;
}

interface AssembleOptions {
  maxDepth: number;
  maxTracedDocs?: number;
  includeConstraintBrief?: boolean;
  includeChangeRisks?: boolean;
  preferCanonical?: boolean;
  whyIncluded?: boolean;
  focusPath?: string;
  workflowPolicy?: Record<string, unknown> | null;
}

interface ReadFirstRule {
  id: string;
  entityRefs?: string[];
  entityKinds?: string[];
  pathMatches?: string[];
  docs: string[];
  secondaryDocs?: string[];
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

/** Check for @anchored-spec:canonical or @anchored-spec:derived markers in content. */
function detectDocumentMarkers(content: string): { isCanonical: boolean; isDerived: boolean; derivedFrom?: string } {
  const canonicalRe = /<!--\s*@anchored-spec:canonical\s*-->/;
  const derivedRe = /<!--\s*@anchored-spec:derived\s+source="([^"]+)"\s*-->/;

  const isCanonical = canonicalRe.test(content);
  const derivedMatch = content.match(derivedRe);

  return {
    isCanonical,
    isDerived: !!derivedMatch,
    derivedFrom: derivedMatch?.[1],
  };
}

/** Apply canonical preference: replace derived docs with reference lines when canonical is present. */
function applyCanonicalPreference(tracedDocs: TracedDoc[]): TracedDoc[] {
  const canonicalPaths = new Set<string>();

  for (const doc of tracedDocs) {
    if (doc.isCanonical) canonicalPaths.add(doc.path);
  }

  return tracedDocs.map((doc) => {
    if (doc.isDerived && doc.derivedFrom && canonicalPaths.has(doc.derivedFrom)) {
      const refLine = `> See also: ${doc.path} (derived from ${doc.derivedFrom})`;
      return {
        ...doc,
        content: refLine,
        tokens: estimateTokens(refLine),
        inclusionReason: doc.inclusionReason
          ? `${doc.inclusionReason} [reduced: canonical source "${doc.derivedFrom}" preferred]`
          : `Derived doc reduced: canonical source "${doc.derivedFrom}" preferred`,
      };
    }
    return doc;
  });
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
    kind: getEntityKind(entity),
    type: getEntitySpecType(entity),
    schema: getEntitySchema(entity),
    status: getEntityStatus(entity),
    summary: getEntityDescription(entity),
    owners: ownerRef ? [ownerRef] : [],
    tags: getEntityTags(entity),
    confidence: getEntityConfidence(entity),
    traceRefs: getEntityTraceRefs(entity),
    relations: getEntitySpecRelations(entity).flatMap((relation) =>
      relation.targets.map((target) => ({
        type: relation.type,
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
  options: AssembleOptions,
): ContextResult {
  const entityMap = new Map<string, EntityContextView>();
  for (const entity of entities) entityMap.set(entity.entityRef, entity);

  const { maxDepth, maxTracedDocs, includeConstraintBrief, includeChangeRisks, preferCanonical, whyIncluded } = options;

  // ── 1. Traced documents ───────────────────────────────────────────
  let tracedDocs: TracedDoc[] = [];

  for (const ref of target.traceRefs ?? []) {
    if (isUrl(ref.path)) continue;

    const absPath = resolve(cwd, ref.path);
    const content = safeReadFile(absPath);
    if (content == null) continue;

    const parsed = parseFrontmatter(content);
    const tokens = parsed.frontmatter.tokens ?? estimateTokens(content);

    const markers = preferCanonical ? detectDocumentMarkers(content) : undefined;
    const priorityIdx = rolePriority(ref.role);

    tracedDocs.push({
      path: ref.path,
      role: ref.role,
      content,
      tokens,
      ...(whyIncluded ? {
        inclusionReason: `direct traceRef with role "${ref.role ?? "none"}" (priority: ${priorityIdx + 1}/${ROLE_PRIORITY.length + 1})`,
      } : {}),
      ...(markers ? {
        isCanonical: markers.isCanonical,
        isDerived: markers.isDerived,
        derivedFrom: markers.derivedFrom,
      } : {}),
    });
  }

  // Sort by role priority
  tracedDocs.sort((a, b) => rolePriority(a.role) - rolePriority(b.role));

  // Apply canonical preference before limiting
  if (preferCanonical) {
    tracedDocs = applyCanonicalPreference(tracedDocs);
  }

  // Limit traced docs if maxTracedDocs is set
  if (maxTracedDocs != null && tracedDocs.length > maxTracedDocs) {
    tracedDocs = tracedDocs.slice(0, maxTracedDocs);
  }

  // ── 2. Transitive required documents ──────────────────────────────
  const requiredDocs: RequiredDoc[] = [];
  const seenRequired = new Set<string>();

  for (const doc of resolvePolicyReadFirstDocs(target, options.workflowPolicy, options.focusPath)) {
    if (seenRequired.has(doc.path)) continue;
    seenRequired.add(doc.path);

    const absPath = resolve(cwd, doc.path);
    const content = safeReadFile(absPath);
    if (content == null) continue;

    requiredDocs.push({
      path: doc.path,
      content,
      tokens: estimateTokens(content),
      ...(whyIncluded ? {
        inclusionReason: `workflow policy read-first rule "${doc.ruleId}" matched${options.focusPath ? ` focus path "${options.focusPath}"` : ""}`,
      } : {}),
    });
  }

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
      requiredDocs.push({
        path: reqPath,
        content,
        tokens,
        ...(whyIncluded ? {
          inclusionReason: `transitive via requires frontmatter in ${td.path}`,
        } : {}),
      });
    }
  }

  // ── 3. Related entities ───────────────────────────────────────────
  const relatedIds = collectRelatedIds(target.entityRef, entityMap, maxDepth);
  const relatedEntities: RelatedEntityInfo[] = [];

  for (const relatedId of relatedIds) {
    const relatedEntity = entityMap.get(relatedId);
    if (!relatedEntity) continue;

    // Determine how this entity is related for inclusion reason
    let inclusionReason: string | undefined;
    if (whyIncluded) {
      const directRel = target.relations.find((r) => r.target === relatedId);
      if (directRel) {
        inclusionReason = `1-hop ${directRel.type} relation from ${target.entityRef}`;
      } else {
        inclusionReason = `multi-hop relation from ${target.entityRef} (within ${maxDepth} hops)`;
      }
    }

    relatedEntities.push({
      entityRef: relatedEntity.entityRef,
      kind: relatedEntity.kind,
      type: relatedEntity.type,
      schema: relatedEntity.schema,
      status: relatedEntity.status,
      summary: relatedEntity.summary,
      owners: relatedEntity.owners,
      ...(inclusionReason ? { inclusionReason } : {}),
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

  // ── 5. Constraints (Decision/Requirement entities within depth) ───
  const constraints: ConstraintEntry[] = [];
  if (includeConstraintBrief) {
    const constraintKinds = new Set(["Decision", "Requirement", "decision", "requirement"]);
    const visited = new Set<string>([target.entityRef]);
    let frontier = [target.entityRef];

    for (let depth = 1; depth <= maxDepth; depth++) {
      const next: string[] = [];
      for (const id of frontier) {
        const entity = entityMap.get(id);
        if (!entity) continue;
        for (const rel of entity.relations ?? []) {
          if (visited.has(rel.target)) continue;
          visited.add(rel.target);
          next.push(rel.target);

          const relEntity = entityMap.get(rel.target);
          if (relEntity && constraintKinds.has(relEntity.kind)) {
            constraints.push({
              entityRef: relEntity.entityRef,
              kind: relEntity.kind,
              title: relEntity.summary,
              description: relEntity.summary,
              depth,
              inclusionReason: `${depth}-hop ${rel.type} relation (${relEntity.kind}) from ${target.entityRef}`,
            });
          }
        }
      }
      if (next.length === 0) break;
      frontier = next;
    }
  }

  // ── 6. Change risks ───────────────────────────────────────────────
  const changeRisks: ChangeRisk[] = [];
  if (includeChangeRisks) {
    for (const rel of target.relations ?? []) {
      const relEntity = entityMap.get(rel.target);
      if (relEntity && relEntity.status === "deprecated") {
        changeRisks.push({
          type: "deprecated-relation",
          description: `Relation ${rel.type} → ${rel.target} targets a deprecated entity (${relEntity.kind})`,
        });
      }
    }
  }

  // ── 7. Token estimate ─────────────────────────────────────────────
  let tokenEstimate = estimateTokens(JSON.stringify(target));
  for (const td of tracedDocs) tokenEstimate += td.tokens;
  for (const rd of requiredDocs) tokenEstimate += rd.tokens;
  for (const relatedEntity of relatedEntities) {
    tokenEstimate += estimateTokens(JSON.stringify(relatedEntity));
  }
  for (const c of constraints) {
    tokenEstimate += estimateTokens(JSON.stringify(c));
  }

  return {
    entity: target,
    tracedDocs,
    requiredDocs,
    relatedEntities,
    additionalRefs,
    constraints,
    changeRisks,
    tokenEstimate,
    truncated: false,
  };
}

function resolvePolicyReadFirstDocs(
  target: EntityContextView,
  workflowPolicy: Record<string, unknown> | null | undefined,
  focusPath?: string,
): Array<{ path: string; ruleId: string }> {
  const rules = normalizeReadFirstRules(workflowPolicy);
  const normalizedFocusPath = focusPath?.replace(/\\/g, "/").replace(/^\.\//, "");
  const docs: Array<{ path: string; ruleId: string }> = [];

  for (const rule of rules) {
    if (Array.isArray(rule.entityRefs) && rule.entityRefs.length > 0 && !rule.entityRefs.includes(target.entityRef)) {
      continue;
    }
    if (Array.isArray(rule.entityKinds) && rule.entityKinds.length > 0 && !rule.entityKinds.includes(target.kind)) {
      continue;
    }
    if (Array.isArray(rule.pathMatches) && rule.pathMatches.length > 0) {
      if (!normalizedFocusPath) continue;
      if (!rule.pathMatches.some((pattern) => minimatch(normalizedFocusPath, pattern))) continue;
    }

    for (const path of [...rule.docs, ...(rule.secondaryDocs ?? [])]) {
      docs.push({ path, ruleId: rule.id });
    }
  }

  return docs;
}

function normalizeReadFirstRules(
  workflowPolicy: Record<string, unknown> | null | undefined,
): ReadFirstRule[] {
  const raw = workflowPolicy?.readFirstRules;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((rule): rule is ReadFirstRule =>
      Boolean(rule) &&
      typeof rule === "object" &&
      typeof (rule as { id?: unknown }).id === "string" &&
      Array.isArray((rule as { docs?: unknown }).docs),
    )
    .map((rule) => ({
      id: rule.id,
      entityRefs: Array.isArray(rule.entityRefs) ? rule.entityRefs : undefined,
      entityKinds: Array.isArray(rule.entityKinds) ? rule.entityKinds : undefined,
      pathMatches: Array.isArray(rule.pathMatches) ? rule.pathMatches : undefined,
      docs: rule.docs,
      secondaryDocs: Array.isArray(rule.secondaryDocs) ? rule.secondaryDocs : undefined,
    }));
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
    return { ...result, tracedDocs: [], requiredDocs: [], relatedEntities: [], additionalRefs: [], constraints: [], changeRisks: [], tokenEstimate: maxTokens, truncated: true };
  }

  // Constraints are critical — include first
  const keptConstraints: ConstraintEntry[] = [];
  for (const c of result.constraints) {
    const cost = estimateTokens(JSON.stringify(c));
    if (remaining - cost < 0) break;
    remaining -= cost;
    keptConstraints.push(c);
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

  const constraintsTruncated = keptConstraints.length < result.constraints.length;
  const truncated = tracedTruncated || requiredTruncated || relatedTruncated || constraintsTruncated;
  const tokenEstimate = maxTokens - remaining;

  return {
    ...result,
    tracedDocs: keptTraced,
    requiredDocs: keptRequired,
    relatedEntities: keptRelated,
    constraints: keptConstraints,
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
    ["files", anchors.files as string[] | undefined],
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

function renderMarkdown(result: ContextResult, whyIncluded?: boolean): string {
  const { entity, tracedDocs, requiredDocs, relatedEntities, additionalRefs, constraints, changeRisks, tokenEstimate, truncated } = result;
  const lines: string[] = [];

  // ── Entity Specification ──────────────────────────────────────────
  lines.push(`# Context: ${entity.entityRef}`);
  lines.push("");
  lines.push("## Entity Specification");
  lines.push(`- ${chalk.bold("Entity Ref")}: ${entity.entityRef}`);
  lines.push(`- ${chalk.bold("Kind")}: ${entity.kind}${entity.type ? `/${entity.type}` : ""}`);
  lines.push(`- ${chalk.bold("Schema")}: ${entity.schema}`);
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

  // ── Constraints ───────────────────────────────────────────────────
  if (constraints.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Constraints");
    for (const c of constraints) {
      lines.push("");
      if (whyIncluded) {
        lines.push(`> Included because: ${c.inclusionReason}`);
      }
      lines.push(`- **${c.entityRef}** (${c.kind}): ${c.description || c.title}`);
    }
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
      if (whyIncluded && td.inclusionReason) {
        lines.push(`> Included because: ${td.inclusionReason}`);
        lines.push("");
      }
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
      if (whyIncluded && rd.inclusionReason) {
        lines.push(`> Included because: ${rd.inclusionReason}`);
        lines.push("");
      }
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
      lines.push(`### ${relatedEntity.entityRef} (${relatedEntity.kind}${relatedEntity.type ? `/${relatedEntity.type}` : ""}, ${relatedEntity.schema}, ${relatedEntity.status})`);
      if (whyIncluded && relatedEntity.inclusionReason) {
        lines.push(`> Included because: ${relatedEntity.inclusionReason}`);
        lines.push("");
      }
      lines.push(`- ${chalk.bold("Summary")}: ${relatedEntity.summary}`);
      lines.push(`- ${chalk.bold("Owners")}: ${relatedEntity.owners.join(", ")}`);
    }
  }

  // ── Change Risks ──────────────────────────────────────────────────
  if (changeRisks.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Change Risks");
    for (const risk of changeRisks) {
      lines.push(`- ${risk.description}`);
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
  const tierNote = result.tier ? ` | Tier: ${result.tier}` : "";
  lines.push(`*Context assembled by anchored-spec. Token estimate: ~${tokenEstimate}${truncNote}${tierNote}*`);

  return lines.join("\n");
}

function buildJsonOutput(result: ContextResult, whyIncluded?: boolean): Record<string, unknown> {
  return {
    entity: {
      entityRef: result.entity.entityRef,
      kind: result.entity.kind,
      type: result.entity.type,
      schema: result.entity.schema,
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
      ...(whyIncluded && td.inclusionReason ? { inclusionReason: td.inclusionReason } : {}),
    })),
    requiredDocs: result.requiredDocs.map((rd) => ({
      path: rd.path,
      content: rd.content,
      tokens: rd.tokens,
      ...(whyIncluded && rd.inclusionReason ? { inclusionReason: rd.inclusionReason } : {}),
    })),
    relatedEntities: result.relatedEntities.map((relatedEntity) => ({
      entityRef: relatedEntity.entityRef,
      kind: relatedEntity.kind,
      type: relatedEntity.type,
      schema: relatedEntity.schema,
      status: relatedEntity.status,
      summary: relatedEntity.summary,
      ...(whyIncluded && relatedEntity.inclusionReason ? { inclusionReason: relatedEntity.inclusionReason } : {}),
    })),
    constraints: result.constraints.map((c) => ({
      entityRef: c.entityRef,
      kind: c.kind,
      title: c.title,
      description: c.description,
      depth: c.depth,
      ...(whyIncluded ? { inclusionReason: c.inclusionReason } : {}),
    })),
    changeRisks: result.changeRisks,
    additionalRefs: result.additionalRefs,
    tokenEstimate: result.tokenEstimate,
    truncated: result.truncated,
    ...(result.tier ? { tier: result.tier } : {}),
  };
}

// ─── LLM-optimized rendering ──────────────────────────────────────────

function renderLlmMarkdown(result: ContextResult): string {
  const lines: string[] = [];

  lines.push(`# Context: ${result.entity.entityRef}`);
  lines.push("");

  // Constraints first (most critical)
  if (result.constraints.length > 0) {
    lines.push("## Constraints (read these first)");
    for (const c of result.constraints) {
      lines.push(`- ${c.entityRef}: ${c.description || c.title}`);
    }
    lines.push("");
  }

  // Entity Specification
  lines.push("## Entity Specification");
  lines.push(`- **Entity Ref**: ${result.entity.entityRef}`);
  lines.push(`- **Kind**: ${result.entity.kind}`);
  lines.push(`- **Status**: ${result.entity.status}`);
  lines.push(`- **Summary**: ${result.entity.summary}`);
  if (result.entity.relations.length > 0) {
    lines.push(`- **Relations**: ${result.entity.relations.map(r => `${r.type} → ${r.target}`).join(", ")}`);
  }
  lines.push("");

  // Primary Contract (top traced doc with specification role)
  const specDoc = result.tracedDocs.find(d => d.role === "specification");
  if (specDoc) {
    lines.push("## Primary Contract");
    lines.push(specDoc.content);
    lines.push("");
  }

  // Implementation References
  const implDocs = result.tracedDocs.filter(d => d.role === "implementation");
  if (implDocs.length > 0) {
    lines.push("## Implementation References");
    for (const doc of implDocs) {
      lines.push(`- ${doc.path} (traceRef, role: implementation)`);
    }
    lines.push("");
  }

  // Other traced docs
  const otherDocs = result.tracedDocs.filter(d => d.role !== "specification" && d.role !== "implementation");
  if (otherDocs.length > 0) {
    lines.push("## Supporting Documents");
    for (const doc of otherDocs) {
      const roleTag = doc.role ? ` (${doc.role})` : "";
      lines.push(`### ${doc.path}${roleTag}`);
      lines.push(doc.content);
      lines.push("");
    }
  }

  // Related Entities (compact)
  if (result.relatedEntities.length > 0) {
    const total = result.relatedEntities.length;
    const shown = result.relatedEntities.slice(0, 10);
    const suffix = total > 10 ? ` (${shown.length} of ${total}, highest relevance)` : "";
    lines.push(`## Related Entities${suffix}`);
    for (const re of shown) {
      lines.push(`- **${re.entityRef}** (${re.kind}, ${re.status}): ${re.summary}`);
    }
    lines.push("");
  }

  // Change Risks
  if (result.changeRisks.length > 0) {
    lines.push("## Change Risks");
    for (const risk of result.changeRisks) {
      lines.push(`- ${risk.description}`);
    }
    lines.push("");
  }

  // Footer
  lines.push("---");
  const truncNote = result.truncated ? " | Truncated: yes" : " | Truncated: no";
  const tierNote = result.tier ? ` | Tier: ${result.tier}` : "";
  lines.push(`Token estimate: ~${result.tokenEstimate}${truncNote}${tierNote}`);

  return lines.join("\n");
}

// ─── Command ──────────────────────────────────────────────────────────

export function eaContextCommand(): Command {
  return new Command("context")
    .description("Assemble a complete AI context package for an entity")
    .argument("<entity-ref>", "Entity ref to assemble context for")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--doc-dirs <dirs>", "Comma-separated doc directories to scan")
    .option("--max-tokens <n>", "Maximum estimated tokens for the output")
    .option("--depth <n>", "Maximum depth to follow relations")
    .option("--json", "Output as JSON")
    .option("--tier <tier>", "Context tier preset: brief, standard, deep, llm")
    .option("--budget <n>", "Token budget (alias for --max-tokens with --tier llm)")
    .option("--focus-path <path>", "Optional changed path used to refine read-first docs from workflow policy")
    .option("--why-included", "Show inclusion rationale for each item")
    .option("--prefer-canonical", "Prefer canonical docs over derived duplicates")
    .option("--format <format>", "Output format: markdown, json", "markdown")
    .action(async (entityInput: string, options) => {
      const cwd = process.cwd();
      const eaConfig = loadProjectConfig(cwd, options.rootDir);
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError("EA not initialized. Run 'anchored-spec init' first.", 2);
      }

      const loadResult = await root.loadEntities();
      const workflowPolicy = root.loadPolicy();
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
      const docDirs = options.docDirs
        ? (options.docDirs as string).split(",").map((d: string) => d.trim())
        : (getConfiguredDocScanDirs(eaConfig) ?? ["docs", "specs", "."]);
      const normalizedDocs = scanDocs(cwd, { dirs: docDirs }).docs;

      // ── Resolve tier preset ───────────────────────────────────────
      const tierName = options.tier as ContextTier | undefined;
      const preset = tierName ? TIER_PRESETS[tierName] : undefined;

      if (tierName && !preset) {
        throw new CliError(`Unknown tier "${tierName}". Valid tiers: brief, standard, deep, llm`, 1);
      }

      // Depth: explicit --depth > tier preset > default 1
      let depth: number;
      if (options.depth != null) {
        depth = parseInt(options.depth as string, 10);
        if (Number.isNaN(depth) || depth < 0) {
          throw new CliError("--depth must be a non-negative integer", 1);
        }
      } else if (preset) {
        depth = preset.depth;
      } else {
        depth = 1;
      }

      // Max tokens: explicit --max-tokens > --budget (for llm tier) > tier preset
      let maxTokens: number | undefined;
      if (options.maxTokens != null) {
        maxTokens = parseInt(options.maxTokens as string, 10);
        if (Number.isNaN(maxTokens) || maxTokens <= 0) {
          throw new CliError("--max-tokens must be a positive integer", 1);
        }
      } else if (options.budget != null) {
        maxTokens = parseInt(options.budget as string, 10);
        if (Number.isNaN(maxTokens) || maxTokens <= 0) {
          throw new CliError("--budget must be a positive integer", 1);
        }
      } else if (preset?.maxTokens != null) {
        maxTokens = preset.maxTokens;
      }

      // Feature flags: explicit flags override tier preset
      const preferCanonical = options.preferCanonical === true || (preset?.preferCanonical ?? false);
      const whyIncluded = options.whyIncluded === true;
      const includeConstraintBrief = preset?.includeConstraintBrief ?? false;
      const includeChangeRisks = preset?.includeChangeRisks ?? false;
      const maxTracedDocs = preset?.maxTracedDocs;

      // Assemble context
      let result = assembleContext(target, entities, normalizedDocs, cwd, {
        maxDepth: depth,
        maxTracedDocs,
        includeConstraintBrief,
        includeChangeRisks,
        preferCanonical,
        whyIncluded,
        focusPath: options.focusPath as string | undefined,
        workflowPolicy,
      });

      // Store tier in result for rendering
      if (tierName) {
        result = { ...result, tier: tierName };
      }

      // Apply token budget
      if (maxTokens != null) {
        result = applyTokenBudget(result, maxTokens);
      }

      // Determine output format
      const useJson = options.json === true || options.format === "json";

      // Output
      if (useJson) {
        process.stdout.write(JSON.stringify(buildJsonOutput(result, whyIncluded), null, 2) + "\n");
      } else if (tierName === "llm") {
        process.stdout.write(renderLlmMarkdown(result) + "\n");
      } else {
        process.stdout.write(renderMarkdown(result, whyIncluded) + "\n");
      }
    });
}
