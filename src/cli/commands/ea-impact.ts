/**
 * anchored-spec ea impact
 *
 * Compute transitive impact analysis for an entity.
 * Shows all downstream entities that would be affected by changes to the target.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import {
  EaRoot,
  createDefaultRegistry,
  buildRelationGraph,
  loadProjectConfig,
  getConfiguredDocScanDirs,
  analyzeImpact,
  renderImpactReportMarkdown,
} from "../../ea/index.js";
import type { ImpactOptions, ImpactReport, ImpactedEntity } from "../../ea/index.js";
import { renderExplanationList } from "../../ea/evidence-renderer.js";
import type { ExplainableItem } from "../../ea/evidence-renderer.js";
import { resolveFromFiles, resolveFromDiff } from "../../ea/reverse-resolution.js";
import { scanDocs } from "../../ea/docs/scanner.js";
import { getEntityId } from "../../ea/backstage/index.js";
import { buildEntityLookup, formatEntityDisplay, suggestEntities } from "../entity-ref.js";
import { CliError } from "../errors.js";

export function eaImpactCommand(): Command {
  return new Command("impact")
    .description("Analyze transitive impact of an entity")
    .argument("[entity-ref]", "Entity ref to analyze")
    .option("--format <format>", "Output format: markdown, json", "markdown")
    .option("--output <file>", "Write to file instead of stdout")
    .option("--max-depth <n>", "Maximum traversal depth")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--from-file <path>", "Resolve file to entity refs, then analyze impact")
    .option("--from-diff [ref]", "Resolve git diff to entity refs, then analyze impact")
    .option("--staged", "Use staged changes with --from-diff")
    .option("--sort <field>", "Sort results by: score (default), depth", "score")
    .option("--min-score <n>", "Filter results below this score threshold")
    .option("--max-results <n>", "Maximum number of results to return")
    .option("--view <mode>", "View mode: summary, code, contracts, docs, constraints, graph, llm, domain", "summary")
    .option("--explain", "Show detailed rationale for each impacted entity")
    .option("--fail-on-impact", "Exit with code 1 if any impacted entities found (CI gate)")
    .action(async (entityInput: string | undefined, options) => {
      const cwd = process.cwd();
      const eaConfig = loadProjectConfig(cwd, options.rootDir);
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec init' first.",
          2,
        );
      }

      const result = await root.loadEntities();

      if (result.entities.length === 0) {
        console.log(chalk.yellow("No entities found."));
        return;
      }

      // Build graph
      const registry = createDefaultRegistry();
      const entities = result.entities;
      const graph = buildRelationGraph(entities, registry);
      const lookup = buildEntityLookup(entities);

      // Determine entity refs to analyze
      let entityRefs: string[] = [];
      const docDirs = getConfiguredDocScanDirs(eaConfig);

      if (options.fromFile) {
        // Resolve from file path
        const scanned = scanDocs(cwd, docDirs ? { dirs: docDirs } : undefined);
        const resolutions = resolveFromFiles(
          [options.fromFile as string],
          entities,
          scanned.docs,
          cwd,
        );
        if (resolutions.length === 0) {
          throw new CliError(
            `No entities resolved from file: ${options.fromFile}`,
            2,
          );
        }
        console.error(
          chalk.dim(`Resolved ${resolutions.length} entity ref(s) from file: ${options.fromFile}`),
        );
        for (const r of resolutions) {
          console.error(chalk.dim(`  → ${r.resolvedEntityRef} (${r.confidence})`));
        }
        entityRefs = [...new Set(resolutions.map((r) => r.resolvedEntityRef))];
      } else if (options.fromDiff !== undefined) {
        // Resolve from git diff
        const scanned = scanDocs(cwd, docDirs ? { dirs: docDirs } : undefined);
        const diffRef = typeof options.fromDiff === "string" ? options.fromDiff : undefined;
        const resolutions = resolveFromDiff(
          {
            staged: !!options.staged,
            refRange: diffRef,
          },
          entities,
          scanned.docs,
          cwd,
        );
        if (resolutions.length === 0) {
          throw new CliError(
            "No entities resolved from diff. Are there changed files?",
            2,
          );
        }
        console.error(
          chalk.dim(`Resolved ${resolutions.length} entity ref(s) from diff`),
        );
        for (const r of resolutions) {
          console.error(chalk.dim(`  → ${r.resolvedEntityRef} (${r.confidence}, ${r.inputValue})`));
        }
        entityRefs = [...new Set(resolutions.map((r) => r.resolvedEntityRef))];
      } else if (entityInput) {
        // Direct entity ref input
        const targetEntity = lookup.byInput.get(entityInput);
        const resolvedId = targetEntity ? getEntityId(targetEntity) : entityInput;

        if (!graph.node(resolvedId)) {
          const similar = suggestEntities(entityInput, entities);
          const hint = similar.length > 0 ? `\n  Did you mean: ${similar.join(", ")}?` : "";
          throw new CliError(
            `Entity "${entityInput}" not found.${hint}`,
            2,
          );
        }

        entityRefs = [resolvedId];

        if (targetEntity) {
          console.error(chalk.dim(`Target: ${formatEntityDisplay(targetEntity)}`));
        }
      } else {
        throw new CliError(
          "No input specified. Provide <entity-ref>, --from-file, or --from-diff.",
          2,
        );
      }

      // Build impact options
      const impactOptions: ImpactOptions = {
        maxDepth: options.maxDepth ? parseInt(options.maxDepth as string, 10) : undefined,
        minScore: options.minScore ? parseFloat(options.minScore as string) : undefined,
        maxResults: options.maxResults ? parseInt(options.maxResults as string, 10) : undefined,
        sortBy: (options.sort as "score" | "depth") ?? "score",
      };

      // Analyze impact for each resolved entity ref
      let mergedReport: ImpactReport | undefined;
      for (const ref of entityRefs) {
        const report = analyzeImpact(graph, ref, impactOptions);
        if (!mergedReport) {
          mergedReport = report;
        } else {
          // Merge reports: keep higher score when duplicate
          const existingById = new Map(mergedReport.impacted.map((e, i) => [e.id, i]));
          for (const entity of report.impacted) {
            const existingIdx = existingById.get(entity.id);
            if (existingIdx === undefined) {
              existingById.set(entity.id, mergedReport.impacted.length);
              mergedReport.impacted.push(entity);
            } else if (entity.score > mergedReport.impacted[existingIdx]!.score) {
              mergedReport.impacted[existingIdx] = entity;
            }
          }
          mergedReport.totalImpacted = mergedReport.impacted.length;
          mergedReport.maxDepth = Math.max(mergedReport.maxDepth, report.maxDepth);
          mergedReport.sourceRef = entityRefs.length > 1
            ? entityRefs.join(", ")
            : mergedReport.sourceRef;
          mergedReport.sourceTitle = entityRefs.length > 1
            ? `${entityRefs.length} entities`
            : mergedReport.sourceTitle;

          // Rebuild domain and category groupings
          const domainMap = new Map<string, typeof mergedReport.impacted>();
          const categoryMap = new Map<string, typeof mergedReport.impacted>();
          for (const e of mergedReport.impacted) {
            {
              const list = domainMap.get(e.domain) ?? [];
              list.push(e);
              domainMap.set(e.domain, list);
            }
            {
              const list = categoryMap.get(e.category) ?? [];
              list.push(e);
              categoryMap.set(e.category, list);
            }
          }
          mergedReport.byDomain = Array.from(domainMap.entries())
            .map(([domain, ents]) => ({ domain, count: ents.length, entities: ents }))
            .sort((a, b) => b.count - a.count);
          mergedReport.byCategory = Array.from(categoryMap.entries())
            .map(([category, ents]) => ({
              category: category as import("../../ea/index.js").ImpactCategory,
              count: ents.length,
              entities: ents,
            }))
            .sort((a, b) => b.count - a.count);
        }
      }

      if (!mergedReport) {
        throw new CliError("No impact report generated.", 2);
      }

      const report = mergedReport;

      // Output based on view mode
      let output: string;
      if (options.format === "json") {
        if (options.explain) {
          const explained = impactedToExplainableItems(report.impacted, report.sourceRef);
          const jsonOut = { ...report, explanations: JSON.parse(renderExplanationList(explained, "json")) };
          output = JSON.stringify(jsonOut, null, 2) + "\n";
        } else {
          output = JSON.stringify(report, null, 2) + "\n";
        }
      } else {
        const viewMode = options.view as string;
        switch (viewMode) {
          case "domain":
            output = renderDomainView(report);
            break;
          case "summary":
          default:
            output = renderImpactReportMarkdown(report);
            break;
          // Future view modes stub through to default
          case "code":
          case "contracts":
          case "docs":
          case "constraints":
          case "graph":
          case "llm":
            output = renderImpactReportMarkdown(report);
            break;
        }
      }

      // Append explain section for markdown output
      if (options.explain && options.format !== "json") {
        const explained = impactedToExplainableItems(report.impacted, report.sourceRef);
        output += "\n## Explanations\n\n" + renderExplanationList(explained, "markdown");
      }

      if (options.output) {
        writeFileSync(options.output as string, output);
        console.log(chalk.green(`✓ Impact report written to ${options.output}`));
      } else {
        process.stdout.write(output);
      }

      // Summary line
      if (report.totalImpacted > 0) {
        console.error(
          chalk.yellow(
            `⚠ ${report.totalImpacted} entit${report.totalImpacted === 1 ? "y" : "ies"} impacted across ${report.byDomain.length} domain(s)`,
          ),
        );
      } else {
        console.error(chalk.green("✓ No downstream impacts found."));
      }

      // CI gate
      if (options.failOnImpact && report.totalImpacted > 0) {
        process.exitCode = 1;
      }
    });
}

function renderDomainView(report: ImpactReport): string {
  const lines: string[] = [];

  lines.push(`# Impact Analysis: ${report.sourceTitle}`);
  lines.push("");
  lines.push(`> Source: \`${report.sourceRef}\` (${report.sourceKind})`);
  lines.push(`> Total impacted: ${report.totalImpacted} entit${report.totalImpacted === 1 ? "y" : "ies"}, max depth: ${report.maxDepth}`);
  lines.push("");

  if (report.totalImpacted === 0) {
    lines.push("_No downstream impacts found._");
    lines.push("");
    return lines.join("\n");
  }

  for (const ds of report.byDomain) {
    lines.push(`## ${ds.domain} (${ds.count})`);
    lines.push("");
    lines.push("| Score | Depth | ID | Kind | Category | Via |");
    lines.push("|-------|-------|----|------|----------|-----|");
    for (const e of ds.entities) {
      lines.push(`| ${e.score.toFixed(2)} | ${e.depth} | \`${e.id}\` | ${e.kind} | ${e.category} | ${e.viaRelations.join(", ")} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function impactedToExplainableItems(entities: ImpactedEntity[], sourceRef: string): ExplainableItem[] {
  return entities.map((e) => {
    const viaStr = e.viaRelations.join(", ");
    const reason = e.depth === 1
      ? `Directly depends on ${sourceRef} via \`${viaStr}\` relation (depth ${e.depth})`
      : `Transitively impacted via \`${viaStr}\` relation at depth ${e.depth} from ${sourceRef}`;

    return {
      ref: e.id,
      kind: e.kind,
      title: e.title,
      reason,
      evidence: [
        `Impact score: ${e.score.toFixed(2)}`,
        `Category: ${e.category}`,
        `Confidence: ${e.confidence}`,
      ],
      scoreBreakdown: e.scoreBreakdown
        ? { ...e.scoreBreakdown }
        : undefined,
    };
  });
}
