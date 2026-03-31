/**
 * anchored-spec link <from> <to>
 *
 * Create a relation between two EA artifacts.
 * Updates the source artifact file to add the relation entry.
 */

import { Command } from "commander";
import chalk from "chalk";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { EaRoot } from "../../ea/loader.js";
import type { EaLoadedArtifact } from "../../ea/loader.js";
import { resolveEaConfig } from "../../ea/index.js";
import { CliError } from "../errors.js";

export function eaLinkCommand(): Command {
  return new Command("link")
    .description("Create a relation between two EA artifacts")
    .argument("<from>", "Source artifact ID (e.g., APP-frontend)")
    .argument("<to>", "Target artifact ID (e.g., API-users-v1)")
    .option("--type <type>", "Relation type (e.g., uses, owns, implements)", "uses")
    .option("--description <desc>", "Optional description of the relationship")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--dry-run", "Show what would change without writing")
    .action(async (from: string, to: string, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir as string });
      const root = new EaRoot(cwd, { specDir: "specs", outputDir: "output", ea: eaConfig } as never);
      const loadResult = await root.loadArtifacts();

      // Find source artifact
      const sourceDetail: EaLoadedArtifact | undefined = loadResult.details.find(
        (d: EaLoadedArtifact) => d.artifact?.id === from,
      );
      if (!sourceDetail?.artifact) {
        throw new CliError(`Artifact "${from}" not found. Run "anchored-spec status" to list artifacts.`, 1);
      }

      // Verify target exists
      const targetDetail: EaLoadedArtifact | undefined = loadResult.details.find(
        (d: EaLoadedArtifact) => d.artifact?.id === to,
      );
      if (!targetDetail?.artifact) {
        throw new CliError(`Target artifact "${to}" not found.`, 1);
      }

      // Check for duplicate relation
      const existingRelations = sourceDetail.artifact.relations ?? [];
      const duplicate = existingRelations.find(
        (r: { target: string; type: string }) => r.target === to && r.type === options.type,
      );
      if (duplicate) {
        console.log(chalk.yellow(`⚠ Relation already exists: ${from} --[${options.type}]--> ${to}`));
        return;
      }

      // Build the new relation
      const newRelation: Record<string, string> = {
        target: to,
        type: options.type as string,
      };
      if (options.description) {
        newRelation.description = options.description as string;
      }

      if (options.dryRun) {
        console.log(chalk.blue("Dry run — would add:"));
        console.log(chalk.dim(`  ${from} --[${options.type}]--> ${to}`));
        return;
      }

      // Read and update the artifact file
      const filePath = join(cwd, sourceDetail.relativePath);
      const raw = readFileSync(filePath, "utf-8");

      if (filePath.endsWith(".json")) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const relations = (parsed.relations ?? []) as Record<string, string>[];
        relations.push(newRelation);
        parsed.relations = relations;
        writeFileSync(filePath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
      } else {
        // YAML — parse, modify, re-serialize
        const parsed = parseYaml(raw) as Record<string, unknown>;

        // Handle YAML envelope format (apiVersion/kind wrapping)
        if (parsed.apiVersion && parsed.kind) {
          const relations = (parsed.relations ?? []) as Record<string, string>[];
          relations.push(newRelation);
          parsed.relations = relations;
        } else {
          // Flat format
          const relations = (parsed.relations ?? []) as Record<string, string>[];
          relations.push(newRelation);
          parsed.relations = relations;
        }

        writeFileSync(filePath, stringifyYaml(parsed, { lineWidth: 120 }), "utf-8");
      }

      console.log(chalk.green(`✓ Linked: ${from} --[${options.type}]--> ${to}`));
      console.log(chalk.dim(`  Updated: ${sourceDetail.relativePath}`));
    });
}
