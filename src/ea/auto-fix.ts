/**
 * anchored-spec validate --fix
 *
 * Auto-fixer for common validation issues. Applies mechanical fixes:
 * - Missing required empty arrays (exchangedEntities, relations, tags)
 * - Missing schemaVersion
 * - Missing confidence field
 *
 * Returns a list of fixes applied per file.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { EaDomain } from "./types.js";
import { EA_DOMAINS, getDomainForKind } from "./types.js";
import type { EaConfig } from "./config.js";

export interface FixResult {
  filePath: string;
  relativePath: string;
  fixes: string[];
}

/**
 * Auto-fix common validation issues across all artifacts.
 */
export function autoFixArtifacts(
  cwd: string,
  domains: Record<EaDomain, string>,
): FixResult[] {
  const results: FixResult[] = [];

  for (const domain of EA_DOMAINS) {
    const domainDir = join(cwd, domains[domain as EaDomain]);
    if (!existsSync(domainDir)) continue;

    const files = readdirSync(domainDir).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".json")
    );

    for (const file of files) {
      const filePath = join(domainDir, file);
      if (!statSync(filePath).isFile()) continue;

      const fixes = fixArtifactFile(filePath);
      if (fixes.length > 0) {
        results.push({
          filePath,
          relativePath: `${domains[domain as EaDomain]}/${file}`,
          fixes,
        });
      }
    }
  }

  return results;
}

function fixArtifactFile(filePath: string): string[] {
  const ext = extname(filePath);
  const isYaml = ext === ".yaml" || ext === ".yml";
  const content = readFileSync(filePath, "utf-8");
  const fixes: string[] = [];

  let raw: Record<string, unknown>;
  try {
    raw = isYaml ? parseYaml(content) : JSON.parse(content);
  } catch {
    return []; // Can't parse — skip
  }

  if (!raw || typeof raw !== "object") return [];

  // Determine if YAML envelope or flat
  const isEnvelope = isYaml && raw.metadata && typeof raw.metadata === "object";
  const metadata = isEnvelope ? (raw.metadata as Record<string, unknown>) : raw;
  const spec = isEnvelope && raw.spec && typeof raw.spec === "object"
    ? (raw.spec as Record<string, unknown>)
    : (isEnvelope ? {} : null);
  const root = isEnvelope ? raw : raw;

  // Fix: missing schemaVersion
  if (isEnvelope) {
    if (!metadata.schemaVersion) {
      metadata.schemaVersion = "1.0.0";
      fixes.push("Added missing schemaVersion: 1.0.0");
    }
  } else {
    if (!raw.schemaVersion) {
      raw.schemaVersion = "1.0.0";
      fixes.push("Added missing schemaVersion: 1.0.0");
    }
  }

  // Fix: missing confidence
  if (!metadata.confidence) {
    metadata.confidence = "declared";
    fixes.push("Added missing confidence: declared");
  }

  // Fix: missing status
  if (!metadata.status) {
    metadata.status = "draft";
    fixes.push("Added missing status: draft");
  }

  // Fix: missing relations array
  if (root.relations === undefined || root.relations === null) {
    root.relations = [];
    fixes.push("Added missing relations: []");
  }

  // Fix: missing tags
  if (metadata.tags === undefined || metadata.tags === null) {
    metadata.tags = [];
    fixes.push("Added missing tags: []");
  }

  // Fix: missing owners
  if (!Array.isArray(metadata.owners) || metadata.owners.length === 0) {
    if (!metadata.owners) {
      metadata.owners = [];
      fixes.push("Added missing owners: []");
    }
  }

  // Kind-specific fixes
  const kind = (raw.kind as string) ?? "";

  if (kind === "information-exchange") {
    const target = spec ?? raw;
    if (!Array.isArray(target.exchangedEntities)) {
      target.exchangedEntities = [];
      fixes.push("Added missing exchangedEntities: []");
    }
  }

  if (kind === "physical-schema") {
    const target = spec ?? raw;
    if (target.tables && Array.isArray(target.tables)) {
      let fixedColumns = false;
      for (const table of target.tables as Array<Record<string, unknown>>) {
        if (table && !Array.isArray(table.columns)) {
          table.columns = [];
          fixedColumns = true;
        }
      }
      if (fixedColumns) {
        fixes.push("Added missing columns: [] to tables");
      }
    }
  }

  if (kind === "consumer") {
    const target = spec ?? raw;
    if (!Array.isArray(target.consumesContracts)) {
      target.consumesContracts = [];
      fixes.push("Added missing consumesContracts: []");
    }
  }

  if (kind === "value-stream") {
    const target = spec ?? raw;
    if (!Array.isArray(target.stages)) {
      target.stages = [];
      fixes.push("Added missing stages: []");
    }
  }

  if (kind === "data-quality-rule") {
    const target = spec ?? raw;
    if (!Array.isArray(target.appliesTo)) {
      target.appliesTo = [];
      fixes.push("Added missing appliesTo: []");
    }
  }

  if (kind === "retention-policy") {
    const target = spec ?? raw;
    if (!Array.isArray(target.appliesTo)) {
      target.appliesTo = [];
      fixes.push("Added missing appliesTo: []");
    }
  }

  // Write back if fixes were applied
  if (fixes.length > 0) {
    // Update metadata/spec back into envelope
    if (isEnvelope) {
      raw.metadata = metadata;
      if (spec && Object.keys(spec).length > 0) {
        raw.spec = spec;
      }
    }

    const output = isYaml
      ? stringifyYaml(raw, { lineWidth: 120 })
      : JSON.stringify(raw, null, 2) + "\n";
    writeFileSync(filePath, output);
  }

  return fixes;
}
