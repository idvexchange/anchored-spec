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
  renderDiscoveryReportMarkdown,
  createResolverCache,
  OpenApiResolver,
  KubernetesResolver,
  TerraformResolver,
  SqlDdlResolver,
  DbtResolver,
  silentLogger,
  consoleLogger,
} from "../../ea/index.js";
import type { EaResolver } from "../../ea/resolvers/types.js";
import type { EaArtifactDraft } from "../../ea/discovery.js";
import { CliError } from "../errors.js";

/** Map resolver names to their class constructors. */
const RESOLVER_MAP: Record<string, new () => EaResolver> = {
  openapi: OpenApiResolver,
  kubernetes: KubernetesResolver,
  terraform: TerraformResolver,
  "sql-ddl": SqlDdlResolver,
  dbt: DbtResolver,
};

const AVAILABLE_RESOLVERS = Object.keys(RESOLVER_MAP).join(", ");

export function eaDiscoverCommand(): Command {
  return new Command("discover")
    .description("Discover EA artifacts from external sources")
    .option("--resolver <name>", `Resolver to run: ${AVAILABLE_RESOLVERS}`)
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

      // Build resolver cache
      const cache = createResolverCache(cwd, {
        noCache: options.cache === false,
        maxCacheAge: options.maxCacheAge ? parseInt(options.maxCacheAge as string, 10) : undefined,
      });

      const logger = process.env.DEBUG ? consoleLogger : silentLogger;
      const resolverName = (options.resolver as string | undefined);

      // Instantiate resolver(s) and run discovery
      const drafts: EaArtifactDraft[] = [];
      const resolverNames: string[] = [];

      if (resolverName) {
        // Run specific resolver
        const ResolverClass = RESOLVER_MAP[resolverName];
        if (!ResolverClass) {
          throw new CliError(
            `Unknown resolver "${resolverName}". Available: ${AVAILABLE_RESOLVERS}`,
            2,
          );
        }

        const resolver = new ResolverClass();
        resolverNames.push(resolver.name);

        const discovered = resolver.discoverArtifacts?.({
          projectRoot: cwd,
          artifacts: result.artifacts,
          cache,
          logger,
          source: options.source as string | undefined,
        });

        if (discovered) {
          drafts.push(...discovered);
        }
      } else {
        // No resolver specified — run all resolvers
        for (const [, ResolverClass] of Object.entries(RESOLVER_MAP)) {
          const resolver = new ResolverClass();
          resolverNames.push(resolver.name);

          const discovered = resolver.discoverArtifacts?.({
            projectRoot: cwd,
            artifacts: result.artifacts,
            cache,
            logger,
            source: options.source as string | undefined,
          });

          if (discovered) {
            drafts.push(...discovered);
          }
        }
      }

      const report = discoverArtifacts({
        existingArtifacts: result.artifacts,
        drafts,
        resolverNames,
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
