/**
 * anchored-spec migrate
 *
 * Detects schema version mismatches and applies migrations.
 * Provides a framework for future schema evolution.
 */

import { Command } from "commander";
import chalk from "chalk";
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { SpecRoot } from "../../core/index.js";
import { CliError } from "../errors.js";

const CURRENT_SCHEMA_VERSION = "0.2.0";

interface MigrationFn {
  from: string;
  to: string;
  description: string;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

// Registry of migrations — add new ones here as schemas evolve
const MIGRATIONS: MigrationFn[] = [
  {
    from: "1.0",
    to: "0.2.0",
    description: "Add schemaVersion and extensions fields",
    migrate: (data) => ({
      ...data,
      schemaVersion: "0.2.0",
      extensions: data.extensions ?? undefined,
    }),
  },
];

function detectVersion(data: Record<string, unknown>): string {
  if (data.schemaVersion && typeof data.schemaVersion === "string") {
    return data.schemaVersion;
  }
  // Pre-versioning artifacts: assume 1.0
  return "1.0";
}

function findMigrationPath(from: string, to: string): MigrationFn[] {
  const path: MigrationFn[] = [];
  let current = from;
  while (current !== to) {
    const next = MIGRATIONS.find((m) => m.from === current);
    if (!next) return []; // No path
    path.push(next);
    current = next.to;
  }
  return path;
}

function scanJsonFiles(dir: string, pattern?: RegExp): Array<{ path: string; data: Record<string, unknown> }> {
  const results: Array<{ path: string; data: Record<string, unknown> }> = [];
  if (!existsSync(dir)) return results;

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isFile() && entry.endsWith(".json")) {
      if (pattern && !pattern.test(entry)) continue;
      try {
        const data = JSON.parse(readFileSync(fullPath, "utf-8"));
        results.push({ path: fullPath, data });
      } catch {
        // Skip unparseable files
      }
    } else if (stat.isDirectory()) {
      const nested = join(fullPath, "change.json");
      if (existsSync(nested)) {
        try {
          const data = JSON.parse(readFileSync(nested, "utf-8"));
          results.push({ path: nested, data });
        } catch {
          // Skip
        }
      }
    }
  }

  return results;
}

export function migrateCommand(): Command {
  return new Command("migrate")
    .description("Check for and apply schema migrations")
    .option("--dry-run", "Show what would be migrated without writing")
    .option("--check", "Only check for needed migrations (exit 1 if needed)")
    .action((options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized.");
      }

      console.log(chalk.blue(`🔄 Anchored Spec — Migrate (target: v${CURRENT_SCHEMA_VERSION})\n`));

      // Scan all artifacts
      const requirements = scanJsonFiles(spec.requirementsDir, /^REQ-.*\.json$/);
      const changes = scanJsonFiles(spec.changesDir);
      const decisions = scanJsonFiles(spec.decisionsDir, /^ADR-.*\.json$/);
      const allFiles = [...requirements, ...changes, ...decisions];

      if (allFiles.length === 0) {
        console.log(chalk.dim("  No spec artifacts found."));
        return;
      }

      let needsMigration = 0;
      let migrated = 0;
      let upToDate = 0;

      for (const file of allFiles) {
        const version = detectVersion(file.data);

        if (version === CURRENT_SCHEMA_VERSION) {
          upToDate++;
          continue;
        }

        const migrations = findMigrationPath(version, CURRENT_SCHEMA_VERSION);
        if (migrations.length === 0) {
          // No migration path — just stamp the version
          needsMigration++;
          if (!options.check) {
            const updated = { ...file.data, schemaVersion: CURRENT_SCHEMA_VERSION };
            if (!options.dryRun) {
              writeFileSync(file.path, JSON.stringify(updated, null, 2) + "\n");
            }
            console.log(chalk.green(`  ${options.dryRun ? "→" : "✓"} ${file.data.id ?? file.path}: v${version} → v${CURRENT_SCHEMA_VERSION} (version stamp)`));
            migrated++;
          } else {
            console.log(chalk.yellow(`  ⚠ ${file.data.id ?? file.path}: needs migration from v${version}`));
          }
          continue;
        }

        needsMigration++;
        if (!options.check) {
          let data = { ...file.data };
          for (const m of migrations) {
            data = m.migrate(data);
            console.log(chalk.dim(`    Applied: ${m.description}`));
          }
          data.schemaVersion = CURRENT_SCHEMA_VERSION;

          if (!options.dryRun) {
            writeFileSync(file.path, JSON.stringify(data, null, 2) + "\n");
          }
          console.log(chalk.green(`  ${options.dryRun ? "→" : "✓"} ${file.data.id ?? file.path}: v${version} → v${CURRENT_SCHEMA_VERSION}`));
          migrated++;
        } else {
          console.log(chalk.yellow(`  ⚠ ${file.data.id ?? file.path}: needs migration from v${version}`));
        }
      }

      console.log("");
      console.log(chalk.dim(`  ${allFiles.length} artifacts scanned | ${upToDate} up-to-date | ${needsMigration} need migration`));

      if (options.check && needsMigration > 0) {
        console.log(chalk.red(`\n✗ ${needsMigration} artifact(s) need migration. Run 'anchored-spec migrate' to update.`));
        throw new CliError("", 1);
      } else if (migrated > 0) {
        console.log(chalk.green(`\n✓ Migrated ${migrated} artifact(s) to v${CURRENT_SCHEMA_VERSION}.`));
      } else {
        console.log(chalk.green("\n✓ All artifacts are up-to-date."));
      }
    });
}
