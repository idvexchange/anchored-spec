/**
 * CLI command: anchored-spec migrate-config
 *
 * Standalone config migration from v0.x to v1.0 format.
 * Reads the existing `.anchored-spec/config.json`, detects its version,
 * backs up the original, and writes the v1.0 format.
 */

import { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  detectConfigVersion,
  migrateConfigV0ToV1,
} from "../../ea/index.js";
import type { AnchoredSpecConfigV1, LegacyConfigInput } from "../../ea/index.js";

export function migrateConfigCommand(): Command {
  return new Command("migrate-config")
    .description("Migrate v0.x .anchored-spec/config.json to v1.0 format")
    .option("--dry-run", "Show what would change without writing")
    .action((options) => {
      const cwd = process.cwd();
      const dryRun = options.dryRun as boolean;
      const configDir = join(cwd, ".anchored-spec");
      const configPath = join(configDir, "config.json");

      console.log(chalk.blue("🔄 Anchored Spec — Config Migration\n"));

      if (dryRun) {
        console.log(chalk.yellow("  [DRY RUN] No files will be written.\n"));
      }

      if (!existsSync(configPath)) {
        console.error(chalk.red("  ✗ No .anchored-spec/config.json found."));
        console.error(chalk.dim("    Run 'anchored-spec init' to create a new v1.0 project."));
        process.exit(1);
      }

      const raw = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      const version = detectConfigVersion(raw);

      if (version === "1.0") {
        console.log(chalk.green("  ✓ Config is already v1.0 format. Nothing to do."));
        return;
      }

      console.log(chalk.dim(`  · Detected v0.x config format`));

      // Backup
      const backupPath = join(configDir, "config.v0.backup.json");
      if (!dryRun) {
        writeFileSync(backupPath, readFileSync(configPath, "utf-8"));
      }
      console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Backup original to .anchored-spec/config.v0.backup.json`));

      // Migrate
      const v1Config: AnchoredSpecConfigV1 = migrateConfigV0ToV1(raw as LegacyConfigInput);
      console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Convert config to v1.0 format`));

      if (!dryRun) {
        writeFileSync(configPath, JSON.stringify(v1Config, null, 2) + "\n");
      }
      console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Write .anchored-spec/config.json`));

      // Show diff
      console.log(chalk.blue("\n📋 New v1.0 config:"));
      console.log(chalk.dim(JSON.stringify(v1Config, null, 2)));

      console.log(chalk.blue("\n✅ Config migrated to v1.0!"));
      console.log(chalk.dim("\nNext steps:"));
      console.log(chalk.dim("  1. Review the new config"));
      console.log(chalk.dim("  2. Run 'anchored-spec init' to scaffold domain directories"));
      console.log(chalk.dim("  3. Run 'anchored-spec validate' to verify artifacts"));
    });
}
