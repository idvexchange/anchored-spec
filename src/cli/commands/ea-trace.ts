/**
 * anchored-spec ea trace
 *
 * Show the traceability web between EA artifacts (`traceRefs`) and
 * markdown documents (frontmatter `ea-artifacts`).  Supports single-target
 * lookup, orphan detection, full bidirectional integrity checks, and
 * summary statistics.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import chalk from "chalk";
import { EaRoot } from "../../ea/loader.js";
import { resolveEaConfig } from "../../ea/config.js";
import type { EaArtifactBase } from "../../ea/types.js";
import { artifactToBackstage } from "../../ea/backstage/bridge.js";
import { scanDocs, buildDocIndex } from "../../ea/docs/scanner.js";
import type { ScannedDoc } from "../../ea/docs/scanner.js";
import { buildTraceLinks, buildTraceCheckReport, isUrl } from "../../ea/trace-analysis.js";
import type { TraceLink, TraceCheckReport } from "../../ea/trace-analysis.js";
import { scanSourceAnnotations } from "../../ea/source-scanner.js";
import type { AnchoredSpecConfigV1 } from "../../ea/config.js";
import { CliError } from "../errors.js";

// ─── Helpers ──────────────────────────────────────────────────────────

/** Heuristic: artifact IDs contain uppercase + hyphens and no `/` or `\`. */
function looksLikeArtifactId(value: string): boolean {
  return /[A-Z]/.test(value) && value.includes("-") && !/[/\\]/.test(value);
}

interface SummaryReport {
  artifactsWithTraceRefs: number;
  totalArtifacts: number;
  docsWithEaArtifacts: number;
  totalDocsScanned: number;
  totalTraceLinks: number;
  totalFrontmatterRefs: number;
  bidirectionalPairs: number;
  oneWayPairs: number;
}

function buildSummaryReport(
  artifacts: EaArtifactBase[],
  docs: ScannedDoc[],
  totalScanned: number,
  links: TraceLink[],
): SummaryReport {
  const check = buildTraceCheckReport(links);
  const artifactsWithRefs = new Set(
    artifacts.filter((a) => (a.traceRefs?.length ?? 0) > 0).map((a) => a.id),
  ).size;
  const totalTraceLinks = links.filter((l) => l.artifactToDoc).length;
  const totalFmRefs = links.filter((l) => l.docToArtifact).length;

  return {
    artifactsWithTraceRefs: artifactsWithRefs,
    totalArtifacts: artifacts.length,
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

function renderTargetArtifact(
  artifact: EaArtifactBase,
  docs: ScannedDoc[],
  cwd: string,
): string {
  const lines: string[] = [];
  const docIndex = buildDocIndex(docs);
  const referencingDocs = docIndex.get(artifact.id) ?? [];

  lines.push(
    chalk.bold(`${artifact.id}`) +
      chalk.dim(` (${artifact.kind}, ${artifact.status})`),
  );

  // traceRefs
  const refs = artifact.traceRefs ?? [];
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
  artifactMap: Map<string, EaArtifactBase>,
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
      const artifact = artifactMap.get(aid);
      if (!artifact) {
        lines.push(`    → ${aid} ${chalk.red("❌ (artifact not found)")}`);
        continue;
      }
      const hasTraceBack = (artifact.traceRefs ?? []).some(
        (r) => r.path === doc.relativePath,
      );
      if (hasTraceBack) {
        lines.push(
          `    → ${aid} ${chalk.green("✅ (exists, has traceRef back)")}`,
        );
      } else {
        lines.push(
          `    → ${aid} ${chalk.yellow("⚠ (exists, NO traceRef back)")}`,
        );
      }
    }
  }

  return lines.join("\n");
}

function renderOrphans(
  docs: ScannedDoc[],
  artifactMap: Map<string, EaArtifactBase>,
): string {
  const lines: string[] = [];
  let orphanDocs = 0;
  let missingLinks = 0;

  for (const doc of docs) {
    const orphanIds = doc.artifactIds.filter((aid) => {
      const a = artifactMap.get(aid);
      if (!a) return false; // artifact doesn't exist — different issue
      return !(a.traceRefs ?? []).some((r) => r.path === doc.relativePath);
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
      "Orphaned documents (frontmatter → artifact, but no traceRef back):",
    ) + "\n";
  const footer = `${orphanDocs} document${orphanDocs === 1 ? "" : "s"}, ${missingLinks} missing backlink${missingLinks === 1 ? "" : "s"}`;

  return header + "\n" + lines.join("\n") + footer;
}

function renderCheck(report: TraceCheckReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold("Bidirectional Trace Integrity Check\n"));

  // Broken traceRefs
  if (report.brokenTraceRefs.length > 0) {
    lines.push("  Artifacts with broken traceRefs:");
    for (const b of report.brokenTraceRefs) {
      lines.push(`    ${chalk.red("❌")} ${b.artifactId} → ${b.path} (${b.reason})`);
    }
    lines.push("");
  }

  // One-way artifact → doc
  if (report.oneWayArtifactToDoc.length > 0) {
    const actionable = report.oneWayArtifactToDoc.filter(
      (o) => o.severity === "warning",
    );
    const structural = report.oneWayArtifactToDoc.filter(
      (o) => o.severity === "info",
    );

    if (actionable.length > 0) {
      lines.push("  Artifacts with one-way traceRefs (actionable — missing frontmatter):");
      for (const o of actionable) {
        lines.push(`    ${chalk.yellow("⚠")} ${o.artifactId} → ${o.path} (${o.reason})`);
      }
      lines.push("");
    }
    if (structural.length > 0) {
      lines.push("  Artifacts with one-way traceRefs (structural — non-markdown files):");
      for (const o of structural) {
        lines.push(`    ${chalk.blue("ℹ")} ${o.artifactId} → ${o.path} (${o.reason})`);
      }
      lines.push("");
    }
  }

  // One-way doc → artifact
  if (report.oneWayDocToArtifact.length > 0) {
    lines.push("  Docs with one-way frontmatter (no traceRef back):");
    for (const o of report.oneWayDocToArtifact) {
      lines.push(`    ${chalk.yellow("⚠")} ${o.docPath} → ${o.artifactId} (no traceRef in artifact)`);
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
  lines.push(`  One-way artifact→doc (actionable): ${actionableOneWay} ${chalk.yellow("⚠")}`);
  lines.push(`  One-way artifact→doc (structural): ${structuralOneWay} ${chalk.blue("ℹ")}`);
  lines.push(`  One-way doc→artifact: ${report.oneWayDocToArtifact.length} ${chalk.yellow("⚠")}`);
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
  lines.push(`  Artifacts with traceRefs: ${report.artifactsWithTraceRefs} / ${report.totalArtifacts}`);
  lines.push(`  Documents with ea-artifacts: ${report.docsWithEaArtifacts} / ${report.totalDocsScanned} scanned`);
  lines.push(`  Total trace links (artifact→doc): ${report.totalTraceLinks}`);
  lines.push(`  Total frontmatter refs (doc→artifact): ${report.totalFrontmatterRefs}`);
  lines.push(`  Bidirectional pairs: ${report.bidirectionalPairs}`);
  lines.push(`  One-way pairs: ${report.oneWayPairs}`);
  return lines.join("\n");
}

// ─── Command ──────────────────────────────────────────────────────────

export function eaTraceCommand(): Command {
  return new Command("trace")
    .description("Show traceability web between EA artifacts and documents")
    .argument("[target]", "Artifact ID or document path to inspect")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--doc-dirs <dirs>", "Comma-separated doc directories to scan", "docs,specs,.")
    .option("--orphans", "Show orphaned docs (frontmatter refs with no traceRef back)")
    .option("--check", "Full bidirectional integrity report")
    .option("--fix-broken", "Remove traceRefs pointing to non-existent files")
    .option("--dry-run", "Show what would change without writing files")
    .option("--summary", "Show summary counts")
    .option("--source-annotations", "Include source file @anchored-spec annotations in trace analysis")
    .option("--json", "Output as JSON")
    .action(async (target: string | undefined, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, { specDir: "specs", outputDir: "output", ea: eaConfig } as never);

      if (!root.isInitialized()) {
        throw new CliError("EA not initialized. Run 'anchored-spec ea init' first.", 2);
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

      const loadResult = await root.loadArtifacts();
      const { artifacts } = loadResult;

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

      const artifactMap = new Map<string, EaArtifactBase>();
      for (const a of artifacts) artifactMap.set(a.id, a);

      const entities = artifacts.map(artifactToBackstage);

      // Build legacy ID → entity ref map for normalizing doc artifact IDs
      const { getEntityId: _getEntityId } = await import("../../ea/backstage/accessors.js");
      const { ANNOTATION_KEYS: _KEYS } = await import("../../ea/backstage/types.js");
      const legacyIdToEntityRef = new Map<string, string>();
      const entityRefToLegacyId = new Map<string, string>();
      for (const e of entities) {
        const ref = _getEntityId(e);
        const legacyId = e.metadata.annotations?.[_KEYS.LEGACY_ID] ?? ref;
        legacyIdToEntityRef.set(legacyId, ref);
        entityRefToLegacyId.set(ref, legacyId);
      }

      // Normalize doc artifactIds from legacy IDs to entity refs so trace links match
      const normalizedDocs = docs.map((d) => ({
        ...d,
        artifactIds: d.artifactIds.map((aid) => legacyIdToEntityRef.get(aid) ?? aid),
      }));

      const rawLinks = buildTraceLinks(entities, normalizedDocs, cwd);

      // Remap trace link artifact IDs back to legacy IDs for downstream CLI logic
      const links = rawLinks.map((l) => ({
        ...l,
        artifactId: entityRefToLegacyId.get(l.artifactId) ?? l.artifactId,
      }));

      // ── --fix-broken ──────────────────────────────────────────────
      if (options.fixBroken) {
        const report = buildTraceCheckReport(links);
        const toRemove = report.brokenTraceRefs.filter(
          (b) => b.reason === "file not found",
        );

        if (toRemove.length === 0) {
          if (options.json) {
            process.stdout.write(
              JSON.stringify({ removed: [], artifactsModified: 0 }, null, 2) + "\n",
            );
          } else {
            console.log(
              chalk.green("✓ No broken trace references to remove."),
            );
          }
          return;
        }

        // Group broken refs by artifact ID
        const brokenByArtifact = new Map<string, string[]>();
        for (const b of toRemove) {
          const list = brokenByArtifact.get(b.artifactId) ?? [];
          list.push(b.path);
          brokenByArtifact.set(b.artifactId, list);
        }

        const removed: { artifactId: string; path: string }[] = [];

        if (!options.dryRun) {
          for (const [artifactId, paths] of brokenByArtifact) {
            const detail = loadResult.details.find(
              (d) => d.artifact?.id === artifactId,
            );
            if (!detail) continue;

            const pathSet = new Set(paths);
            removeBrokenTraceRefs(detail.filePath, pathSet);
            for (const p of paths) {
              removed.push({ artifactId, path: p });
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
                artifactsModified: brokenByArtifact.size,
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
              `Removing ${toRemove.length} broken traceRef${toRemove.length === 1 ? "" : "s"} from ${brokenByArtifact.size} artifact${brokenByArtifact.size === 1 ? "" : "s"}:\n`,
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
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        } else {
          process.stdout.write(renderCheck(report) + "\n");
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
          for (const doc of docs) {
            const orphanIds = doc.artifactIds.filter((aid) => {
              const a = artifactMap.get(aid);
              if (!a) return false;
              return !(a.traceRefs ?? []).some((r) => r.path === doc.relativePath);
            });
            if (orphanIds.length > 0) {
              orphanData.push({ docPath: doc.relativePath, missingBacklinks: orphanIds });
            }
          }
          process.stdout.write(JSON.stringify(orphanData, null, 2) + "\n");
        } else {
          process.stdout.write(renderOrphans(docs, artifactMap) + "\n");
        }
        return;
      }

      // ── --summary ─────────────────────────────────────────────────
      if (options.summary) {
        const report = buildSummaryReport(artifacts, docs, totalScanned, links);
        if (options.json) {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        } else {
          process.stdout.write(renderSummary(report) + "\n");
        }
        return;
      }

      // ── target lookup ─────────────────────────────────────────────
      if (target) {
        if (looksLikeArtifactId(target)) {
          const artifact = artifactMap.get(target);
          if (!artifact) {
            throw new CliError(`Artifact "${target}" not found.`, 1);
          }
          if (options.json) {
            const docIndex = buildDocIndex(docs);
            process.stdout.write(
              JSON.stringify(
                {
                  artifact: {
                    id: artifact.id,
                    kind: artifact.kind,
                    status: artifact.status,
                  },
                  traceRefs: (artifact.traceRefs ?? []).map((r) => ({
                    path: r.path,
                    role: r.role ?? null,
                    isUrl: isUrl(r.path),
                    fileExists: isUrl(r.path) ? null : existsSync(resolve(cwd, r.path)),
                  })),
                  referencedBy: (docIndex.get(artifact.id) ?? []).map((d) => ({
                    path: d.relativePath,
                    bidirectional: (artifact.traceRefs ?? []).some(
                      (r) => r.path === d.relativePath,
                    ),
                  })),
                },
                null,
                2,
              ) + "\n",
            );
          } else {
            process.stdout.write(renderTargetArtifact(artifact, docs, cwd) + "\n");
          }
          return;
        }

        // Looks like a doc path
        const doc = docs.find(
          (d) => d.relativePath === target || d.path === target,
        );
        if (!doc) {
          throw new CliError(
            `Document "${target}" not found in scanned docs. Searched: ${docDirs.join(", ")}`,
            1,
          );
        }
        if (options.json) {
          process.stdout.write(
            JSON.stringify(
              {
                doc: {
                  path: doc.relativePath,
                  frontmatter: doc.frontmatter,
                },
                eaArtifacts: doc.artifactIds.map((aid) => {
                  const a = artifactMap.get(aid);
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
          process.stdout.write(renderTargetDoc(doc, artifactMap) + "\n");
        }
        return;
      }

      // ── No target, no flag — show summary as default ──────────────
      const report = buildSummaryReport(artifacts, docs, totalScanned, links);
      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      } else {
        process.stdout.write(renderSummary(report) + "\n");
      }
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
