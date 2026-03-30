/**
 * anchored-spec ea context
 *
 * Assemble a complete AI context package for an artifact by following
 * its trace links and relations.  Reads traced documents in full,
 * follows `requires` in frontmatter for transitive context, collects
 * related artifact metadata, and respects an optional token budget.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { EaRoot } from "../../ea/loader.js";
import { resolveEaConfig } from "../../ea/config.js";
import type { EaArtifactBase } from "../../ea/types.js";
import { scanDocs, buildDocIndex } from "../../ea/docs/scanner.js";
import type { ScannedDoc } from "../../ea/docs/scanner.js";
import { parseFrontmatter } from "../../ea/docs/frontmatter.js";
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

interface RelatedArtifactInfo {
  id: string;
  kind: string;
  status: string;
  summary: string;
  owners: string[];
}

interface ContextResult {
  artifact: EaArtifactBase;
  tracedDocs: TracedDoc[];
  requiredDocs: RequiredDoc[];
  relatedArtifacts: RelatedArtifactInfo[];
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
function collectRelatedIds(
  sourceId: string,
  artifactMap: Map<string, EaArtifactBase>,
  maxDepth: number,
): string[] {
  const visited = new Set<string>([sourceId]);
  let frontier = [sourceId];

  for (let depth = 0; depth < maxDepth; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      const artifact = artifactMap.get(id);
      if (!artifact) continue;
      for (const rel of artifact.relations ?? []) {
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
 * Assemble the full context for a single artifact.
 */
function assembleContext(
  target: EaArtifactBase,
  artifacts: EaArtifactBase[],
  docs: ScannedDoc[],
  cwd: string,
  maxDepth: number,
): ContextResult {
  const artifactMap = new Map<string, EaArtifactBase>();
  for (const a of artifacts) artifactMap.set(a.id, a);

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

  // ── 3. Related artifacts ──────────────────────────────────────────
  const relatedIds = collectRelatedIds(target.id, artifactMap, maxDepth);
  const relatedArtifacts: RelatedArtifactInfo[] = [];

  for (const rid of relatedIds) {
    const ra = artifactMap.get(rid);
    if (!ra) continue;
    relatedArtifacts.push({
      id: ra.id,
      kind: ra.kind,
      status: ra.status,
      summary: ra.summary,
      owners: ra.owners,
    });
  }

  // ── 4. Additional doc references (doc frontmatter → artifact) ─────
  const docIndex = buildDocIndex(docs);
  const referencingDocs = docIndex.get(target.id) ?? [];
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
  for (const ra of relatedArtifacts) tokenEstimate += estimateTokens(JSON.stringify(ra));

  return {
    artifact: target,
    tracedDocs,
    requiredDocs,
    relatedArtifacts,
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

  // Always include the artifact spec itself
  remaining -= estimateTokens(JSON.stringify(result.artifact));
  if (remaining <= 0) {
    return { ...result, tracedDocs: [], requiredDocs: [], relatedArtifacts: [], additionalRefs: [], tokenEstimate: maxTokens, truncated: true };
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

  // Related artifacts (metadata only — cheap)
  const keptRelated: RelatedArtifactInfo[] = [];
  for (const ra of result.relatedArtifacts) {
    const cost = estimateTokens(JSON.stringify(ra));
    if (remaining - cost < 0) break;
    remaining -= cost;
    keptRelated.push(ra);
  }
  const relatedTruncated = keptRelated.length < result.relatedArtifacts.length;

  const truncated = tracedTruncated || requiredTruncated || relatedTruncated;
  const tokenEstimate = maxTokens - remaining;

  return {
    ...result,
    tracedDocs: keptTraced,
    requiredDocs: keptRequired,
    relatedArtifacts: keptRelated,
    tokenEstimate,
    truncated,
  };
}

// ─── Render helpers (human-readable) ──────────────────────────────────

/** Format anchors for display. */
function formatAnchors(artifact: EaArtifactBase): string[] {
  const anchors = artifact.anchors;
  if (!anchors) return [];

  const lines: string[] = [];
  const fields: [string, string[] | undefined][] = [
    ["symbols", anchors.symbols],
    ["apis", anchors.apis],
    ["events", anchors.events],
    ["schemas", anchors.schemas],
    ["infra", anchors.infra],
    ["catalogRefs", anchors.catalogRefs],
    ["iam", anchors.iam],
    ["network", anchors.network],
  ];

  for (const [name, values] of fields) {
    if (values && values.length > 0) {
      lines.push(`- ${name}: ${values.join(", ")}`);
    }
  }

  if (anchors.other) {
    for (const [name, values] of Object.entries(anchors.other)) {
      if (values && values.length > 0) {
        lines.push(`- ${name}: ${values.join(", ")}`);
      }
    }
  }

  return lines;
}

function renderMarkdown(result: ContextResult): string {
  const { artifact, tracedDocs, requiredDocs, relatedArtifacts, additionalRefs, tokenEstimate, truncated } = result;
  const lines: string[] = [];

  // ── Artifact Specification ────────────────────────────────────────
  lines.push(`# Context: ${artifact.id}`);
  lines.push("");
  lines.push("## Artifact Specification");
  lines.push(`- ${chalk.bold("ID")}: ${artifact.id}`);
  lines.push(`- ${chalk.bold("Kind")}: ${artifact.kind}`);
  lines.push(`- ${chalk.bold("Status")}: ${artifact.status}`);
  lines.push(`- ${chalk.bold("Summary")}: ${artifact.summary}`);
  lines.push(`- ${chalk.bold("Owners")}: ${artifact.owners.join(", ")}`);
  if (artifact.tags && artifact.tags.length > 0) {
    lines.push(`- ${chalk.bold("Tags")}: ${artifact.tags.join(", ")}`);
  }
  lines.push(`- ${chalk.bold("Confidence")}: ${artifact.confidence}`);

  // Relations
  const relations = artifact.relations ?? [];
  if (relations.length > 0) {
    lines.push("");
    lines.push("### Relations");
    for (const rel of relations) {
      lines.push(`- ${rel.type} → ${rel.target}`);
    }
  }

  // Anchors
  const anchorLines = formatAnchors(artifact);
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

  // ── Related Artifacts ─────────────────────────────────────────────
  if (relatedArtifacts.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Related Artifacts");
    for (const ra of relatedArtifacts) {
      lines.push("");
      lines.push(`### ${ra.id} (${ra.kind}, ${ra.status})`);
      lines.push(`- ${chalk.bold("Summary")}: ${ra.summary}`);
      lines.push(`- ${chalk.bold("Owners")}: ${ra.owners.join(", ")}`);
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
      lines.push(`- ${ref} (references this artifact)`);
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
    artifact: {
      id: result.artifact.id,
      kind: result.artifact.kind,
      status: result.artifact.status,
      summary: result.artifact.summary,
      owners: result.artifact.owners,
      tags: result.artifact.tags,
      confidence: result.artifact.confidence,
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
    relatedArtifacts: result.relatedArtifacts.map((ra) => ({
      id: ra.id,
      kind: ra.kind,
      status: ra.status,
      summary: ra.summary,
    })),
    additionalRefs: result.additionalRefs,
    tokenEstimate: result.tokenEstimate,
    truncated: result.truncated,
  };
}

// ─── Command ──────────────────────────────────────────────────────────

export function eaContextCommand(): Command {
  return new Command("context")
    .description("Assemble a complete AI context package for an artifact")
    .argument("<artifact-id>", "Artifact ID to assemble context for")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--doc-dirs <dirs>", "Comma-separated doc directories to scan", "docs,specs,.")
    .option("--max-tokens <n>", "Maximum estimated tokens for the output")
    .option("--depth <n>", "Maximum depth to follow relations", "1")
    .option("--json", "Output as JSON")
    .action(async (artifactId: string, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, { specDir: "specs", outputDir: "output", ea: eaConfig } as never);

      if (!root.isInitialized()) {
        throw new CliError("EA not initialized. Run 'anchored-spec ea init' first.", 2);
      }

      const loadResult = await root.loadArtifacts();
      const { artifacts } = loadResult;

      // Find target artifact
      const target = artifacts.find((a) => a.id === artifactId);
      if (!target) {
        throw new CliError(`Artifact not found: ${artifactId}`, 1);
      }

      // Scan docs
      const docDirs = (options.docDirs as string).split(",").map((d: string) => d.trim());
      const scanResult = scanDocs(cwd, { dirs: docDirs });

      // Depth
      const depth = parseInt(options.depth as string, 10);
      if (Number.isNaN(depth) || depth < 0) {
        throw new CliError("--depth must be a non-negative integer", 1);
      }

      // Assemble context
      let result = assembleContext(target, artifacts, scanResult.docs, cwd, depth);

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
