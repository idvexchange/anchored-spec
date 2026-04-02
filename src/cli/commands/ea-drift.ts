/**
 * anchored-spec ea drift
 *
 * Run the EA drift engine against loaded artifacts.
 */

import { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EaRoot,
  resolveConfigV1,
  detectEaDrift,
  EA_DOMAINS,
  createResolverCache,
} from "../../ea/index.js";
import { getEntitySchema } from "../../ea/backstage/accessors.js";
import { extractFactsFromDocs } from "../../ea/resolvers/markdown.js";
import { checkConsistency } from "../../ea/facts/consistency.js";
import type { ConsistencyReport } from "../../ea/facts/consistency.js";
import { reconcileFactsWithArtifacts } from "../../ea/facts/reconciler.js";
import type { ReconciliationReport } from "../../ea/facts/reconciler.js";
import { applySuppressions, collectSuppressions } from "../../ea/facts/suppression.js";
import { CliError } from "../errors.js";
import { renderExplanationList } from "../../ea/evidence-renderer.js";
import type { ExplainableItem } from "../../ea/evidence-renderer.js";

export function eaDriftCommand(): Command {
  return new Command("drift")
    .description("Detect EA drift across all domains")
    .option("--domain <domain>", "Filter to specific domain")
    .option("--severity <level>", "Filter findings by minimum severity: error, warning, info")
    .option("--json", "Output as JSON")
    .option("--fail-on-warning", "Exit with code 1 on warnings (not just errors)")
    .option("--kind <kind>", "Filter by fact kind (for docs domain): events, states, endpoints, etc.")
    .option("--include-artifacts", "Include fact-to-artifact reconciliation (for docs domain)")
    .option("--source <path>", "Source path to scan for docs domain")
    .option("--max-cache-age <seconds>", "Maximum cache age in seconds")
    .option("--no-cache", "Disable resolver cache")
    .option("--from-snapshot <path>", "Use a snapshot file instead of live resolvers")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--explain", "Show detailed rationale for each drift finding")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec init' first.",
          2,
        );
      }

       const result = await root.loadEntities();

      // Validate domain filter
      const domainFilter = options.domain as string | undefined;
      const DRIFT_DOMAINS = [...EA_DOMAINS, "docs"] as const;
      if (domainFilter && !DRIFT_DOMAINS.includes(domainFilter as (typeof DRIFT_DOMAINS)[number])) {
        throw new CliError(
          `Unknown domain "${domainFilter}". Available: ${DRIFT_DOMAINS.join(", ")}`,
          2,
        );
      }

      // ── docs domain: consistency engine path ────────────────────────
      if (domainFilter === "docs") {
        // Extract facts from all docs
        const manifests = await extractFactsFromDocs(cwd, options.source as string | undefined);

        if (manifests.length === 0) {
          if (!options.json) {
            console.log(chalk.yellow("⚠ No markdown files found — skipping consistency check."));
          }
          return;
        }

        // Map from fact kind CLI name to FactKind
        const kindFilter = options.kind as string | undefined;

        // Run consistency checks
        const consistencyReport: ConsistencyReport = checkConsistency(manifests, { kindFilter });

        // Optionally run artifact reconciliation
        let reconciliationReport: ReconciliationReport | undefined;
        if (options.includeArtifacts) {
          reconciliationReport = reconcileFactsWithArtifacts(manifests, result.entities);
        }

        // Apply suppressions from manifests (carried through from parsing)
        const suppressions = collectSuppressions(manifests);
        applySuppressions(consistencyReport.findings, suppressions);
        if (reconciliationReport) {
          applySuppressions(reconciliationReport.findings, suppressions);
        }

        // Output (JSON or text)
        if (options.json) {
          process.stdout.write(JSON.stringify({
            consistency: consistencyReport,
            reconciliation: reconciliationReport,
          }, null, 2) + "\n");
        } else {
          // Text output following existing drift report pattern
          const passed = consistencyReport.passed && (reconciliationReport?.passed ?? true);
          const status = passed ? chalk.green("✅ PASSED") : chalk.red("❌ FAILED");
          console.log(`Doc Consistency Check — ${status}\n`);
          console.log(`  Errors: ${consistencyReport.errors}`);
          console.log(`  Warnings: ${consistencyReport.warnings}`);
          console.log(`  Facts analyzed: ${consistencyReport.factsAnalyzed}`);
          console.log(`  Documents analyzed: ${consistencyReport.documentsAnalyzed}`);
          console.log("");

          const allFindings = [
            ...consistencyReport.findings,
            ...(reconciliationReport?.findings ?? []),
          ].filter(f => !f.suppressed);

          if (allFindings.length > 0) {
            console.log("  Findings:");
            for (const f of allFindings) {
              const icon = f.severity === "error" ? chalk.red("✗") : chalk.yellow("⚠");
              console.log(`    ${icon} [${f.severity}] ${f.message}`);
              for (const loc of f.locations) {
                console.log(chalk.dim(`        ${loc.file}:${loc.line} → "${loc.value}"`));
              }
              if (f.suggestion) {
                console.log(chalk.dim(`      Suggestion: ${f.suggestion}`));
              }
            }
            console.log("");
          }

          if (reconciliationReport) {
            console.log(`  Artifact reconciliation: ${reconciliationReport.passed ? "✅" : "❌"}`);
            console.log(`    Facts checked: ${reconciliationReport.factsChecked}`);
            console.log(`    Entities checked: ${reconciliationReport.entitiesChecked}`);
            console.log("");
          }
        }

        if (!consistencyReport.passed || (reconciliationReport && !reconciliationReport.passed)) {
          throw new CliError("", 1);
        }
        const totalWarnings = consistencyReport.warnings +
          (reconciliationReport?.findings.filter(f => f.severity === "warning" && !f.suppressed).length ?? 0);
        if (options.failOnWarning && totalWarnings > 0) {
          throw new CliError("", 1);
        }

        return;
      }

      // Collect exception entities
      const exceptionEntities = result.entities.filter(
        (entity) => getEntitySchema(entity) === "exception",
      );

      // Build resolver cache
      const cache = createResolverCache(process.cwd(), {
        noCache: options.cache === false,
        maxCacheAge: options.maxCacheAge ? parseInt(options.maxCacheAge as string, 10) : undefined,
      });

      // Load snapshot if provided
      let snapshotData: Record<string, unknown> | undefined;
      if (options.fromSnapshot) {
        const snapPath = resolve(options.fromSnapshot as string);
        if (!existsSync(snapPath)) {
          throw new CliError(`Snapshot file not found: ${snapPath}`, 2);
        }
        try {
          snapshotData = JSON.parse(readFileSync(snapPath, "utf-8")) as Record<string, unknown>;
        } catch {
          throw new CliError(`Failed to parse snapshot file: ${snapPath}`, 2);
        }
      }

      const report = detectEaDrift({
        artifacts: result.entities,
        exceptions: exceptionEntities,
        domains: domainFilter ? [domainFilter] : undefined,
        includeResolverRules: !!options.fromSnapshot || options.cache !== false,
        cache,
        snapshot: snapshotData,
      });

      // Filter by severity
      const severityFilter = options.severity as string | undefined;
      let filteredFindings = report.findings.filter((f) => !f.suppressed);
      if (severityFilter) {
        const levels = ["error", "warning", "info"];
        const minIdx = levels.indexOf(severityFilter);
        if (minIdx === -1) {
          throw new CliError(
            `Unknown severity "${severityFilter}". Available: error, warning, info`,
            2,
          );
        }
        filteredFindings = filteredFindings.filter(
          (f) => levels.indexOf(f.severity) <= minIdx,
        );
      }

      // JSON output
      if (options.json) {
        if (options.explain) {
          const explained = driftFindingsToExplainableItems(filteredFindings);
          const jsonOut = { ...report, explanations: JSON.parse(renderExplanationList(explained, "json")) };
          process.stdout.write(JSON.stringify(jsonOut, null, 2) + "\n");
        } else {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        }
      } else {
        // Text output
        const status = report.passed ? chalk.green("✅ PASSED") : chalk.red("❌ FAILED");
        console.log(`EA Drift Check — ${status}\n`);

        console.log(`  Errors: ${report.summary.errors}`);
        console.log(`  Warnings: ${report.summary.warnings}`);
        console.log(`  Suppressed: ${report.summary.suppressed}`);
        console.log(`  Rules evaluated: ${report.summary.rulesEvaluated}`);
        console.log("");

        // Domain heatmap
        if (Object.keys(report.byDomain).length > 0) {
          console.log("  By domain:");
          for (const [domain, counts] of Object.entries(report.byDomain)) {
            const icon = counts.errors > 0 ? "🔴" : counts.warnings > 0 ? "🟡" : "🟢";
            console.log(
              `    ${icon} ${domain}: ${counts.errors} errors, ${counts.warnings} warnings`,
            );
          }
          console.log("");
        }

        // Findings
        if (filteredFindings.length > 0) {
          console.log("  Findings:");
          for (const f of filteredFindings) {
            const icon = f.severity === "error" ? chalk.red("✗") : chalk.yellow("⚠");
            console.log(`    ${icon} [${f.severity}] ${f.message}`);
          }
          console.log("");
        }

        // Explain section
        if (options.explain && filteredFindings.length > 0) {
          const explained = driftFindingsToExplainableItems(filteredFindings);
          process.stdout.write("## Explanations\n\n" + renderExplanationList(explained, "markdown") + "\n");
        }
      }

      // Exit code
      if (!report.passed) {
        throw new CliError("", 1);
      }
      if (options.failOnWarning && report.summary.warnings > 0) {
        throw new CliError("", 1);
      }
    });
}

// ─── Explain helper ─────────────────────────────────────────────────

interface DriftFindingLike {
  rule: string;
  severity: string;
  artifactId: string;
  path: string;
  domain: string;
  message: string;
  suggestion?: string;
}

function driftFindingsToExplainableItems(findings: DriftFindingLike[]): ExplainableItem[] {
  return findings.map((f) => {
    const evidence: string[] = [];
    evidence.push(`Rule: ${f.rule}`);
    evidence.push(`Severity: ${f.severity}`);
    evidence.push(`Domain: ${f.domain}`);
    if (f.path) evidence.push(`Path: ${f.path}`);
    if (f.suggestion) evidence.push(`Suggestion: ${f.suggestion}`);

    return {
      ref: f.artifactId,
      kind: f.domain,
      reason: f.message,
      evidence,
    };
  });
}
