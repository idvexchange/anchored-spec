/**
 * anchored-spec batch-update
 *
 * Apply field changes to multiple artifacts matching a filter.
 * Enables bulk operations like promoting confidence from observed to declared.
 */

import { Command } from "commander";
import chalk from "chalk";
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { EaRoot } from "../../ea/loader.js";
import { resolveEaConfig } from "../../ea/config.js";
import type { EaArtifactBase } from "../../ea/types.js";
import { getDomainForKind } from "../../ea/types.js";
import { CliError } from "../errors.js";

// ─── Types ────────────────────────────────────────────────────────────

interface FilterCriteria {
  field: string;
  value: string;
}

interface SetOperation {
  field: string;
  value: string;
}

interface UpdateResult {
  id: string;
  filePath: string;
  changes: { field: string; oldValue: string; newValue: string }[];
}

// Fields that can never be set via batch-update
const PROTECTED_FIELDS = new Set(["id", "kind", "apiVersion", "schemaVersion"]);

// Fields that can be set
const SETTABLE_FIELDS = new Set(["confidence", "status"]);

// Fields that can be filtered on
const FILTERABLE_FIELDS = new Set(["confidence", "status", "kind"]);

// ─── Parsing ──────────────────────────────────────────────────────────

function parseFilters(filterStr: string): FilterCriteria[] {
  return filterStr.split(",").map((pair) => {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) {
      throw new CliError(
        `Invalid filter format: "${pair}". Expected field=value`,
        2,
      );
    }
    const field = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    if (!FILTERABLE_FIELDS.has(field)) {
      throw new CliError(
        `Cannot filter on "${field}". Filterable: ${[...FILTERABLE_FIELDS].join(", ")}`,
        2,
      );
    }
    return { field, value };
  });
}

function parseSetOps(setStr: string): SetOperation[] {
  return setStr.split(",").map((pair) => {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) {
      throw new CliError(
        `Invalid --set format: "${pair}". Expected field=value`,
        2,
      );
    }
    const field = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    if (PROTECTED_FIELDS.has(field)) {
      throw new CliError(
        `Cannot set protected field "${field}"`,
        2,
      );
    }
    if (!SETTABLE_FIELDS.has(field)) {
      throw new CliError(
        `Cannot set "${field}". Settable: ${[...SETTABLE_FIELDS].join(", ")}`,
        2,
      );
    }
    return { field, value };
  });
}

// ─── Filter matching ──────────────────────────────────────────────────

function matchesFilters(
  artifact: EaArtifactBase,
  filters: FilterCriteria[],
  domain?: string,
): boolean {
  for (const f of filters) {
    const actual = getFieldValue(artifact, f.field);
    if (actual !== f.value) return false;
  }
  if (domain) {
    const artifactDomain = getDomainForKind(artifact.kind);
    if (artifactDomain !== domain) return false;
  }
  return true;
}

function getFieldValue(artifact: EaArtifactBase, field: string): string {
  switch (field) {
    case "confidence":
      return artifact.confidence;
    case "status":
      return artifact.status;
    case "kind":
      return artifact.kind;
    default:
      return "";
  }
}

// ─── File update ──────────────────────────────────────────────────────

function applyUpdates(
  filePath: string,
  ops: SetOperation[],
): void {
  const content = readFileSync(filePath, "utf-8");
  const isJson = filePath.endsWith(".json");

  if (isJson) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = JSON.parse(content);
    for (const op of ops) {
      if (data.metadata && typeof data.metadata === "object") {
        data.metadata[op.field] = op.value;
      } else {
        data[op.field] = op.value;
      }
    }
    writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  } else {
    // YAML — use regex replacement to preserve formatting
    let updated = content;
    for (const op of ops) {
      const regex = new RegExp(`(\\s+${op.field}:\\s+)(\\S+)`);
      if (regex.test(updated)) {
        updated = updated.replace(regex, `$1${op.value}`);
      } else {
        // Field doesn't exist in file — parse and rewrite
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = parseYaml(updated);
        if (data.metadata && typeof data.metadata === "object") {
          data.metadata[op.field] = op.value;
        } else {
          data[op.field] = op.value;
        }
        updated = stringifyYaml(data);
      }
    }
    writeFileSync(filePath, updated, "utf-8");
  }
}

// ─── Command ──────────────────────────────────────────────────────────

export function batchUpdateCommand(): Command {
  return new Command("batch-update")
    .description(
      "Apply field changes to multiple artifacts matching a filter",
    )
    .requiredOption(
      "--filter <criteria>",
      "Filter criteria (e.g., confidence=observed,kind=service)",
    )
    .requiredOption(
      "--set <changes>",
      "Fields to set (e.g., confidence=declared)",
    )
    .option("--domain <domain>", "Filter to a specific EA domain")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--dry-run", "Show what would change without writing files")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, {
        specDir: "specs",
        outputDir: "output",
        ea: eaConfig,
      } as never);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec ea init' first.",
          2,
        );
      }

      const filters = parseFilters(options.filter as string);
      const setOps = parseSetOps(options.set as string);

      const loadResult = await root.loadArtifacts();

      const matched = loadResult.details.filter(
        (d) =>
          d.artifact &&
          matchesFilters(d.artifact, filters, options.domain),
      );

      const results: UpdateResult[] = [];

      for (const detail of matched) {
        const artifact = detail.artifact!;
        const changes: UpdateResult["changes"] = [];

        for (const op of setOps) {
          const oldValue = getFieldValue(artifact, op.field);
          if (oldValue !== op.value) {
            changes.push({
              field: op.field,
              oldValue,
              newValue: op.value,
            });
          }
        }

        if (changes.length === 0) continue;

        results.push({
          id: artifact.id,
          filePath: detail.relativePath,
          changes,
        });

        if (!options.dryRun) {
          applyUpdates(detail.filePath, setOps);
        }
      }

      if (options.json) {
        process.stdout.write(
          JSON.stringify(
            {
              dryRun: !!options.dryRun,
              totalMatched: matched.length,
              totalUpdated: results.length,
              updated: results,
            },
            null,
            2,
          ) + "\n",
        );
        return;
      }

      if (options.dryRun) {
        console.log(chalk.yellow("  DRY RUN — no files modified\n"));
      }

      if (results.length === 0) {
        console.log(
          chalk.green(
            `✓ ${matched.length} artifact${matched.length === 1 ? "" : "s"} matched, 0 need changes.`,
          ),
        );
        return;
      }

      console.log(
        chalk.bold(
          `Updating ${results.length} artifact${results.length === 1 ? "" : "s"}:\n`,
        ),
      );
      for (const r of results) {
        console.log(`  ${chalk.green("✓")} ${r.id}`);
        for (const c of r.changes) {
          console.log(
            chalk.dim(`    ${c.field}: ${c.oldValue} → ${c.newValue}`),
          );
        }
      }
      console.log(
        chalk.dim(
          `\n  Matched: ${matched.length}, Updated: ${results.length}`,
        ),
      );
    });
}
