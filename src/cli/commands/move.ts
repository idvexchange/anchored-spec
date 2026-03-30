/**
 * anchored-spec move <artifact-id> --kind <new-kind>
 *
 * Reclassify an artifact to a new kind, atomically updating:
 * - The artifact's kind, id prefix, and domain placement
 * - All relation targets in other artifacts that reference the old ID
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  readFileSync, writeFileSync, existsSync, unlinkSync,
  mkdirSync, readdirSync, statSync,
} from "node:fs";
import { join, extname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  getKindEntry,
  getKindPrefix,
  getDomainForKind,
  resolveEaConfig,
} from "../../ea/index.js";
import type { EaDomain } from "../../ea/index.js";
import { EA_DOMAINS } from "../../ea/types.js";
import { CliError } from "../errors.js";

export function moveCommand(): Command {
  return new Command("move")
    .description("Reclassify an artifact to a new kind (updates ID, domain, and references)")
    .argument("<artifact-id>", "Current artifact ID (e.g., REQ-my-requirement)")
    .requiredOption("--kind <kind>", "New artifact kind (e.g., security-requirement)")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--dry-run", "Show what would change without writing")
    .action((artifactId: string, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });
      const newKind = options.kind as string;

      // Validate new kind
      const newEntry = getKindEntry(newKind);
      if (!newEntry) {
        throw new CliError(`Unknown target kind "${newKind}"`, 2);
      }

      // Find the source artifact
      const found = findArtifactFile(cwd, eaConfig.domains, artifactId);
      if (!found) {
        throw new CliError(`Artifact "${artifactId}" not found in any domain directory`, 2);
      }

      // Compute new ID — extract slug from after the first dash
      const newPrefix = getKindPrefix(newKind)!;
      const dashIdx = artifactId.indexOf("-");
      const slug = dashIdx >= 0 ? artifactId.slice(dashIdx + 1) : artifactId;
      const newId = `${newPrefix}-${slug}`;

      // Compute new domain/path
      const newDomain = getDomainForKind(newKind)!;
      const newDomainDir = join(cwd, eaConfig.domains[newDomain]);
      const newFilePath = join(newDomainDir, `${newId}${found.ext}`);

      if (existsSync(newFilePath) && newFilePath !== found.filePath) {
        throw new CliError(`Target file already exists: ${newFilePath}`, 1);
      }

      // Read and update the artifact
      const content = readFileSync(found.filePath, "utf-8");
      const isYaml = found.ext === ".yaml" || found.ext === ".yml";
      let raw: Record<string, unknown>;
      try {
        raw = isYaml ? parseYaml(content) : JSON.parse(content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new CliError(`Failed to parse artifact: ${msg}`, 2);
      }

      // Update artifact fields
      raw.kind = newKind;
      raw.id = newId;

      if (options.dryRun) {
        console.log(chalk.dim("--- Move plan (dry run) ---"));
        console.log(chalk.dim(`  ID:     ${artifactId} → ${newId}`));
        console.log(chalk.dim(`  Kind:   ${raw.kind} → ${newKind}`));
        console.log(chalk.dim(`  Domain: ${found.domain} → ${newDomain}`));
        console.log(chalk.dim(`  File:   ${found.relativePath} → ${eaConfig.domains[newDomain]}/${newId}${found.ext}`));
      }

      // Find and rewrite references in other artifacts
      const refUpdates = updateReferences(cwd, eaConfig.domains, artifactId, newId, options.dryRun);

      if (options.dryRun) {
        if (refUpdates.length > 0) {
          console.log(chalk.dim(`\n  References updated (${refUpdates.length}):`));
          for (const ref of refUpdates) {
            console.log(chalk.dim(`    ${ref}`));
          }
        }
        return;
      }

      // Write new file
      if (!existsSync(newDomainDir)) {
        mkdirSync(newDomainDir, { recursive: true });
      }

      const output = isYaml
        ? stringifyYaml(raw, { lineWidth: 120 })
        : JSON.stringify(raw, null, 2) + "\n";

      writeFileSync(newFilePath, output);

      // Remove old file (if path changed)
      if (newFilePath !== found.filePath) {
        unlinkSync(found.filePath);
      }

      console.log(chalk.green(`✓ Moved ${artifactId} → ${newId}`));
      console.log(chalk.dim(`  Kind:   ${newKind}`));
      console.log(chalk.dim(`  Domain: ${newDomain}`));
      console.log(chalk.dim(`  File:   ${eaConfig.domains[newDomain]}/${newId}${found.ext}`));
      if (refUpdates.length > 0) {
        console.log(chalk.dim(`  References updated: ${refUpdates.length} files`));
      }
    });
}

interface FoundArtifact {
  filePath: string;
  relativePath: string;
  domain: string;
  ext: string;
}

function findArtifactFile(
  cwd: string,
  domains: Record<EaDomain, string>,
  artifactId: string
): FoundArtifact | null {
  for (const domain of EA_DOMAINS) {
    const domainPath = domains[domain];
    const domainDir = join(cwd, domainPath);
    for (const ext of [".yaml", ".yml", ".json"]) {
      const filePath = join(domainDir, `${artifactId}${ext}`);
      if (existsSync(filePath)) {
        return {
          filePath,
          relativePath: `${domainPath}/${artifactId}${ext}`,
          domain,
          ext,
        };
      }
    }
  }
  return null;
}

function updateReferences(
  cwd: string,
  domains: Record<EaDomain, string>,
  oldId: string,
  newId: string,
  dryRun: boolean
): string[] {
  const updated: string[] = [];

  for (const domain of EA_DOMAINS) {
    const domainDir = join(cwd, domains[domain]);
    if (!existsSync(domainDir)) continue;

    const files = readdirSync(domainDir).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".json")
    );

    for (const file of files) {
      const filePath = join(domainDir, file);
      if (!statSync(filePath).isFile()) continue;

      const content = readFileSync(filePath, "utf-8");
      if (!content.includes(oldId)) continue;

      const ext = extname(file);
      const isYaml = ext === ".yaml" || ext === ".yml";

      try {
        const raw: Record<string, unknown> = isYaml ? parseYaml(content) : JSON.parse(content);

        let changed = false;

        // Update relation targets
        if (Array.isArray(raw.relations)) {
          for (const rel of raw.relations as Array<Record<string, unknown>>) {
            if (rel.target === oldId) {
              rel.target = newId;
              changed = true;
            }
          }
        }

        // Update any string field that references the old ID
        for (const [key, value] of Object.entries(raw)) {
          if (typeof value === "string" && value === oldId) {
            raw[key] = newId;
            changed = true;
          }
        }

        // Check spec fields too (for YAML envelope)
        if (raw.spec && typeof raw.spec === "object") {
          for (const [key, value] of Object.entries(raw.spec as Record<string, unknown>)) {
            if (typeof value === "string" && value === oldId) {
              (raw.spec as Record<string, unknown>)[key] = newId;
              changed = true;
            }
          }
        }

        if (changed && !dryRun) {
          const output = isYaml
            ? stringifyYaml(raw, { lineWidth: 120 })
            : JSON.stringify(raw, null, 2) + "\n";
          writeFileSync(filePath, output);
        }

        if (changed) {
          updated.push(`${domains[domain]}/${file}`);
        }
      } catch {
        // Skip files that can't be parsed
      }
    }
  }

  return updated;
}
