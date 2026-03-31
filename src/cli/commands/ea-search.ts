/**
 * anchored-spec search <query>
 *
 * Find EA artifacts by ID, name, kind, domain, tag, or status.
 */

import { Command } from "commander";
import chalk from "chalk";
import { EaRoot } from "../../ea/loader.js";
import type { EaArtifactBase } from "../../ea/types.js";
import { getDomainForKind, resolveEaConfig } from "../../ea/index.js";

export function eaSearchCommand(): Command {
  return new Command("search")
    .description("Search EA artifacts by ID, name, kind, domain, tag, or status")
    .argument("<query>", "Search term (matches against ID, name, kind, tags, and status)")
    .option("--kind <kind>", "Filter by artifact kind")
    .option("--domain <domain>", "Filter by EA domain")
    .option("--status <status>", "Filter by status (draft, active, deprecated, retired)")
    .option("--tag <tag>", "Filter by tag")
    .option("--confidence <level>", "Filter by confidence (declared, observed, inferred)")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--json", "Output results as JSON")
    .action(async (query: string, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir as string });
      const root = new EaRoot(cwd, { specDir: "specs", outputDir: "output", ea: eaConfig } as never);
      const loadResult = await root.loadArtifacts();

      const queryLower = query.toLowerCase();

      let results: EaArtifactBase[] = loadResult.artifacts.filter((a: EaArtifactBase) => {
        const searchable = [
          a.id,
          a.title,
          a.kind,
          a.summary,
          ...(a.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(queryLower);
      });

      // Apply filters
      if (options.kind) {
        results = results.filter((a: EaArtifactBase) => a.kind === options.kind);
      }
      if (options.domain) {
        results = results.filter((a: EaArtifactBase) => getDomainForKind(a.kind) === options.domain);
      }
      if (options.status) {
        results = results.filter(
          (a: EaArtifactBase) => a.status === options.status,
        );
      }
      if (options.tag) {
        const tag = (options.tag as string).toLowerCase();
        results = results.filter((a: EaArtifactBase) => {
          const tags = (a.tags ?? []).map((t: string) => t.toLowerCase());
          return tags.includes(tag);
        });
      }
      if (options.confidence) {
        results = results.filter(
          (a: EaArtifactBase) => a.confidence === options.confidence,
        );
      }

      if (options.json) {
        const output = results.map((a: EaArtifactBase) => ({
          id: a.id,
          kind: a.kind,
          name: a.title,
          status: a.status,
          confidence: a.confidence,
          domain: getDomainForKind(a.kind),
        }));
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      if (results.length === 0) {
        console.log(chalk.yellow(`No artifacts matching "${query}"`));
        return;
      }

      console.log(chalk.blue(`Found ${results.length} artifact${results.length === 1 ? "" : "s"}:\n`));

      for (const a of results) {
        const domain = getDomainForKind(a.kind) ?? "unknown";

        console.log(
          `  ${chalk.green(a.id)} ${chalk.dim("·")} ${a.title}`,
        );
        console.log(
          chalk.dim(`    ${a.kind} · ${domain} · ${a.status} · ${a.confidence}`),
        );
      }
    });
}
