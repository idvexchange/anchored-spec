/**
 * anchored-spec ea discover
 *
 * Discover new entities from sources (OpenAPI, K8s, Terraform, etc.).
 * Creates draft entities with confidence "inferred" or "observed".
 */

import { Command } from "commander";
import chalk from "chalk";
import { join } from "node:path";
import {
  EaRoot,
  resolveConfigV1,
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
  TreeSitterDiscoveryResolver,
  getQueryPacks,
  scanDocs,
  discoverFromDocs,
} from "../../ea/index.js";
import { MarkdownResolver } from "../../ea/resolvers/markdown.js";
import type { EaResolver } from "../../ea/resolvers/types.js";
import type { EaArtifactDraft } from "../../ea/discovery.js";
import { loadResolversFromConfig } from "../../ea/resolvers/loader.js";
import { CliError } from "../errors.js";

/** Map resolver names to their class constructors. */
const RESOLVER_MAP: Record<string, new () => EaResolver> = {
  openapi: OpenApiResolver,
  kubernetes: KubernetesResolver,
  terraform: TerraformResolver,
  "sql-ddl": SqlDdlResolver,
  dbt: DbtResolver,
  markdown: MarkdownResolver,
};

const AVAILABLE_RESOLVERS = [...Object.keys(RESOLVER_MAP), "tree-sitter"].join(", ");

export function eaDiscoverCommand(): Command {
  return new Command("discover")
    .description("Discover entities from external sources")
    .option("--resolver <name>", `Resolver to run: ${AVAILABLE_RESOLVERS}`)
    .option("--source <path>", "Source path to scan")
    .option("--dry-run", "Show what would be created without writing files")
    .option("--from-docs", "Discover entities from document frontmatter (prose-first workflow)")
    .option("--doc-dirs <dirs>", "Comma-separated doc directories for --from-docs", "docs,specs,.")
    .option("--write-facts", "Persist extracted fact manifests to .ea/facts/ directory")
    .option("--json", "Output discovery report as JSON")
    .option("--max-cache-age <seconds>", "Maximum cache age in seconds")
    .option("--no-cache", "Disable resolver cache")
    .option("--root-dir <path>", "EA root directory", "docs")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec init' first.",
          2,
        );
      }

      const result = await root.loadEntities();
      const existingArtifacts = result.entities;

      // ── --from-docs: prose-first discovery ──────────────────────────
      if (options.fromDocs) {
        const docDirs = (options.docDirs as string).split(",").map((d: string) => d.trim());
        const scanResult = scanDocs(cwd, { dirs: docDirs });
        const docResult = discoverFromDocs(scanResult.docs, existingArtifacts);

        // Feed doc-discovered drafts into the standard pipeline
        const report = await discoverArtifacts({
          existingArtifacts,
          drafts: docResult.drafts,
          resolverNames: ["doc-frontmatter"],
          projectRoot: cwd,
          config: eaConfig,
          dryRun: options.dryRun as boolean,
        });

        if (options.json) {
          process.stdout.write(JSON.stringify({
              ...report,
              docDiscovery: {
                docsScanned: scanResult.totalScanned,
                docsWithArtifacts: scanResult.docs.length,
                alreadyExists: docResult.alreadyExists,
                unknownPrefix: docResult.unknownPrefix,
              },
          }, null, 2) + "\n");
        } else {
          const md = renderDiscoveryReportMarkdown(report);
          process.stdout.write(md);

          if (docResult.unknownPrefix.length > 0) {
            console.log(
              chalk.yellow(
                `\n⚠ Unknown prefix for: ${docResult.unknownPrefix.join(", ")}`,
              ),
            );
          }
          if (docResult.alreadyExists.length > 0) {
            console.log(
              chalk.dim(
                 `  (${docResult.alreadyExists.length} existing entities skipped)`,
               ),
             );
          }
        }

        if (!options.dryRun && report.summary.newArtifacts > 0) {
          console.log(
            chalk.green(
              `\n✓ Created ${report.summary.newArtifacts} draft entit${report.summary.newArtifacts === 1 ? "y" : "ies"} from doc frontmatter`,
            ),
          );
          console.log(
            chalk.dim(
              `  Next: refine the drafts, then run 'anchored-spec link-docs' to sync trace links`,
            ),
          );
        }

        return;
      }

      // ── Standard resolver-based discovery ───────────────────────────

      // Build resolver cache
      const cache = createResolverCache(cwd, {
        noCache: options.cache === false,
        maxCacheAge: options.maxCacheAge ? parseInt(options.maxCacheAge as string, 10) : undefined,
      });

      const logger = process.env.DEBUG ? consoleLogger : silentLogger;
      const resolverName = (options.resolver as string | undefined);

      // Use entity-first context for resolver execution.
      const entities = result.entities;

      // Instantiate resolver(s) and run discovery
      const drafts: EaArtifactDraft[] = [];
      const resolverNames: string[] = [];
      let markdownResolver: InstanceType<typeof MarkdownResolver> | undefined;

      if (resolverName) {
        if (resolverName === "tree-sitter") {
          // Tree-sitter resolver (async, language-agnostic)
          const packs = getQueryPacks();
          const resolver = new TreeSitterDiscoveryResolver(packs);
          resolverNames.push(resolver.name);

          const discovered = await resolver.discoverArtifacts({
            projectRoot: cwd,
            artifacts: entities,
            cache,
            logger,
            source: options.source as string | undefined,
          });

          if (discovered) {
            drafts.push(...discovered);
          }
        } else {
          // Standard sync resolver
          const ResolverClass = RESOLVER_MAP[resolverName];
          if (!ResolverClass) {
            throw new CliError(
              `Unknown resolver "${resolverName}". Available: ${AVAILABLE_RESOLVERS}`,
              2,
            );
          }

          const resolver = new ResolverClass();
          resolverNames.push(resolver.name);
          if (resolver instanceof MarkdownResolver) markdownResolver = resolver;

          const discovered = resolver.discoverArtifacts?.({
            projectRoot: cwd,
            artifacts: entities,
            cache,
            logger,
            source: options.source as string | undefined,
          });

          if (discovered) {
            drafts.push(...discovered);
          }
        }
      } else if (eaConfig.resolvers && eaConfig.resolvers.length > 0) {
        // Config-driven resolvers — use resolvers[] from config.json
        const loaded = await loadResolversFromConfig(
          eaConfig.resolvers,
          RESOLVER_MAP,
          cwd,
        );

        for (const lr of loaded) {
          resolverNames.push(lr.name);
          const ctx = {
            projectRoot: cwd,
            artifacts: entities,
            cache,
            logger,
            source: options.source as string | undefined,
          };

          if (lr.isAsync && lr.discoverAsync) {
            const discovered = await lr.discoverAsync(ctx);
            if (discovered) drafts.push(...discovered);
          } else if (lr.discoverSync) {
            const discovered = lr.discoverSync(ctx);
            if (discovered) drafts.push(...discovered);
          }
        }
      } else {
        // No resolver specified, no config — run all built-in resolvers
        for (const [, ResolverClass] of Object.entries(RESOLVER_MAP)) {
          const resolver = new ResolverClass();
          resolverNames.push(resolver.name);
          if (resolver instanceof MarkdownResolver) markdownResolver = resolver;

          const discovered = resolver.discoverArtifacts?.({
            projectRoot: cwd,
            artifacts: entities,
            cache,
            logger,
            source: options.source as string | undefined,
          });

          if (discovered) {
            drafts.push(...discovered);
          }
        }

        // Also run tree-sitter if web-tree-sitter is available
        try {
          const packs = getQueryPacks();
          if (packs.length > 0) {
            const tsResolver = new TreeSitterDiscoveryResolver(packs);
            resolverNames.push(tsResolver.name);
            const discovered = await tsResolver.discoverArtifacts({
              projectRoot: cwd,
              artifacts: entities,
              cache,
              logger,
              source: options.source as string | undefined,
            });
            if (discovered) {
              drafts.push(...discovered);
            }
          }
        } catch {
          // web-tree-sitter not installed — skip silently
        }
      }

      const report = await discoverArtifacts({
        existingArtifacts,
        drafts,
        resolverNames,
        projectRoot: cwd,
        config: eaConfig,
        dryRun: options.dryRun as boolean,
      });

      // Write fact manifests if requested (reuse manifests from resolver to avoid double-parsing)
      if (options.writeFacts) {
        const { writeFactManifests } = await import("../../ea/facts/writer.js");
        let manifests = markdownResolver?.lastManifests;
        if (!manifests || manifests.length === 0) {
          const { extractFactsFromDocs } = await import("../../ea/resolvers/markdown.js");
          manifests = await extractFactsFromDocs(cwd, options.source as string | undefined);
        }
        const factsDir = join(cwd, eaConfig.rootDir ?? "docs", "facts");
        const written = await writeFactManifests(manifests, factsDir);
        if (!options.json) {
          console.log(chalk.dim(`  Wrote ${written.length} fact manifest(s) to ${factsDir}`));
        }
      }

      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      } else {
        const md = renderDiscoveryReportMarkdown(report);
        process.stdout.write(md);
      }

      if (!options.dryRun && report.summary.newArtifacts > 0) {
        console.log(
          chalk.green(
            `\n✓ Created ${report.summary.newArtifacts} draft entit${report.summary.newArtifacts === 1 ? "y" : "ies"}`,
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
