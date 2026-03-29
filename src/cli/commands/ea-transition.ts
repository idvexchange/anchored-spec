/**
 * anchored-spec ea transition
 *
 * Advance an EA artifact to a new lifecycle status.
 * Validates lifecycle gates before allowing transitions.
 *
 * EA replacement for the core `transition` command.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { EaRoot } from "../../ea/loader.js";
import type { EaArtifactBase, ArtifactStatus } from "../../ea/types.js";
import { CliError } from "../errors.js";

const STATUS_ORDER: ArtifactStatus[] = [
  "draft",
  "planned",
  "active",
  "shipped",
  "deprecated",
  "retired",
];

function getNextStatus(current: ArtifactStatus): ArtifactStatus | null {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx === -1 || idx >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[idx + 1]!;
}

function validateTransition(
  artifact: EaArtifactBase,
  targetStatus: ArtifactStatus,
  _eaRoot: EaRoot,
): string[] {
  const errors: string[] = [];
  const currentIndex = STATUS_ORDER.indexOf(artifact.status);
  const targetIndex = STATUS_ORDER.indexOf(targetStatus);

  if (targetIndex === -1) {
    errors.push(`Invalid target status "${targetStatus}". Valid: ${STATUS_ORDER.join(", ")}`);
    return errors;
  }

  if (targetIndex <= currentIndex && targetStatus !== "deprecated" && targetStatus !== "retired") {
    errors.push(`Cannot move backward from "${artifact.status}" to "${targetStatus}".`);
    return errors;
  }

  // Gate: active requires owner
  if (targetStatus === "active") {
    if (!artifact.owners || artifact.owners.length === 0) {
      errors.push("Cannot activate: artifact has no owners.");
    }
    if (!artifact.summary || artifact.summary.trim().length < 10) {
      errors.push("Cannot activate: artifact needs a meaningful summary (≥10 chars).");
    }
  }

  // Gate: shipped requires at least one relation
  if (targetStatus === "shipped") {
    if (!artifact.relations || artifact.relations.length === 0) {
      errors.push("Cannot ship: artifact has no relations. Link it to other artifacts first.");
    }
  }

  return errors;
}

export function eaTransitionCommand(): Command {
  return new Command("transition")
    .description("Advance an EA artifact to a new lifecycle status")
    .argument("<artifact-id>", "EA artifact ID")
    .option("--to <status>", "Target status (default: next in lifecycle)")
    .option("--force", "Skip gate validation")
    .option("--dry-run", "Show what would happen without writing")
    .action(async (artifactId: string, options) => {
      const cwd = process.cwd();
      const eaRoot = EaRoot.fromDirectory(cwd);

      if (!eaRoot || !eaRoot.isInitialized()) {
        throw new CliError("Error: EA not initialized. Run 'anchored-spec ea init' first.");
      }

      const loadResult = await eaRoot.loadArtifacts();
      const detail = loadResult.details.find((d) => d.artifact?.id === artifactId);

      if (!detail?.artifact) {
        const similar = loadResult.artifacts
          .filter((a) => a.id.includes(artifactId.split("-").pop() ?? ""))
          .map((a) => a.id);
        const hint = similar.length > 0 ? `\n  Did you mean: ${similar.join(", ")}?` : "";
        throw new CliError(`Error: Artifact "${artifactId}" not found.${hint}`);
      }

      const artifact = detail.artifact;
      const targetStatus = (options.to as ArtifactStatus) ?? getNextStatus(artifact.status);

      if (!targetStatus) {
        console.log(chalk.yellow(`Artifact "${artifactId}" is already at terminal status "${artifact.status}".`));
        return;
      }

      console.log(chalk.blue(`🔄 Transition: ${artifactId}`));
      console.log(chalk.dim(`  ${artifact.status} → ${targetStatus}`));

      if (!options.force) {
        const errors = validateTransition(artifact, targetStatus, eaRoot);
        if (errors.length > 0) {
          console.log(chalk.red("\n  ✗ Gate validation failed:"));
          for (const err of errors) {
            console.log(chalk.red(`    • ${err}`));
          }
          console.log(chalk.dim("\n  Use --force to skip validation."));
          throw new CliError("", 1);
        }
      }

      if (options.dryRun) {
        console.log(chalk.yellow(`\n  [DRY RUN] Would update status to "${targetStatus}".`));
        return;
      }

      // Read, update, and write the file
      const filePath = detail.filePath;
      const content = readFileSync(filePath, "utf-8");
      const ext = filePath.toLowerCase();

      if (ext.endsWith(".json")) {
        const data = JSON.parse(content);
        data.status = targetStatus;
        writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
      } else if (ext.endsWith(".yaml") || ext.endsWith(".yml")) {
        // Simple YAML status replacement
        const updated = content.replace(
          /(\s+status:\s+)(\S+)/,
          `$1${targetStatus}`,
        );
        writeFileSync(filePath, updated);
      }

      console.log(chalk.green(`\n  ✓ Status updated: ${artifact.status} → ${targetStatus}`));
      console.log(chalk.dim(`  File: ${relative(cwd, filePath)}`));

      const next = getNextStatus(targetStatus);
      if (next) {
        console.log(chalk.dim(`\n  Next status: ${next}`));
      } else {
        console.log(chalk.dim(`\n  This artifact is now at terminal status.`));
      }
    });
}
