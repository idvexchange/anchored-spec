/**
 * anchored-spec drift — Semantic drift detection
 *
 * Scans source files to verify that semanticRefs (interfaces, routes,
 * symbols, error codes) referenced in requirements still exist in code.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SpecRoot, resolveConfig } from "../../core/loader.js";
import { detectDrift } from "../../core/drift.js";
import type { DriftFinding, DriftReport, DriftResolver } from "../../core/types.js";
import { CliError } from "../errors.js";

const RESOLVER_EXT_PATTERN = /\.(js|mjs|cjs)$/;

async function loadResolvers(paths: string[], projectRoot: string): Promise<DriftResolver[]> {
  const resolvers: DriftResolver[] = [];
  for (const p of paths) {
    const isBareSpecifier = !p.startsWith(".") && !p.startsWith("/");
    if (!isBareSpecifier && !RESOLVER_EXT_PATTERN.test(p)) {
      throw new CliError(`Invalid drift resolver path "${p}". Must be a .js, .mjs, or .cjs file.`);
    }
    const importPath = isBareSpecifier ? p : join(projectRoot, p);
    try {
      const mod = await import(importPath);
      const resolver: DriftResolver = mod.default ?? mod;
      if (typeof resolver.resolve !== "function") {
        throw new CliError(`Drift resolver "${p}" does not export a resolve() function.`);
      }
      resolvers.push(resolver);
    } catch (err) {
      if (err instanceof CliError) throw err;
      // Graceful degradation: warn and skip if an optional resolver can't load
      if (isBareSpecifier) {
        console.error(chalk.yellow(`⚠ Could not load drift resolver "${p}" — skipping. Install its dependencies to enable it.`));
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new CliError(`Failed to load drift resolver "${p}": ${message}`);
    }
  }
  return resolvers;
}

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
    .option("--generate-map", "Write semantic-links.json to generated dir")
    .option("--check-map", "Check if semantic-links.json is stale")
    .option("--resolver <path...>", "Additional drift resolver module paths")
    .action(async (opts: { root: string; json?: boolean; failOnMissing?: boolean; generateMap?: boolean; checkMap?: boolean; resolver?: string[] }) => {
      const projectRoot = process.cwd();
      const config = resolveConfig(projectRoot);
      const spec = new SpecRoot(projectRoot, config);

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
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

      // Load resolvers from config + CLI flag
      const resolverPaths = [
        ...(config.driftResolvers ?? []),
        ...(opts.resolver ?? []),
      ];
      const resolvers = resolverPaths.length > 0
        ? await loadResolvers(resolverPaths, projectRoot)
        : undefined;

      const report = detectDrift(requirements, {
        projectRoot,
        sourceRoots,
        sourceGlobs: config.sourceGlobs,
        resolvers,
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

      // Generate semantic link map
      if (opts.generateMap) {
        const mapPath = join(spec.generatedDir, "semantic-links.json");
        const mapData = buildSemanticLinkMap(report);
        writeFileSync(mapPath, JSON.stringify(mapData, null, 2) + "\n");
        console.log(chalk.green(`  ✓ Wrote semantic-links.json (${report.summary.totalRefs} refs)`));
      }

      // Check map freshness
      if (opts.checkMap) {
        const mapPath = join(spec.generatedDir, "semantic-links.json");
        if (!existsSync(mapPath)) {
          console.log(chalk.red("  ✗ semantic-links.json not found. Run --generate-map first."));
          throw new CliError("", 1);
        }
        const existing = JSON.parse(readFileSync(mapPath, "utf-8"));
        const fresh = buildSemanticLinkMap(report);
        const isStale =
          existing.summary?.found !== fresh.summary.found ||
          existing.summary?.missing !== fresh.summary.missing ||
          existing.summary?.totalRefs !== fresh.summary.totalRefs;

        if (isStale) {
          console.log(chalk.red("  ✗ semantic-links.json is stale. Regenerate with --generate-map."));
          throw new CliError("", 1);
        }
        console.log(chalk.green("  ✓ semantic-links.json is up to date."));
      }

      if (opts.failOnMissing && missing.length > 0) {
        throw new CliError("", 1);
      }
    });

  return cmd;
}

export function buildSemanticLinkMap(report: DriftReport) {
  const byReq = new Map<string, DriftFinding[]>();
  for (const f of report.findings) {
    const arr = byReq.get(f.reqId) ?? [];
    arr.push(f);
    byReq.set(f.reqId, arr);
  }

  return {
    generatedAt: new Date().toISOString(),
    requirements: [...byReq.entries()].map(([reqId, refs]) => ({
      reqId,
      refs: refs.map((r) => ({
        kind: r.kind,
        ref: r.ref,
        status: r.status,
        ...(r.foundIn ? { foundIn: r.foundIn } : {}),
      })),
    })),
    summary: {
      totalRefs: report.summary.totalRefs,
      found: report.summary.found,
      missing: report.summary.missing,
      resolutionRate:
        report.summary.totalRefs > 0
          ? Math.round((report.summary.found / report.summary.totalRefs) * 1000) / 1000
          : 1,
    },
  };
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
