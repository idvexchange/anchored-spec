/**
 * anchored-spec impact
 *
 * Analyze which requirements are affected by file changes.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { SpecRoot } from "../../core/index.js";
import { analyzeImpact, generateImpactMap } from "../../core/impact.js";
import { CliError } from "../errors.js";

export function impactCommand(): Command {
  return new Command("impact")
    .description("Analyze which requirements are affected by file changes")
    .argument("[paths...]", "File paths to analyze")
    .option("--json", "Output as JSON")
    .option("--generate", "Generate full impact map")
    .action((paths: string[], options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
      }

      const requirements = spec.loadRequirements();
      const changes = spec.loadChanges();

      if (options.generate) {
        console.log(chalk.blue("📊 Generating impact map\n"));

        const map = generateImpactMap(requirements, changes, cwd);
        const outputPath = join(spec.generatedDir, "impact-map.json");
        writeFileSync(outputPath, JSON.stringify(map, null, 2) + "\n");

        console.log(chalk.green(`  ✓ Generated impact map: ${map.entries.length} entries`));
        console.log(chalk.dim(`  Output: ${outputPath}`));
        return;
      }

      if (paths.length === 0) {
        console.log(chalk.yellow("No paths provided. Use --generate for a full map."));
        return;
      }

      console.log(chalk.blue("📊 Impact Analysis\n"));

      const results = analyzeImpact(paths, requirements, changes);

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      for (const result of results) {
        if (result.matchedRequirements.length === 0) {
          console.log(chalk.dim(`  ${result.path}: no affected requirements`));
        } else {
          console.log(chalk.white(`  ${result.path}:`));
          for (const match of result.matchedRequirements) {
            const icon =
              match.matchReason === "scope"
                ? "📁"
                : match.matchReason === "semanticRef"
                  ? "🔗"
                  : "🧪";
            console.log(chalk.dim(`    ${icon} ${match.reqId} (${match.matchReason}): ${match.details}`));
          }
        }
      }

      const totalAffected = new Set(
        results.flatMap((r) => r.matchedRequirements.map((m) => m.reqId)),
      ).size;
      console.log(
        chalk.dim(`\n  ${paths.length} file(s) analyzed, ${totalAffected} requirement(s) affected`),
      );
    });
}
