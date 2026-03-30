/**
 * anchored-spec ea status
 *
 * Show EA artifact health dashboard — counts by domain, kind, status.
 * EA replacement for the core `status` command.
 */

import { Command } from "commander";
import chalk from "chalk";
import { EaRoot } from "../../ea/loader.js";
import { resolveEaConfig } from "../../ea/config.js";
import { getDomainForKind, EA_DOMAINS } from "../../ea/types.js";
import type { EaDomain } from "../../ea/types.js";
import { CliError } from "../errors.js";

export function eaStatusCommand(): Command {
  return new Command("status")
    .description("Show EA artifact health dashboard")
    .option("--json", "Output as JSON")
    .option("--domain <domain>", "Filter by domain")
    .option("--root-dir <path>", "EA root directory", "ea")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });
      const eaRoot = new EaRoot(cwd, { specDir: "specs", outputDir: "output", ea: eaConfig } as never);

      if (!eaRoot.isInitialized()) {
        throw new CliError("Error: EA not initialized. Run 'anchored-spec ea init' first.");
      }

      const loadResult = await eaRoot.loadArtifacts();
      let artifacts = loadResult.artifacts;

      // Filter by domain
      if (options.domain) {
        const domain = options.domain as string;
        if (!EA_DOMAINS.includes(domain as EaDomain)) {
          throw new CliError(`Invalid domain "${domain}". Valid: ${EA_DOMAINS.join(", ")}`);
        }
        artifacts = artifacts.filter((a) => getDomainForKind(a.kind) === domain);
      }

      // Group by various dimensions
      const byDomain: Record<string, number> = {};
      const byKind: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      const byConfidence: Record<string, number> = {};
      let relationCount = 0;
      let anchoredCount = 0;

      for (const a of artifacts) {
        const domain = getDomainForKind(a.kind) ?? "unknown";
        byDomain[domain] = (byDomain[domain] ?? 0) + 1;
        byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
        byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
        byConfidence[a.confidence] = (byConfidence[a.confidence] ?? 0) + 1;
        relationCount += a.relations?.length ?? 0;
        if (a.anchors && Object.keys(a.anchors).length > 0) anchoredCount++;
      }

      if (options.json) {
        console.log(JSON.stringify({
          total: artifacts.length,
          byDomain,
          byKind,
          byStatus,
          byConfidence,
          relationCount,
          anchoredCount,
          errorCount: loadResult.errors.length,
        }, null, 2));
        return;
      }

      // Human-readable output
      console.log(chalk.blue("📊 Anchored Spec — EA Status Dashboard\n"));

      if (artifacts.length === 0) {
        console.log(chalk.dim("  No artifacts found."));
        return;
      }

      // Domain breakdown
      console.log(chalk.bold("Artifacts by Domain"));
      for (const [domain, count] of Object.entries(byDomain).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${domain}: ${count}`);
      }
      console.log(`  ${chalk.bold("Total")}: ${artifacts.length}`);

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

      // Relations and anchors
      console.log(chalk.bold("Connectivity"));
      console.log(`  Relations: ${relationCount}`);
      console.log(`  Anchored artifacts: ${anchoredCount}/${artifacts.length}`);

      if (loadResult.errors.length > 0) {
        console.log(chalk.red(`\n  ⚠ ${loadResult.errors.length} loading error(s)`));
      }

      console.log("");
    });
}
