/**
 * anchored-spec ea evidence
 *
 * Ingest, validate, and summarize EA evidence records.
 */

import { Command } from "commander";
import chalk from "chalk";
import { join } from "node:path";
import {
  EaRoot,
  resolveConfigV1,
  createEaEvidenceRecord,
  loadEaEvidence,
  writeEaEvidence,
  mergeEaEvidence,
  validateEaEvidence,
  summarizeEaEvidence,
  EA_EVIDENCE_KINDS,
} from "../../ea/index.js";
import type { EaEvidenceKind, EaEvidenceRecord } from "../../ea/index.js";
import { getEntityId } from "../../ea/backstage/accessors.js";
import { buildEntityLookup, suggestEntities } from "../entity-ref.js";
import { CliError } from "../errors.js";

export function eaEvidenceCommand(): Command {
  const cmd = new Command("evidence")
    .description("Manage EA evidence records");

  cmd
    .command("ingest")
    .description("Ingest evidence for an entity")
    .requiredOption("--entity <entity-ref>", "Entity ref")
    .requiredOption("--kind <kind>", `Evidence kind: ${EA_EVIDENCE_KINDS.join(", ")}`)
    .requiredOption("--status <status>", "Evidence status: passed, failed, skipped, error")
    .requiredOption("--source <source>", "Source tool or file that produced this evidence")
    .option("--summary <text>", "Human-readable summary")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--output <path>", "Evidence file path")
    .action(async (options) => {
      const kind = options.kind as string;
      if (!EA_EVIDENCE_KINDS.includes(kind as EaEvidenceKind)) {
        throw new CliError(
          `Unknown evidence kind "${kind}". Available: ${EA_EVIDENCE_KINDS.join(", ")}`,
          2
        );
      }

      const status = options.status as EaEvidenceRecord["status"];
      if (!["passed", "failed", "skipped", "error"].includes(status)) {
        throw new CliError(
          `Unknown status "${status}". Available: passed, failed, skipped, error`,
          2
        );
      }

      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const evidencePath = options.output ?? join(cwd, eaConfig.rootDir, "evidence", "ea-evidence.json");
      const entityInput = options.entity as string;

      const root = new EaRoot(cwd, eaConfig);
      if (!root.isInitialized()) {
        throw new CliError("EA not initialized. Run 'anchored-spec init' first.", 2);
      }

      const result = await root.loadEntities();
      const lookup = buildEntityLookup(result.entities);
      const entity = lookup.byInput.get(entityInput);
      if (!entity) {
        const similar = suggestEntities(entityInput, result.entities);
        const hint = similar.length > 0 ? `\n  Did you mean: ${similar.join(", ")}?` : "";
        throw new CliError(`Entity "${entityInput}" not found.${hint}`, 2);
      }

      const entityRef = getEntityId(entity);
      const record = createEaEvidenceRecord(
        entityRef,
        kind as EaEvidenceKind,
        status,
        options.source as string,
        { summary: options.summary as string | undefined },
      );

      const existing = loadEaEvidence(evidencePath);
      const merged = mergeEaEvidence(existing, [record]);
      writeEaEvidence(merged, evidencePath);

      console.log(chalk.green(`✓ Evidence ingested for ${entityRef}`));
      console.log(chalk.dim(`  Kind: ${kind} | Status: ${status}`));
      console.log(chalk.dim(`  Output: ${evidencePath}`));
      console.log(chalk.dim(`  Total records: ${merged.records.length}`));
    });

  cmd
    .command("validate")
    .description("Validate EA evidence for freshness and coverage")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--evidence <path>", "Evidence file path")
    .option("--freshness <days>", "Freshness window in days", "30")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError("EA not initialized. Run 'anchored-spec init' first.", 2);
      }

      const evidencePath = options.evidence ?? join(cwd, eaConfig.rootDir, "evidence", "ea-evidence.json");
      const evidence = loadEaEvidence(evidencePath);

      if (!evidence) {
        throw new CliError(`Evidence file not found: ${evidencePath}`, 2);
      }

      const result = await root.loadEntities();
      const freshnessDays = parseInt(options.freshness as string, 10) || 30;
      const issues = validateEaEvidence(evidence, result.entities, { freshnessWindowDays: freshnessDays });

      console.log(chalk.blue("🔍 Validating EA evidence\n"));

      if (issues.length === 0) {
        console.log(chalk.green("  ✓ All evidence is valid and fresh."));
      } else {
        const errors = issues.filter((i) => i.severity === "error");
        const warnings = issues.filter((i) => i.severity === "warning");

        if (errors.length > 0) {
          console.log(chalk.red(`  ✗ ${errors.length} error(s):`));
          for (const e of errors) {
            console.log(chalk.red(`    ${e.path}: ${e.message}`));
          }
        }
        if (warnings.length > 0) {
          console.log(chalk.yellow(`  ⚠ ${warnings.length} warning(s):`));
          for (const w of warnings) {
            console.log(chalk.yellow(`    ${w.path}: ${w.message}`));
          }
        }

        if (errors.length > 0) {
          throw new CliError("", 1);
        }
      }
    });

  cmd
    .command("summary")
    .description("Show EA evidence summary")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--evidence <path>", "Evidence file path")
    .option("--freshness <days>", "Freshness window in days", "30")
    .option("--format <format>", "Output format: text, json", "text")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError("EA not initialized. Run 'anchored-spec init' first.", 2);
      }

      const evidencePath = options.evidence ?? join(cwd, eaConfig.rootDir, "evidence", "ea-evidence.json");
      const evidence = loadEaEvidence(evidencePath);

      if (!evidence) {
        throw new CliError(`Evidence file not found: ${evidencePath}`, 2);
      }

      const result = await root.loadEntities();
      const freshnessDays = parseInt(options.freshness as string, 10) || 30;
      const summary = summarizeEaEvidence(evidence, result.entities, { freshnessWindowDays: freshnessDays });

      if (options.format === "json") {
        process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
      } else {
        console.log(chalk.blue("📊 EA Evidence Summary\n"));
        console.log(`  Total records: ${summary.totalRecords}`);
        console.log(`  Covered entities: ${summary.coveredArtifacts}`);
        console.log(`  Uncovered entities: ${summary.uncoveredArtifacts}`);
        console.log(`  Stale records: ${summary.staleCount}`);
        console.log("");
        console.log("  By evidence kind:");
        for (const [kind, count] of Object.entries(summary.byEvidenceKind)) {
          console.log(`    ${kind}: ${count}`);
        }
        console.log("");
        console.log("  By status:");
        for (const [status, count] of Object.entries(summary.byStatus)) {
          const icon = status === "passed" ? "✅" : status === "failed" ? "❌" : "⚠️";
          console.log(`    ${icon} ${status}: ${count}`);
        }
      }
    });

  return cmd;
}
