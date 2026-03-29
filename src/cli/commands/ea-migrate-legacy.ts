/**
 * CLI command: anchored-spec ea migrate-legacy
 *
 * Migrates legacy REQ/CHG/ADR artifacts to EA format.
 */

import { Command } from "commander";
import { resolve } from "node:path";
import { SpecRoot } from "../../core/loader.js";
import {
  migrateLegacyArtifacts,
  renderMigrationReportMarkdown,
} from "../../ea/migrate-legacy.js";

export function eaMigrateLegacyCommand(): Command {
  return new Command("migrate-legacy")
    .description("Migrate legacy REQ/CHG/ADR artifacts to EA format")
    .option("--dry-run", "Show what would be migrated without writing files")
    .option(
      "--kind <kind>",
      "Migrate only a specific kind (requirement, change, decision)"
    )
    .option("--json", "Output migration report as JSON")
    .option(
      "--output-dir <dir>",
      "Output directory for migrated artifacts",
      "ea/legacy"
    )
    .action((options) => {
      const cwd = resolve(".");

      // Validate --kind if provided
      if (
        options.kind &&
        !["requirement", "change", "decision"].includes(options.kind)
      ) {
        console.error(
          `Error: Invalid kind "${options.kind}". Must be one of: requirement, change, decision`
        );
        process.exit(1);
      }

      let specRoot: SpecRoot;
      try {
        specRoot = new SpecRoot(cwd);
      } catch {
        console.error(
          "Error: Spec infrastructure not initialized. Run 'anchored-spec init' first."
        );
        process.exit(1);
      }

      const result = migrateLegacyArtifacts(specRoot, {
        dryRun: options.dryRun ?? false,
        kind: options.kind,
        outputDir: options.outputDir,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (options.dryRun) {
          console.log("Dry run — no files written.\n");
        }

        if (result.migratedArtifacts.length === 0 && result.errors.length === 0) {
          console.log("No legacy artifacts found to migrate.");
          return;
        }

        console.log(renderMigrationReportMarkdown(result));
      }

      if (result.errors.length > 0) {
        process.exit(1);
      }
    });
}
