/**
 * anchored-spec ea status
 *
 * Show EA entity health dashboard — counts by domain, kind, status.
 * EA replacement for the core `status` command.
 */

import { Command } from "commander";
import chalk from "chalk";
import { EaRoot } from "../../ea/loader.js";
import { resolveConfigV1 } from "../../ea/config.js";
import { EA_DOMAINS } from "../../ea/types.js";
import type { EaDomain } from "../../ea/types.js";
import {
  getEntityAnchors,
  getEntityConfidence,
  getEntityDomain,
  getEntityKind,
  getEntitySchema,
  getEntitySpecRelations,
  getEntityStatus,
} from "../../ea/backstage/accessors.js";
import { CliError } from "../errors.js";

export function eaStatusCommand(): Command {
  return new Command("status")
    .description("Show EA entity health dashboard")
    .option("--json", "Output as JSON")
    .option("--domain <domain>", "Filter by domain")
    .option("--root-dir <path>", "EA root directory", "docs")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const eaRoot = new EaRoot(cwd, eaConfig);

      if (!eaRoot.isInitialized()) {
        throw new CliError("Error: EA not initialized. Run 'anchored-spec init' first.");
      }

      const loadResult = await eaRoot.loadEntities();
      let entities = loadResult.entities;

      // Filter by domain
      if (options.domain) {
        const domain = options.domain as string;
        if (!EA_DOMAINS.includes(domain as EaDomain)) {
          throw new CliError(`Invalid domain "${domain}". Valid: ${EA_DOMAINS.join(", ")}`);
        }
        entities = entities.filter((entity) => getEntityDomain(entity) === domain);
      }

      // Group by various dimensions
      const byDomain: Record<string, number> = {};
      const byKind: Record<string, number> = {};
      const bySchema: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      const byConfidence: Record<string, number> = {};
      let relationCount = 0;
      let anchoredCount = 0;

      for (const entity of entities) {
        const kind = getEntityKind(entity);
        const schema = getEntitySchema(entity);
        const domain = getEntityDomain(entity) ?? "unknown";
        byDomain[domain] = (byDomain[domain] ?? 0) + 1;
        byKind[kind] = (byKind[kind] ?? 0) + 1;
        bySchema[schema] = (bySchema[schema] ?? 0) + 1;
        const status = getEntityStatus(entity);
        byStatus[status] = (byStatus[status] ?? 0) + 1;
        const confidence = getEntityConfidence(entity);
        byConfidence[confidence] = (byConfidence[confidence] ?? 0) + 1;
        relationCount += getEntitySpecRelations(entity).reduce((count, relation) => {
          return count + relation.targets.length;
        }, 0);
        const anchors = getEntityAnchors(entity);
        if (anchors && Object.keys(anchors).length > 0) anchoredCount++;
      }

      if (options.json) {
        console.log(JSON.stringify({
          total: entities.length,
          byDomain,
          byKind,
          bySchema,
          byStatus,
          byConfidence,
          relationCount,
          anchoredCount,
          errorCount: loadResult.errors.length,
        }, null, 2));
        return;
      }

      // Human-readable output
      console.log(chalk.blue("📊 Anchored Spec — Entity Status Dashboard\n"));

      if (entities.length === 0) {
        console.log(chalk.dim("  No entities found."));
        return;
      }

      // Domain breakdown
      console.log(chalk.bold("Entities by Domain"));
      for (const [domain, count] of Object.entries(byDomain).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${domain}: ${count}`);
      }
      console.log(`  ${chalk.bold("Total")}: ${entities.length}`);

      console.log("");

      // Status breakdown
      console.log(chalk.bold("By Status"));
      for (const [status, count] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
        const color = status === "active" ? chalk.green : status === "draft" ? chalk.yellow : chalk.dim;
        console.log(`  ${color(status)}: ${count}`);
      }

      console.log("");

      // Confidence breakdown
      console.log(chalk.bold("By Confidence"));
      for (const [conf, count] of Object.entries(byConfidence).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${conf}: ${count}`);
      }

      console.log("");

      console.log(chalk.bold("By Schema"));
      for (const [schema, count] of Object.entries(bySchema).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${schema}: ${count}`);
      }

      console.log("");

      // Relations and anchors
      console.log(chalk.bold("Connectivity"));
      console.log(`  Relations: ${relationCount}`);
      console.log(`  Anchored entities: ${anchoredCount}/${entities.length}`);

      if (loadResult.errors.length > 0) {
        console.log(chalk.red(`\n  ⚠ ${loadResult.errors.length} loading error(s)`));
      }

      console.log("");
    });
}
