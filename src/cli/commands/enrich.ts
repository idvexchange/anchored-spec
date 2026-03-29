/**
 * anchored-spec enrich <artifact-id> --from <json-file>
 *
 * Merge fields from a JSON file into an existing EA artifact.
 * Eliminates the manual read-modify-write loop for bulk enrichment.
 */

import { Command } from "commander";
import chalk from "chalk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  EaRoot,
  resolveEaConfig,
  normalizeArtifact,
} from "../../ea/index.js";
import type { EaDomain } from "../../ea/index.js";
import { EA_DOMAINS } from "../../ea/types.js";
import { CliError } from "../errors.js";

export function enrichCommand(): Command {
  return new Command("enrich")
    .description("Merge fields from a JSON file into an existing EA artifact")
    .argument("<artifact-id>", "Artifact ID (e.g., APP-order-service)")
    .requiredOption("--from <path>", "Path to JSON file with fields to merge")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--dry-run", "Show merged result without writing")
    .action(async (artifactId: string, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });

      // Find the artifact file
      const found = findArtifactFile(cwd, eaConfig.domains, artifactId);
      if (!found) {
        throw new CliError(
          `Artifact "${artifactId}" not found in any domain directory`,
          2
        );
      }

      // Load the enrichment data
      const fromPath = resolve(options.from as string);
      if (!existsSync(fromPath)) {
        throw new CliError(`Enrichment file not found: ${fromPath}`, 2);
      }

      let enrichData: Record<string, unknown>;
      try {
        enrichData = JSON.parse(readFileSync(fromPath, "utf-8")) as Record<string, unknown>;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new CliError(`Failed to parse enrichment file: ${msg}`, 2);
      }

      // Read existing artifact
      const isYaml = found.ext === ".yaml" || found.ext === ".yml";
      const content = readFileSync(found.filePath, "utf-8");
      let raw: Record<string, unknown>;
      try {
        raw = isYaml ? parseYaml(content) : JSON.parse(content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new CliError(`Failed to parse artifact file: ${msg}`, 2);
      }

      // Protected fields that cannot be overwritten by enrich
      const protectedFields = new Set(["id", "kind", "apiVersion"]);

      // Merge enrichment data
      if (isYaml && raw.metadata && typeof raw.metadata === "object") {
        // YAML envelope format — route metadata fields into metadata, rest into spec
        const metadataFields = new Set(["name", "title", "summary", "owners", "tags", "confidence", "status", "schemaVersion"]);
        const metadata = raw.metadata as Record<string, unknown>;
        const spec = (raw.spec && typeof raw.spec === "object")
          ? raw.spec as Record<string, unknown>
          : {};

        for (const [key, value] of Object.entries(enrichData)) {
          if (protectedFields.has(key)) continue;
          if (key === "relations") {
            raw.relations = mergeRelations(
              (raw.relations as unknown[]) ?? [],
              value as unknown[]
            );
          } else if (key === "anchors") {
            raw.anchors = deepMerge(
              (raw.anchors as Record<string, unknown>) ?? {},
              value as Record<string, unknown>
            );
          } else if (metadataFields.has(key)) {
            // Map 'title' to 'name' in metadata envelope
            const metaKey = key === "title" ? "name" : key;
            metadata[metaKey] = value;
          } else {
            spec[key] = value;
          }
        }

        raw.metadata = metadata;
        if (Object.keys(spec).length > 0) {
          raw.spec = spec;
        }
      } else {
        // Flat JSON format
        for (const [key, value] of Object.entries(enrichData)) {
          if (protectedFields.has(key)) continue;
          if (key === "relations") {
            raw.relations = mergeRelations(
              (raw.relations as unknown[]) ?? [],
              value as unknown[]
            );
          } else if (key === "anchors") {
            raw.anchors = deepMerge(
              (raw.anchors as Record<string, unknown>) ?? {},
              value as Record<string, unknown>
            );
          } else {
            raw[key] = value;
          }
        }
      }

      // Output
      const output = isYaml
        ? stringifyYaml(raw, { lineWidth: 120 })
        : JSON.stringify(raw, null, 2) + "\n";

      if (options.dryRun) {
        console.log(chalk.dim("--- Merged result (dry run) ---"));
        process.stdout.write(output);
        return;
      }

      writeFileSync(found.filePath, output);
      console.log(chalk.green(`✓ Enriched ${artifactId}`));
      console.log(chalk.dim(`  File: ${found.relativePath}`));
      console.log(chalk.dim(`  Fields merged: ${Object.keys(enrichData).filter(k => !protectedFields.has(k)).join(", ")}`));
    });
}

interface FoundArtifact {
  filePath: string;
  relativePath: string;
  ext: string;
}

function findArtifactFile(
  cwd: string,
  domains: Record<EaDomain, string>,
  artifactId: string
): FoundArtifact | null {
  for (const domain of EA_DOMAINS) {
    const domainDir = join(cwd, domains[domain]);
    for (const ext of [".yaml", ".yml", ".json"]) {
      const filePath = join(domainDir, `${artifactId}${ext}`);
      if (existsSync(filePath)) {
        return {
          filePath,
          relativePath: `${domains[domain]}/${artifactId}${ext}`,
          ext,
        };
      }
    }
  }
  return null;
}

function mergeRelations(existing: unknown[], incoming: unknown[]): unknown[] {
  if (!Array.isArray(incoming)) return existing;
  const seen = new Set(
    existing
      .filter((r: any) => r && r.type && r.target)
      .map((r: any) => `${r.type}:${r.target}`)
  );
  const merged = [...existing];
  for (const r of incoming) {
    const rel = r as any;
    if (rel && rel.type && rel.target) {
      const key = `${rel.type}:${rel.target}`;
      if (!seen.has(key)) {
        merged.push(r);
        seen.add(key);
      }
    }
  }
  return merged;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      Array.isArray(value) &&
      Array.isArray(result[key])
    ) {
      // Merge arrays — deduplicate strings
      const existing = new Set((result[key] as unknown[]).map(String));
      result[key] = [
        ...(result[key] as unknown[]),
        ...value.filter((v) => !existing.has(String(v))),
      ];
    } else if (
      value && typeof value === "object" && !Array.isArray(value) &&
      result[key] && typeof result[key] === "object" && !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}
