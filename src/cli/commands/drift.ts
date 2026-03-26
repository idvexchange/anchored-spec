/**
 * anchored-spec drift — Semantic drift detection
 *
 * Scans source files to verify that semanticRefs (interfaces, routes,
 * symbols, error codes) referenced in requirements still exist in code.
 */

import { Command } from "commander";
import chalk from "chalk";
import { SpecRoot, resolveConfig } from "../../core/loader.js";
import { detectDrift } from "../../core/drift.js";
import type { DriftFinding } from "../../core/types.js";

export function driftCommand(): Command {
  const cmd = new Command("drift")
    .description("Detect semantic drift between specs and source code")
    .option("--root <dir>", "Source root(s) to scan (comma-separated)", "src")
    .option("--json", "Output as JSON")
    .option(
      "--fail-on-missing",
      "Exit with error code if any refs are missing",
      false,
    )
    .action(async (opts: { root: string; json?: boolean; failOnMissing?: boolean }) => {
      const projectRoot = process.cwd();
      const config = resolveConfig(projectRoot);
      const spec = new SpecRoot(projectRoot, config);

      if (!spec.isInitialized()) {
        console.error(
          chalk.red("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first."),
        );
        process.exit(1);
      }

      const requirements = spec.loadRequirements();
      const activeReqs = requirements.filter(
        (r) => r.status === "active" || r.status === "shipped",
      );

      if (activeReqs.length === 0) {
        if (opts.json) {
          console.log(JSON.stringify({ findings: [], summary: { totalRefs: 0, found: 0, missing: 0 } }));
        } else {
          console.log(chalk.yellow("No active/shipped requirements with semantic refs to check."));
        }
        return;
      }

      const sourceRoots = opts.root.split(",").map((r) => r.trim());
      const report = detectDrift(requirements, {
        projectRoot,
        sourceRoots,
        sourceGlobs: config.sourceGlobs,
      });

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      // Pretty print
      const missing = report.findings.filter((f) => f.status === "missing");
      const found = report.findings.filter((f) => f.status === "found");

      if (report.findings.length === 0) {
        console.log(chalk.yellow("No semantic refs found in active/shipped requirements."));
        return;
      }

      console.log(chalk.bold("\n📡 Semantic Drift Report\n"));
      console.log(
        `  Total refs: ${report.summary.totalRefs}  |  ` +
        `${chalk.green(`Found: ${report.summary.found}`)}  |  ` +
        `${report.summary.missing > 0 ? chalk.red(`Missing: ${report.summary.missing}`) : chalk.green("Missing: 0")}`,
      );

      if (found.length > 0) {
        console.log(chalk.green(`\n✅ Resolved (${found.length}):`));
        for (const f of found) {
          console.log(
            `   ${chalk.dim(f.reqId)} ${formatRef(f)} → ${chalk.dim(f.foundIn?.slice(0, 2).join(", ") ?? "")}`,
          );
        }
      }

      if (missing.length > 0) {
        console.log(chalk.red(`\n❌ Missing (${missing.length}):`));
        for (const f of missing) {
          console.log(`   ${chalk.dim(f.reqId)} ${formatRef(f)}`);
        }
      }

      console.log();

      if (opts.failOnMissing && missing.length > 0) {
        process.exit(1);
      }
    });

  return cmd;
}

function formatRef(f: DriftFinding): string {
  const kindLabel: Record<string, string> = {
    interface: "interface",
    symbol: "symbol",
    route: "route",
    errorCode: "error",
    schema: "schema",
  };
  return `[${kindLabel[f.kind] ?? f.kind}] ${f.ref}`;
}
