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
  loadProjectConfig,
  getConfiguredDocScanDirs,
  discoverEntities,
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
import type { EaResolver, ResolverLogger } from "../../ea/resolvers/types.js";
import type { EntityDraft } from "../../ea/discovery.js";
import { loadResolversFromConfig } from "../../ea/resolvers/loader.js";
import type { BackstageEntity } from "../../ea/backstage/types.js";
import type { ResolverCache } from "../../ea/cache.js";
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
const DEFAULT_DISCOVERY_RESOLVER_NAMES = [
  "openapi",
  "kubernetes",
  "terraform",
  "sql-ddl",
  "dbt",
  "markdown",
] as const;

async function runLoadedResolvers(
  resolvers: Awaited<ReturnType<typeof loadResolversFromConfig>>,
  ctx: {
    projectRoot: string;
    entities: BackstageEntity[];
    cache: ResolverCache;
    logger: ResolverLogger;
    source?: string;
    sourcePaths?: string[];
  },
): Promise<{ drafts: EntityDraft[]; resolverNames: string[] }> {
  const drafts: EntityDraft[] = [];
  const resolverNames: string[] = [];

  for (const lr of resolvers) {
    resolverNames.push(lr.name);

    if (lr.isAsync && lr.discoverAsync) {
      const discovered = await lr.discoverAsync(ctx);
      if (discovered) drafts.push(...discovered);
    } else if (lr.discoverSync) {
      const discovered = lr.discoverSync(ctx);
      if (discovered) drafts.push(...discovered);
    }
  }

  return { drafts, resolverNames };
}

export function eaDiscoverCommand(): Command {
  return new Command("discover")
    .description("Discover entities from external sources")
    .option("--resolver <name>", `Resolver to run: ${AVAILABLE_RESOLVERS}`)
    .option("--source <path>", "Source path to scan")
    .option("--dry-run", "Show what would be created without writing files")
    .option("--from-docs", "Discover entities from document frontmatter (prose-first workflow)")
    .option("--doc-dirs <dirs>", "Comma-separated doc directories for --from-docs")
    .option("--write-facts", "Persist extracted fact manifests to .ea/facts/ directory")
    .option("--json", "Output discovery report as JSON")
    .option("--max-cache-age <seconds>", "Maximum cache age in seconds")
    .option("--no-cache", "Disable resolver cache")
    .option("--root-dir <path>", "EA root directory", "docs")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = loadProjectConfig(cwd, options.rootDir);
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec init' first.",
          2,
        );
      }

      const result = await root.loadEntities();
      const existingEntities = result.entities;

      // ── --from-docs: prose-first discovery ──────────────────────────
      if (options.fromDocs) {
        const docDirs = options.docDirs
          ? (options.docDirs as string).split(",").map((d: string) => d.trim())
          : (getConfiguredDocScanDirs(eaConfig) ?? ["docs", "specs", "."]);
        const scanResult = scanDocs(cwd, { dirs: docDirs });
        const docResult = discoverFromDocs(scanResult.docs, existingEntities);

        // Feed doc-discovered drafts into the standard pipeline
        const report = await discoverEntities({
          existingEntities,
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
                docsWithEntityRefs: scanResult.docs.length,
                alreadyExists: docResult.alreadyExists,
                invalidRefs: docResult.invalidRefs,
              },
          }, null, 2) + "\n");
        } else {
          const md = renderDiscoveryReportMarkdown(report);
          process.stdout.write(md);

          if (docResult.invalidRefs.length > 0) {
            console.log(
              chalk.yellow(
                `\n⚠ Invalid Backstage entity refs: ${docResult.invalidRefs.join(", ")}`,
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

        if (!options.dryRun && report.summary.newEntities > 0) {
          console.log(
            chalk.green(
              `\n✓ Created ${report.summary.newEntities} draft entit${report.summary.newEntities === 1 ? "y" : "ies"} from doc frontmatter`,
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
      const source = options.source as string | undefined;
      const configuredDocScanDirs = !source
        ? (getConfiguredDocScanDirs(eaConfig) ?? undefined)
        : undefined;

      // Use entity-first context for resolver execution.
      const entities = result.entities;

      // Instantiate resolver(s) and run discovery
      const drafts: EntityDraft[] = [];
      const resolverNames: string[] = [];
      let markdownResolver: InstanceType<typeof MarkdownResolver> | undefined;

      if (resolverName) {
        const configuredResolvers = eaConfig.resolvers?.filter(
          (resolver) => resolver.name === resolverName,
        ) ?? [];

        if (configuredResolvers.length > 0) {
          try {
            const loaded = await loadResolversFromConfig(
              configuredResolvers,
              RESOLVER_MAP,
              cwd,
            );
            const configuredRun = await runLoadedResolvers(loaded, {
              projectRoot: cwd,
              entities,
              cache,
              logger,
              source,
              sourcePaths: configuredDocScanDirs,
            });
            drafts.push(...configuredRun.drafts);
            resolverNames.push(...configuredRun.resolverNames);
          } catch (err) {
            throw new CliError(
              err instanceof Error ? err.message : String(err),
              1,
            );
          }
        } else if (resolverName === "tree-sitter") {
          // Tree-sitter resolver (async, language-agnostic)
          const packs = getQueryPacks();
          const resolver = new TreeSitterDiscoveryResolver(packs);
          resolverNames.push(resolver.name);

          let discovered: EntityDraft[] | null;
          try {
            discovered = await resolver.discoverEntities({
              projectRoot: cwd,
              entities,
              cache,
              logger,
              source,
              sourcePaths: configuredDocScanDirs,
            });
          } catch (err) {
            throw new CliError(
              err instanceof Error ? err.message : String(err),
              1,
            );
          }

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

          let discovered: EntityDraft[] | null | undefined;
          try {
            discovered = resolver.discoverEntities?.({
              projectRoot: cwd,
              entities,
              cache,
              logger,
              source,
              sourcePaths: configuredDocScanDirs,
            });
          } catch (err) {
            throw new CliError(
              err instanceof Error ? err.message : String(err),
              1,
            );
          }

          if (discovered) {
            drafts.push(...discovered);
          }
        }
      } else if (eaConfig.resolvers && eaConfig.resolvers.length > 0) {
        // Config-driven resolvers — use resolvers[] from config.json
        try {
          const loaded = await loadResolversFromConfig(
            eaConfig.resolvers,
            RESOLVER_MAP,
            cwd,
          );
          const configuredRun = await runLoadedResolvers(loaded, {
            projectRoot: cwd,
            entities,
            cache,
            logger,
            source,
            sourcePaths: configuredDocScanDirs,
          });
          drafts.push(...configuredRun.drafts);
          resolverNames.push(...configuredRun.resolverNames);
        } catch (err) {
          throw new CliError(
            err instanceof Error ? err.message : String(err),
            1,
          );
        }
      } else {
        // No resolver specified, no config — run default built-in resolvers
        for (const resolverKey of DEFAULT_DISCOVERY_RESOLVER_NAMES) {
          const ResolverClass = RESOLVER_MAP[resolverKey];
          if (!ResolverClass) continue;
          const resolver = new ResolverClass();
          resolverNames.push(resolver.name);
          if (resolver instanceof MarkdownResolver) markdownResolver = resolver;

          const discovered = resolver.discoverEntities?.({
            projectRoot: cwd,
            entities,
            cache,
            logger,
            source,
            sourcePaths: configuredDocScanDirs,
          });

          if (discovered) {
            drafts.push(...discovered);
          }
        }

        // Also run tree-sitter by default if its optional runtime is available.
        try {
          const packs = getQueryPacks();
          if (packs.length > 0) {
            const tsResolver = new TreeSitterDiscoveryResolver(packs);
            resolverNames.push(tsResolver.name);
            const discovered = await tsResolver.discoverEntities({
              projectRoot: cwd,
              entities,
              cache,
              logger,
              source,
              sourcePaths: configuredDocScanDirs,
            });
            if (discovered) {
              drafts.push(...discovered);
            }
          }
        } catch {
          // web-tree-sitter not installed — skip silently
        }
      }

      const report = await discoverEntities({
        existingEntities,
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
          manifests = await extractFactsFromDocs(
            cwd,
            source ?? configuredDocScanDirs,
          );
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

      if (!options.dryRun && report.summary.newEntities > 0) {
        console.log(
          chalk.green(
            `\n✓ Created ${report.summary.newEntities} draft entit${report.summary.newEntities === 1 ? "y" : "ies"}`,
          ),
        );
      }

      if (report.summary.suggestedUpdates > 0) {
        console.log(
          chalk.yellow(
            `⚠ ${report.summary.suggestedUpdates} suggested update(s) — review matched entities`,
          ),
        );
      }
    });
}
