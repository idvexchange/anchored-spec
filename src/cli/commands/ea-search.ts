/**
 * anchored-spec search <query>
 *
 * Find EA artifacts by ID, name, kind, domain, tag, or status.
 */

import { Command } from "commander";
import chalk from "chalk";
import { EaRoot } from "../../ea/loader.js";
import { resolveConfigV1 } from "../../ea/index.js";
import {
  getEntityConfidence,
  getEntityDomain,
  getEntityDescription,
  getEntityId,
  getEntityLegacyKind,
  getEntityStatus,
  getEntityTags,
  getEntityTitle,
} from "../../ea/backstage/accessors.js";
import { formatEntityDisplay, formatEntityHint } from "../entity-ref.js";

export function eaSearchCommand(): Command {
  return new Command("search")
    .description("Search EA artifacts by ID, name, kind, domain, tag, or status")
    .argument("<query>", "Search term (matches against ID, name, kind, tags, and status)")
    .option("--kind <kind>", "Filter by artifact kind")
    .option("--domain <domain>", "Filter by EA domain")
    .option("--status <status>", "Filter by status (draft, active, deprecated, retired)")
    .option("--tag <tag>", "Filter by tag")
    .option("--confidence <level>", "Filter by confidence (declared, observed, inferred)")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--json", "Output results as JSON")
    .action(async (query: string, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir as string });
      const root = new EaRoot(cwd, eaConfig);
      const loadResult = await root.loadEntities();

      const queryLower = query.toLowerCase();

      let results = loadResult.entities.filter((entity) => {
        const searchable = [
          getEntityId(entity),
          getEntityTitle(entity),
          getEntityLegacyKind(entity),
          getEntityDescription(entity),
          ...getEntityTags(entity),
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(queryLower);
      });

      // Apply filters
      if (options.kind) {
        results = results.filter((entity) => getEntityLegacyKind(entity) === options.kind);
      }
      if (options.domain) {
        results = results.filter(
          (entity) => getEntityDomain(entity) === options.domain,
        );
      }
      if (options.status) {
        results = results.filter((entity) => getEntityStatus(entity) === options.status);
      }
      if (options.tag) {
        const tag = (options.tag as string).toLowerCase();
        results = results.filter((entity) =>
          getEntityTags(entity).some((entityTag) => entityTag.toLowerCase() === tag),
        );
      }
      if (options.confidence) {
        results = results.filter((entity) => getEntityConfidence(entity) === options.confidence);
      }

      if (options.json) {
        const output = results.map((entity) => {
          const kind = getEntityLegacyKind(entity);
          return {
            id: getEntityId(entity),
            displayId: formatEntityHint(entity),
            kind,
            name: getEntityTitle(entity),
            status: getEntityStatus(entity),
            confidence: getEntityConfidence(entity),
            domain: getEntityDomain(entity),
          };
        });
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      if (results.length === 0) {
        console.log(chalk.yellow(`No artifacts matching "${query}"`));
        return;
      }

      console.log(chalk.blue(`Found ${results.length} artifact${results.length === 1 ? "" : "s"}:\n`));

      for (const entity of results) {
        const kind = getEntityLegacyKind(entity);
        const domain = getEntityDomain(entity) ?? "unknown";
        const id = formatEntityDisplay(entity);
        const title = getEntityTitle(entity);
        const status = getEntityStatus(entity);
        const confidence = getEntityConfidence(entity);

        console.log(
          `  ${chalk.green(id)} ${chalk.dim("·")} ${title}`,
        );
        console.log(
          chalk.dim(`    ${kind} · ${domain} · ${status} · ${confidence}`),
        );
      }
    });
}
