/**
 * anchored-spec ea discover
 *
 * Discover new EA artifacts from sources (OpenAPI, K8s, Terraform, etc.).
 * Creates draft artifacts with confidence "inferred" or "observed".
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  EaRoot,
  resolveEaConfig,
  discoverArtifacts,
  createDraft,
  renderDiscoveryReportMarkdown,
} from "../../ea/index.js";
import { CliError } from "../errors.js";

export function eaDiscoverCommand(): Command {
  return new Command("discover")
    .description("Discover EA artifacts from external sources")
    .option("--resolver <name>", "Run a specific resolver (stub for now)")
    .option("--source <path>", "Source path to scan")
    .option("--dry-run", "Show what would be created without writing files")
    .option("--json", "Output discovery report as JSON")
    .option("--max-cache-age <seconds>", "Maximum cache age in seconds")
    .option("--no-cache", "Disable resolver cache")
    .option("--root-dir <path>", "EA root directory", "ea")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, { specDir: "specs", outputDir: "output", ea: eaConfig } as never);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec ea init' first.",
          2,
        );
      }

      const result = await root.loadArtifacts();

      // For now, resolvers are stubs — real resolvers come in later issues
      const resolverName = (options.resolver as string) ?? "stub";
      const drafts: ReturnType<typeof createDraft>[] = [];

      // If a source is provided but no real resolver exists yet, inform the user
      if (options.source) {
        console.log(
          chalk.yellow(
            `⚠ Resolver "${resolverName}" is a stub. Real resolvers (openapi, kubernetes, terraform) will be added in future phases.`,
          ),
        );
      }

      const report = discoverArtifacts({
        existingArtifacts: result.artifacts,
        drafts,
        resolverNames: [resolverName],
        projectRoot: cwd,
        domainDirs: eaConfig.domains,
        dryRun: options.dryRun as boolean,
      });

      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      } else {
        const md = renderDiscoveryReportMarkdown(report);
        process.stdout.write(md);
      }

      if (!options.dryRun && report.summary.newArtifacts > 0) {
        console.log(
          chalk.green(
            `\n✓ Created ${report.summary.newArtifacts} draft artifact(s)`,
          ),
        );
      }

      if (report.summary.suggestedUpdates > 0) {
        console.log(
          chalk.yellow(
            `⚠ ${report.summary.suggestedUpdates} suggested update(s) — review matched artifacts`,
          ),
        );
      }
    });
}
