/**
 * anchored-spec ea trace
 *
 * Show the traceability web between entities (`traceRefs`) and
 * markdown documents (frontmatter `ea-artifacts`). Supports single-target
 * lookup, orphan detection, full bidirectional integrity checks, and
 * summary statistics.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import chalk from "chalk";
import { EaRoot } from "../../ea/loader.js";
import { resolveConfigV1 } from "../../ea/config.js";
import { scanDocs, buildDocIndex } from "../../ea/docs/scanner.js";
import type { ScannedDoc } from "../../ea/docs/scanner.js";
import { buildTraceLinks, buildTraceCheckReport, isUrl } from "../../ea/trace-analysis.js";
import type { TraceLink, TraceCheckReport } from "../../ea/trace-analysis.js";
import { scanSourceAnnotations } from "../../ea/source-scanner.js";
import type { AnchoredSpecConfigV1 } from "../../ea/config.js";
import type { BackstageEntity } from "../../ea/backstage/types.js";
import {
  getEntityId,
  getEntityLegacyKind,
  getEntityStatus,
  getEntityTraceRefs,
} from "../../ea/backstage/accessors.js";
import { buildEntityLookup, suggestEntities } from "../entity-ref.js";
import { CliError } from "../errors.js";
import { renderExplanationList } from "../../ea/evidence-renderer.js";
import type { ExplainableItem } from "../../ea/evidence-renderer.js";

// ─── Helpers ──────────────────────────────────────────────────────────

interface TraceEntityView {
  entityRef: string;
  kind: string;
  status: string;
  traceRefs: Array<{ path: string; role?: string }>;
}

interface SummaryReport {
  entitiesWithTraceRefs: number;
  totalEntities: number;
  docsWithEaArtifacts: number;
  totalDocsScanned: number;
  totalTraceLinks: number;
  totalFrontmatterRefs: number;
  bidirectionalPairs: number;
  oneWayPairs: number;
}

function buildSummaryReport(
  entities: TraceEntityView[],
  docs: ScannedDoc[],
  totalScanned: number,
  links: TraceLink[],
): SummaryReport {
  const check = buildTraceCheckReport(links);
  const entitiesWithRefs = new Set(
    entities.filter((entity) => (entity.traceRefs?.length ?? 0) > 0).map((entity) => entity.entityRef),
  ).size;
  const totalTraceLinks = links.filter((l) => l.artifactToDoc).length;
  const totalFmRefs = links.filter((l) => l.docToArtifact).length;

  return {
    entitiesWithTraceRefs: entitiesWithRefs,
    totalEntities: entities.length,
    docsWithEaArtifacts: docs.length,
    totalDocsScanned: totalScanned,
    totalTraceLinks,
    totalFrontmatterRefs: totalFmRefs,
    bidirectionalPairs: check.bidirectionalCount,
    oneWayPairs:
      check.oneWayArtifactToDoc.length + check.oneWayDocToArtifact.length,
  };
}

// ─── Render helpers (human-readable) ──────────────────────────────────

function renderTargetEntity(
  entity: TraceEntityView,
  docs: ScannedDoc[],
  cwd: string,
): string {
  const lines: string[] = [];
  const docIndex = buildDocIndex(docs);
  const referencingDocs = docIndex.get(entity.entityRef) ?? [];

  lines.push(
    chalk.bold(`${entity.entityRef}`) +
      chalk.dim(` (${entity.kind}, ${entity.status})`),
  );

  // traceRefs
  const refs = entity.traceRefs ?? [];
  if (refs.length > 0) {
    lines.push("  traceRefs:");
    for (const ref of refs) {
      const url = isUrl(ref.path);
      const roleStr = ref.role ? ` (${ref.role})` : "";
      if (url) {
        lines.push(
          `    → ${ref.path}${roleStr} ${chalk.dim("(URL, skipped)")}`,
        );
        continue;
      }
      const exists = existsSync(resolve(cwd, ref.path));
      if (!exists) {
        lines.push(
          `    → ${ref.path}${roleStr} ${chalk.red("❌ file not found")}`,
        );
        continue;
      }
      lines.push(
        `    → ${ref.path}${roleStr} ${chalk.green("✅ exists")}`,
      );
    }
  }

  // Referenced by (frontmatter)
  if (referencingDocs.length > 0) {
    lines.push("  Referenced by (frontmatter):");
    for (const doc of referencingDocs) {
      const hasTraceBack = refs.some((r) => r.path === doc.relativePath);
      if (hasTraceBack) {
        lines.push(
          `    ← ${doc.relativePath} ${chalk.green("✅ (bidirectional)")}`,
        );
      } else {
        lines.push(
          `    ← ${doc.relativePath} ${chalk.yellow("⚠ (no traceRef back)")}`,
        );
      }
    }
  }

  // Missing backlinks
  const missingBacklinks = refs.filter((r) => {
    if (isUrl(r.path)) return false;
    if (!existsSync(resolve(cwd, r.path))) return false;
    return !referencingDocs.some((d) => d.relativePath === r.path);
  });
  if (missingBacklinks.length > 0) {
    lines.push("  Missing backlinks:");
    for (const ref of missingBacklinks) {
      lines.push(
        `    ${chalk.yellow("⚠")} ${ref.path} has traceRef but no ea-artifacts frontmatter`,
      );
    }
  }

  return lines.join("\n");
}

function renderTargetDoc(
  doc: ScannedDoc,
  entityMap: Map<string, TraceEntityView>,
): string {
  const lines: string[] = [];
  const fm = doc.frontmatter;

  lines.push(
    chalk.bold(doc.relativePath) +
      chalk.dim(
        ` (${fm.type ?? "unknown"}, ${fm.status ?? "unknown"})`,
      ),
  );

  // Frontmatter summary
  lines.push("  Frontmatter:");
  const parts: string[] = [];
  if (fm.type) parts.push(`type: ${fm.type}`);
  if (fm.status) parts.push(`status: ${fm.status}`);
  if (fm.audience) parts.push(`audience: ${fm.audience.join(", ")}`);
  if (fm.domain) parts.push(`domain: ${fm.domain.join(", ")}`);
  if (fm.tokens != null) parts.push(`tokens: ${fm.tokens}`);
  lines.push(`    ${parts.join(" | ")}`);

  // ea-artifacts
  if (doc.artifactIds.length > 0) {
    lines.push("  ea-artifacts:");
    for (const aid of doc.artifactIds) {
      const entity = entityMap.get(aid);
      if (!entity) {
        lines.push(`    → ${aid} ${chalk.red("❌ (entity not found)")}`);
        continue;
      }
      const label = entity.entityRef;
      const hasTraceBack = (entity.traceRefs ?? []).some(
        (r) => r.path === doc.relativePath,
      );
      if (hasTraceBack) {
        lines.push(
          `    → ${label} ${chalk.green("✅ (exists, has traceRef back)")}`,
        );
      } else {
        lines.push(
          `    → ${label} ${chalk.yellow("⚠ (exists, NO traceRef back)")}`,
        );
      }
    }
  }

  return lines.join("\n");
}

function renderOrphans(
  docs: ScannedDoc[],
  entityMap: Map<string, TraceEntityView>,
): string {
  const lines: string[] = [];
  let orphanDocs = 0;
  let missingLinks = 0;

  for (const doc of docs) {
    const orphanIds = doc.artifactIds.filter((aid) => {
      const entity = entityMap.get(aid);
      if (!entity) return false; // entity doesn't exist — different issue
      return !(entity.traceRefs ?? []).some((r) => r.path === doc.relativePath);
    });
    if (orphanIds.length === 0) continue;

    orphanDocs++;
    lines.push(`  ${doc.relativePath}`);
    for (const aid of orphanIds) {
      lines.push(`    → ${aid} (no traceRef back to this doc)`);
      missingLinks++;
    }
    lines.push("");
  }

  if (orphanDocs === 0) {
    return chalk.green("No orphaned documents found. All backlinks present.");
  }

  const header =
    chalk.bold(
      "Orphaned documents (frontmatter → entity, but no traceRef back):",
    ) + "\n";
  const footer = `${orphanDocs} document${orphanDocs === 1 ? "" : "s"}, ${missingLinks} missing backlink${missingLinks === 1 ? "" : "s"}`;

  return header + "\n" + lines.join("\n") + footer;
}

function renderCheck(report: TraceCheckReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold("Bidirectional Trace Integrity Check\n"));

  // Broken traceRefs
  if (report.brokenTraceRefs.length > 0) {
    lines.push("  Entities with broken traceRefs:");
    for (const b of report.brokenTraceRefs) {
      lines.push(`    ${chalk.red("❌")} ${b.artifactId} → ${b.path} (${b.reason})`);
    }
    lines.push("");
  }

  // One-way entity → doc
  if (report.oneWayArtifactToDoc.length > 0) {
    const actionable = report.oneWayArtifactToDoc.filter(
      (o) => o.severity === "warning",
    );
    const structural = report.oneWayArtifactToDoc.filter(
      (o) => o.severity === "info",
    );

    if (actionable.length > 0) {
      lines.push("  Entities with one-way traceRefs (actionable — missing frontmatter):");
      for (const o of actionable) {
        lines.push(`    ${chalk.yellow("⚠")} ${o.artifactId} → ${o.path} (${o.reason})`);
      }
      lines.push("");
    }
    if (structural.length > 0) {
      lines.push("  Entities with one-way traceRefs (structural — non-markdown files):");
      for (const o of structural) {
        lines.push(`    ${chalk.blue("ℹ")} ${o.artifactId} → ${o.path} (${o.reason})`);
      }
      lines.push("");
    }
  }

  // One-way doc → entity
  if (report.oneWayDocToArtifact.length > 0) {
    lines.push("  Docs with one-way frontmatter (no traceRef back):");
    for (const o of report.oneWayDocToArtifact) {
      lines.push(`    ${chalk.yellow("⚠")} ${o.docPath} → ${o.artifactId} (no traceRef in entity)`);
    }
    lines.push("");
  }

  const actionableOneWay = report.oneWayArtifactToDoc.filter(
    (o) => o.severity === "warning",
  ).length;
  const structuralOneWay = report.oneWayArtifactToDoc.filter(
    (o) => o.severity === "info",
  ).length;

  const totalIssues =
    actionableOneWay +
    report.oneWayDocToArtifact.length +
    report.brokenTraceRefs.length;

  lines.push(`  Fully bidirectional links: ${report.bidirectionalCount} ${chalk.green("✅")}`);
  lines.push(`  One-way entity→doc (actionable): ${actionableOneWay} ${chalk.yellow("⚠")}`);
  lines.push(`  One-way entity→doc (structural): ${structuralOneWay} ${chalk.blue("ℹ")}`);
  lines.push(`  One-way doc→entity: ${report.oneWayDocToArtifact.length} ${chalk.yellow("⚠")}`);
  lines.push(`  Broken references: ${report.brokenTraceRefs.length} ${chalk.red("❌")}`);
  lines.push("");

  if (totalIssues === 0) {
    lines.push(`  Result: ${chalk.green("OK")} (no issues)`);
  } else if (report.brokenTraceRefs.filter((b) => b.reason === "file not found").length > 0) {
    lines.push(`  Result: ${chalk.red("ERRORS")} (${totalIssues} issue${totalIssues === 1 ? "" : "s"})`);
  } else {
    lines.push(`  Result: ${chalk.yellow("WARNINGS")} (${totalIssues} issue${totalIssues === 1 ? "" : "s"})`);
  }

  return lines.join("\n");
}

function renderSummary(report: SummaryReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold("Trace Summary:"));
  lines.push(`  Entities with traceRefs: ${report.entitiesWithTraceRefs} / ${report.totalEntities}`);
  lines.push(`  Documents with ea-artifacts: ${report.docsWithEaArtifacts} / ${report.totalDocsScanned} scanned`);
  lines.push(`  Total trace links (entity→doc): ${report.totalTraceLinks}`);
  lines.push(`  Total frontmatter refs (doc→entity): ${report.totalFrontmatterRefs}`);
  lines.push(`  Bidirectional pairs: ${report.bidirectionalPairs}`);
  lines.push(`  One-way pairs: ${report.oneWayPairs}`);
  return lines.join("\n");
}

function toTraceEntityView(entity: BackstageEntity): TraceEntityView {
  return {
    entityRef: getEntityId(entity),
    kind: getEntityLegacyKind(entity),
    status: getEntityStatus(entity),
    traceRefs: getEntityTraceRefs(entity),
  };
}

// ─── Command ──────────────────────────────────────────────────────────

export function eaTraceCommand(): Command {
  return new Command("trace")
    .description("Show traceability web between entities and documents")
    .argument("[target]", "Entity ref or document path to inspect")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--doc-dirs <dirs>", "Comma-separated doc directories to scan", "docs,specs,.")
    .option("--orphans", "Show orphaned docs (frontmatter refs with no traceRef back)")
    .option("--check", "Full bidirectional integrity report")
    .option("--fix-broken", "Remove traceRefs pointing to non-existent files")
    .option("--dry-run", "Show what would change without writing files")
    .option("--summary", "Show summary counts")
    .option("--source-annotations", "Include source file @anchored-spec annotations in trace analysis")
    .option("--json", "Output as JSON")
    .option("--explain", "Show detailed rationale for each trace link")
    .action(async (target: string | undefined, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError("EA not initialized. Run 'anchored-spec init' first.", 2);
      }

      // Load v1 config for sourceAnnotations settings
      let v1Config: AnchoredSpecConfigV1 | null = null;
      try {
        const configPath = resolve(cwd, ".anchored-spec", "config.json");
        if (existsSync(configPath)) {
          const raw = JSON.parse(readFileSync(configPath, "utf-8"));
          if (raw.schemaVersion === "1.0") v1Config = raw as AnchoredSpecConfigV1;
        }
      } catch { /* ignore config read errors */ }

      const loadResult = await root.loadEntities();
      const entities = loadResult.entities;
      const lookup = buildEntityLookup(entities);

      const docDirs = (options.docDirs as string).split(",").map((d: string) => d.trim());
      const scanResult = scanDocs(cwd, { dirs: docDirs });
      const { docs, totalScanned } = scanResult;

      // Scan source annotations if enabled via flag or config
      const sourceAnnotationsEnabled =
        options.sourceAnnotations ||
        v1Config?.sourceAnnotations?.enabled;

      if (sourceAnnotationsEnabled) {
        const srcResult = scanSourceAnnotations(
          cwd,
          v1Config?.sourceAnnotations,
          v1Config?.sourceRoots,
          v1Config?.sourceGlobs,
        );
        docs.push(...srcResult.sources);
      }

      const traceEntities = entities.map(toTraceEntityView);
      const entityMap = new Map<string, TraceEntityView>();
      for (const entity of traceEntities) {
        entityMap.set(entity.entityRef, entity);
      }

      const normalizedDocs = docs;

      const rawLinks = buildTraceLinks(entities, normalizedDocs, cwd);
      const links = rawLinks;

      // ── --fix-broken ──────────────────────────────────────────────
      if (options.fixBroken) {
        const report = buildTraceCheckReport(links);
        const toRemove = report.brokenTraceRefs.filter(
          (b) => b.reason === "file not found",
        );

        if (toRemove.length === 0) {
          if (options.json) {
            process.stdout.write(
              JSON.stringify({ removed: [], entitiesModified: 0 }, null, 2) + "\n",
            );
          } else {
            console.log(
              chalk.green("✓ No broken trace references to remove."),
            );
          }
          return;
        }

        // Group broken refs by entity ref
        const brokenByEntity = new Map<string, string[]>();
        for (const b of toRemove) {
          const list = brokenByEntity.get(b.artifactId) ?? [];
          list.push(b.path);
          brokenByEntity.set(b.artifactId, list);
        }

        const removed: { artifactId: string; path: string }[] = [];

        if (!options.dryRun) {
          for (const [entityRef, paths] of brokenByEntity) {
            const detail = loadResult.details.find(
              (d) => {
                const detailEntity = d.entity ?? d.authoredEntity;
                return detailEntity ? getEntityId(detailEntity) === entityRef : false;
              },
            );
            if (!detail) continue;

            const pathSet = new Set(paths);
            removeBrokenTraceRefs(detail.filePath, pathSet);
            for (const p of paths) {
              removed.push({ artifactId: entityRef, path: p });
            }
          }
        } else {
          for (const b of toRemove) {
            removed.push({ artifactId: b.artifactId, path: b.path });
          }
        }

        if (options.json) {
          process.stdout.write(
            JSON.stringify(
              {
                dryRun: !!options.dryRun,
                removed,
                 entitiesModified: brokenByEntity.size,
              },
              null,
              2,
            ) + "\n",
          );
        } else {
          if (options.dryRun) {
            console.log(chalk.yellow("  DRY RUN — no files modified\n"));
          }
          console.log(
            chalk.bold(
               `Removing ${toRemove.length} broken traceRef${toRemove.length === 1 ? "" : "s"} from ${brokenByEntity.size} entit${brokenByEntity.size === 1 ? "y" : "ies"}:\n`,
            ),
          );
          for (const r of removed) {
            console.log(
              `  ${chalk.red("✕")} ${r.artifactId} → ${r.path}`,
            );
          }
        }
        return;
      }

      // ── --check ───────────────────────────────────────────────────
      if (options.check) {
        const report = buildTraceCheckReport(links);
        if (options.json) {
          if (options.explain) {
            const explained = traceLinksToExplainableItems(links, entityMap);
            const jsonOut = { ...report, explanations: JSON.parse(renderExplanationList(explained, "json")) };
            process.stdout.write(JSON.stringify(jsonOut, null, 2) + "\n");
          } else {
            process.stdout.write(JSON.stringify(report, null, 2) + "\n");
          }
        } else {
          process.stdout.write(renderCheck(report) + "\n");
          if (options.explain) {
            const explained = traceLinksToExplainableItems(links, entityMap);
            process.stdout.write("\n## Explanations\n\n" + renderExplanationList(explained, "markdown") + "\n");
          }
        }

        // Exit 1 when broken file references exist
        const hasBrokenFiles = report.brokenTraceRefs.some(
          (b) => b.reason === "file not found",
        );
        if (hasBrokenFiles) {
          throw new CliError("Broken trace references found.", 1);
        }
        return;
      }

      // ── --orphans ─────────────────────────────────────────────────
      if (options.orphans) {
        if (options.json) {
          const orphanData: { docPath: string; missingBacklinks: string[] }[] = [];
          for (const doc of normalizedDocs) {
            const orphanIds = doc.artifactIds.filter((aid) => {
              const a = entityMap.get(aid);
              if (!a) return false;
              return !(a.traceRefs ?? []).some((r) => r.path === doc.relativePath);
            });
            if (orphanIds.length > 0) {
              orphanData.push({ docPath: doc.relativePath, missingBacklinks: orphanIds });
            }
          }
          process.stdout.write(JSON.stringify(orphanData, null, 2) + "\n");
        } else {
          process.stdout.write(renderOrphans(normalizedDocs, entityMap) + "\n");
        }
        return;
      }

      // ── --summary ─────────────────────────────────────────────────
      if (options.summary) {
          const report = buildSummaryReport(traceEntities, normalizedDocs, totalScanned, links);
        if (options.json) {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        } else {
          process.stdout.write(renderSummary(report) + "\n");
        }
        return;
      }

      // ── target lookup ─────────────────────────────────────────────
      if (target) {
        const doc = normalizedDocs.find(
          (d) => d.relativePath === target || d.path === target,
        );
        if (!doc) {
          const resolvedTarget = lookup.byInput.get(target);
          const resolvedRef = resolvedTarget ? getEntityId(resolvedTarget) : target;
          const entity = entityMap.get(resolvedRef);
          if (!entity) {
            const similar = suggestEntities(target, entities);
            const hint = similar.length > 0 ? `\n  Did you mean: ${similar.join(", ")}?` : "";
            throw new CliError(`Entity "${target}" not found.${hint}`, 1);
          }
          if (options.json) {
            const docIndex = buildDocIndex(normalizedDocs);
            process.stdout.write(
              JSON.stringify(
                {
                  entity: {
                    entityRef: entity.entityRef,
                    kind: entity.kind,
                    status: entity.status,
                  },
                  traceRefs: (entity.traceRefs ?? []).map((r) => ({
                    path: r.path,
                    role: r.role ?? null,
                    isUrl: isUrl(r.path),
                    fileExists: isUrl(r.path) ? null : existsSync(resolve(cwd, r.path)),
                  })),
                  referencedBy: (docIndex.get(entity.entityRef) ?? []).map((d) => ({
                    path: d.relativePath,
                    bidirectional: (entity.traceRefs ?? []).some(
                      (r) => r.path === d.relativePath,
                    ),
                  })),
                },
                null,
                2,
              ) + "\n",
            );
          } else {
            process.stdout.write(renderTargetEntity(entity, normalizedDocs, cwd) + "\n");
          }
          return;
        }
        if (options.json) {
          process.stdout.write(
            JSON.stringify(
              {
                doc: {
                  path: doc.relativePath,
                  frontmatter: doc.frontmatter,
                },
                linkedEntities: doc.artifactIds.map((aid) => {
                  const a = entityMap.get(aid);
                  if (!a) return { id: aid, found: false, hasTraceBack: false };
                  const hasBack = (a.traceRefs ?? []).some(
                    (r) => r.path === doc.relativePath,
                  );
                  return { id: aid, found: true, hasTraceBack: hasBack };
                }),
              },
              null,
              2,
            ) + "\n",
          );
        } else {
          process.stdout.write(renderTargetDoc(doc, entityMap) + "\n");
        }
        return;
      }

      // ── No target, no flag — show summary as default ──────────────
      const report = buildSummaryReport(traceEntities, normalizedDocs, totalScanned, links);
      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      } else {
        process.stdout.write(renderSummary(report) + "\n");
      }
    });
}

// ─── Explain helper ────────────────────────────────────────────────

function traceLinksToExplainableItems(
  links: TraceLink[],
  entityMap: Map<string, TraceEntityView>,
): ExplainableItem[] {
  return links.map((link) => {
    const entity = entityMap.get(link.artifactId);
    const bidir = link.artifactToDoc && link.docToArtifact;
    const direction = link.artifactToDoc && link.docToArtifact
      ? "bidirectional"
      : link.artifactToDoc
        ? "entity→doc"
        : "doc→entity";

    const source = link.artifactToDoc
      ? "traceRef in entity spec"
      : "ea-artifacts frontmatter in doc";

    const reason = bidir
      ? `Bidirectional link between ${link.artifactId} and ${link.docPath}`
      : `One-way ${direction} link from ${link.artifactToDoc ? link.artifactId : link.docPath} to ${link.artifactToDoc ? link.docPath : link.artifactId}`;

    const evidence: string[] = [];
    evidence.push(`Direction: ${direction}`);
    evidence.push(`Link source: ${source}`);
    if (link.isUrl) evidence.push("Target is a URL (not a local file)");
    if (!link.isUrl && link.artifactToDoc) evidence.push(`File exists: ${link.fileExists}`);
    if (bidir) evidence.push("Bidirectional: entity traceRef ↔ doc frontmatter");

    return {
      ref: link.artifactId,
      kind: entity?.kind ?? "unknown",
      title: link.docPath,
      reason,
      evidence,
    };
  });
}

// ─── Fix-broken helper ─────────────────────────────────────────────

/**
 * Read an artifact file, remove traceRefs matching the given paths,
 * and write it back in the same format (JSON or YAML).
 */
function removeBrokenTraceRefs(
  filePath: string,
  pathsToRemove: Set<string>,
): void {
  const raw = readFileSync(filePath, "utf-8");
  const isJson = filePath.endsWith(".json");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  if (isJson) {
    data = JSON.parse(raw);
  } else {
    data = parseYaml(raw);
  }

  if (!Array.isArray(data.traceRefs) && !Array.isArray(data.spec?.traceRefs)) {
    return;
  }

  // Handle both flat and envelope formats
  if (Array.isArray(data.traceRefs)) {
    data.traceRefs = data.traceRefs.filter(
      (ref: { path?: string }) => !ref.path || !pathsToRemove.has(ref.path),
    );
  }
  if (Array.isArray(data.spec?.traceRefs)) {
    data.spec.traceRefs = data.spec.traceRefs.filter(
      (ref: { path?: string }) => !ref.path || !pathsToRemove.has(ref.path),
    );
  }

  if (isJson) {
    writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  } else {
    writeFileSync(filePath, stringifyYaml(data), "utf-8");
  }
}
