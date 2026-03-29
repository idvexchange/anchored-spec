/**
 * anchored-spec create-batch --from <manifest.json>
 *
 * Create multiple EA artifacts from a JSON manifest file.
 * Dramatically faster than calling `create` in a loop for migrations.
 */

import { Command } from "commander";
import chalk from "chalk";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  getKindEntry,
  getKindPrefix,
  getDomainForKind,
  resolveEaConfig,
} from "../../ea/index.js";
import { CliError } from "../errors.js";

interface ManifestEntry {
  kind: string;
  title: string;
  id?: string;
  owner?: string;
  [key: string]: unknown;
}

export function createBatchCommand(): Command {
  return new Command("create-batch")
    .description("Create multiple EA artifacts from a JSON manifest")
    .requiredOption("--from <path>", "Path to JSON manifest file (array of artifact definitions)")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--json", "Output created artifacts as JSON format")
    .option("--dry-run", "Show what would be created without writing files")
    .action((options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });
      const manifestPath = resolve(options.from as string);

      if (!existsSync(manifestPath)) {
        throw new CliError(`Manifest file not found: ${manifestPath}`, 2);
      }

      let manifest: ManifestEntry[];
      try {
        const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
        if (!Array.isArray(raw)) {
          throw new Error("Manifest must be a JSON array of artifact definitions");
        }
        manifest = raw as ManifestEntry[];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new CliError(`Failed to parse manifest: ${msg}`, 2);
      }

      let created = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < manifest.length; i++) {
        const entry = manifest[i]!;

        if (!entry.kind || !entry.title) {
          errors.push(`[${i}] Missing required fields 'kind' and 'title'`);
          continue;
        }

        const kindEntry = getKindEntry(entry.kind);
        if (!kindEntry) {
          errors.push(`[${i}] Unknown kind "${entry.kind}"`);
          continue;
        }

        const prefix = getKindPrefix(entry.kind)!;
        let slug = entry.id ?? slugify(entry.title);
        // Strip prefix only if user explicitly provided an id with the prefix
        if (entry.id) {
          const prefixWithDash = `${prefix}-`.toLowerCase();
          if (slug.toLowerCase().startsWith(prefixWithDash)) {
            slug = slug.slice(prefixWithDash.length);
          }
        }
        const id = `${prefix}-${slug}`;

        const domain = getDomainForKind(entry.kind)!;
        const domainDir = join(cwd, eaConfig.domains[domain]);
        const ext = options.json ? "json" : "yaml";
        const filePath = join(domainDir, `${id}.${ext}`);

        if (existsSync(filePath)) {
          skipped++;
          if (!options.dryRun) {
            console.log(chalk.dim(`  ⏭ Skipped ${id} (already exists)`));
          }
          continue;
        }

        if (options.dryRun) {
          console.log(chalk.dim(`  Would create ${eaConfig.domains[domain]}/${id}.${ext}`));
          created++;
          continue;
        }

        if (!existsSync(domainDir)) {
          mkdirSync(domainDir, { recursive: true });
        }

        const owner = (entry.owner as string) ?? "your-team";

        // Build artifact with any extra fields from manifest
        const content = options.json
          ? generateBatchJson(id, entry.kind, entry.title, owner, entry)
          : generateBatchYaml(id, entry.kind, entry.title, owner, entry);

        writeFileSync(filePath, content);
        created++;
        console.log(chalk.green(`  ✓ ${eaConfig.domains[domain]}/${id}.${ext}`));
      }

      console.log("");
      if (errors.length > 0) {
        for (const err of errors) {
          console.log(chalk.red(`  ✗ ${err}`));
        }
        console.log("");
      }

      const dryLabel = options.dryRun ? " (dry run)" : "";
      console.log(
        chalk.blue(
          `${dryLabel ? "Would create" : "Created"} ${created} | Skipped ${skipped} | Errors ${errors.length}${dryLabel}`
        )
      );

      if (errors.length > 0) {
        throw new CliError("", 1);
      }
    });
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 40);
}

function generateBatchYaml(
  id: string,
  kind: string,
  title: string,
  owner: string,
  entry: ManifestEntry
): string {
  const extraFields = getExtraFields(entry);
  const specBlock = extraFields.length > 0
    ? `\nspec:\n${extraFields.map(([k, v]) => `  ${k}: ${yamlValue(v)}`).join("\n")}\n`
    : "";

  return `apiVersion: anchored-spec/ea/v1
kind: ${kind}
id: ${id}

metadata:
  name: ${title}
  summary: >
    ${entry.summary ?? `TODO: Describe what this ${kind} represents.`}
  owners:
    - ${owner}
  tags: ${Array.isArray(entry.tags) ? JSON.stringify(entry.tags) : "[]"}
  confidence: ${entry.confidence ?? "declared"}
  status: ${entry.status ?? "draft"}
  schemaVersion: "1.0.0"
${specBlock}
relations: ${Array.isArray(entry.relations) ? formatYamlRelations(entry.relations) : "[]"}
`;
}

function generateBatchJson(
  id: string,
  kind: string,
  title: string,
  owner: string,
  entry: ManifestEntry
): string {
  const artifact: Record<string, unknown> = {
    id,
    schemaVersion: "1.0.0",
    kind,
    title,
    status: entry.status ?? "draft",
    summary: entry.summary ?? `TODO: Describe what this ${kind} represents.`,
    owners: [owner],
    confidence: entry.confidence ?? "declared",
    tags: entry.tags ?? [],
    relations: entry.relations ?? [],
  };

  // Add extra fields from manifest
  for (const [key, value] of getExtraFields(entry)) {
    artifact[key] = value;
  }

  return JSON.stringify(artifact, null, 2) + "\n";
}

function getExtraFields(entry: ManifestEntry): [string, unknown][] {
  const reserved = new Set([
    "kind", "title", "id", "owner", "status", "summary",
    "confidence", "tags", "relations", "owners",
  ]);
  return Object.entries(entry).filter(([k]) => !reserved.has(k));
}

function yamlValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function formatYamlRelations(relations: unknown[]): string {
  if (!Array.isArray(relations) || relations.length === 0) return "[]";
  return "\n" + relations
    .map((r: any) => `  - type: ${r.type}\n    target: ${r.target}`)
    .join("\n");
}
