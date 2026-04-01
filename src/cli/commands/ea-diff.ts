/**
 * anchored-spec diff
 *
 * Semantic diff between entity states at different git refs.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import {
  resolveConfigV1,
} from "../../ea/index.js";
import {
  diffEaGitRefs,
} from "../../ea/diff-git.js";
import {
  renderDiffMarkdown,
  renderDiffSummary,
} from "../../ea/diff.js";
import {
  assessCompatibility,
  renderCompatMarkdown,
  renderCompatSummary,
} from "../../ea/compat.js";
import type { CompatibilityLevel } from "../../ea/compat.js";
import {
  enforceVersionPolicies,
  renderPolicyMarkdown,
  renderPolicySummary,
} from "../../ea/version-policy.js";
import type { VersionPolicyConfig } from "../../ea/version-policy.js";
import { CliError } from "../errors.js";

export function eaDiffCommand(): Command {
  return new Command("diff")
    .description("Semantic diff of entities between git refs")
    .argument("[ref]", "Base git ref (branch, tag, SHA). Head defaults to working tree.")
    .option("--base <ref>", "Base git ref (alternative to positional argument)")
    .option("--head <ref>", "Head git ref (default: working tree)")
    .option("--format <format>", "Output format: markdown, json", "markdown")
    .option("--summary", "Print one-line summary only")
    .option("--domain <domain>", "Filter diffs to a specific EA domain")
    .option("--semantic <semantic>", "Filter to specific field semantic")
    .option("--output <file>", "Write to file instead of stdout")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--json", "Shorthand for --format json")
    .option("--compat", "Show compatibility assessment (breaking/additive/etc.)")
    .option("--policy", "Enforce version policies against compatibility assessment")
    .option("--fail-on <level>", "Exit non-zero if compatibility level met: breaking, ambiguous")
    .action(async (ref, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });

      const baseRef = ref ?? options.base;
      if (!baseRef) {
        throw new CliError(
          "Specify a base ref: anchored-spec diff <ref> or --base <ref>",
          2,
        );
      }

      const format = options.json ? "json" : (options.format as string);

      const diffResult = diffEaGitRefs({
        projectRoot: cwd,
        config: eaConfig,
        baseRef,
        headRef: options.head,
      });
      const { report, baseEntities, headEntities } = diffResult;

      // Apply domain filter
      if (options.domain) {
        report.diffs = report.diffs.filter((d) => d.domain === options.domain);
        // Recompute summary
        report.summary.added = report.diffs.filter((d) => d.changeType === "added").length;
        report.summary.removed = report.diffs.filter((d) => d.changeType === "removed").length;
        report.summary.modified = report.diffs.filter((d) => d.changeType === "modified").length;
        report.summary.unchanged = report.diffs.filter((d) => d.changeType === "unchanged").length;
      }

      // Apply semantic filter
      if (options.semantic) {
        for (const diff of report.diffs) {
          diff.fieldChanges = diff.fieldChanges.filter(
            (fc) => fc.semantic === options.semantic,
          );
        }
      }

      // Compatibility assessment
      if (options.compat || options.policy) {
        const compatReport = assessCompatibility(report, {
          base: baseEntities,
          head: headEntities,
        });

        // Policy enforcement (requires compat)
        if (options.policy) {
          // Load config for version policy
          let policyConfig: VersionPolicyConfig | undefined;
          try {
            const { readFileSync } = await import("node:fs");
            const { join } = await import("node:path");
            const configPath = join(cwd, ".anchored-spec", "config.json");
            const rawConfig = JSON.parse(readFileSync(configPath, "utf-8"));
            policyConfig = rawConfig.versionPolicy as VersionPolicyConfig | undefined;
          } catch {
            // No config or no versionPolicy section — use defaults
          }

          const policyReport = enforceVersionPolicies(
            compatReport,
            { base: baseEntities, head: headEntities },
            policyConfig,
          );

          if (options.summary) {
            process.stdout.write(renderPolicySummary(policyReport) + "\n");
          } else if (format === "json") {
            const output = JSON.stringify(policyReport, null, 2);
            if (options.output) {
              writeFileSync(options.output, output + "\n");
              process.stdout.write(chalk.green(`✓ Policy report written to ${options.output}`) + "\n");
            } else {
              process.stdout.write(output + "\n");
            }
          } else {
            const output = renderPolicyMarkdown(policyReport);
            if (options.output) {
              writeFileSync(options.output, output + "\n");
              process.stdout.write(chalk.green(`✓ Policy report written to ${options.output}`) + "\n");
            } else {
              process.stdout.write(output + "\n");
            }
          }

          if (!policyReport.passed) {
            throw new CliError(
              `Version policy check failed: ${policyReport.summary.violations} violation(s)`,
              1,
            );
          }
          return;
        }

        // Compat-only (no policy)
        if (options.summary) {
          process.stdout.write(renderCompatSummary(compatReport) + "\n");
        } else if (format === "json") {
          const output = JSON.stringify(compatReport, null, 2);
          if (options.output) {
            writeFileSync(options.output, output + "\n");
            process.stdout.write(chalk.green(`✓ Compat report written to ${options.output}`) + "\n");
          } else {
            process.stdout.write(output + "\n");
          }
        } else {
          const output = renderCompatMarkdown(compatReport);
          if (options.output) {
            writeFileSync(options.output, output + "\n");
            process.stdout.write(chalk.green(`✓ Compat report written to ${options.output}`) + "\n");
          } else {
            process.stdout.write(output + "\n");
          }
        }

        // --fail-on gate
        if (options.failOn) {
          const threshold = options.failOn as string;
          const levels: Record<string, CompatibilityLevel[]> = {
            breaking: ["breaking"],
            ambiguous: ["breaking", "ambiguous"],
          };
          const failLevels = levels[threshold];
          if (failLevels && failLevels.includes(compatReport.overallLevel)) {
            throw new CliError(
              `Compatibility check failed: ${compatReport.overallLevel} changes detected`,
              1,
            );
          }
        }
        return;
      }

      // Output
      if (options.summary) {
        const line = renderDiffSummary(report);
        process.stdout.write(line + "\n");
        return;
      }

      let output: string;
      if (format === "json") {
        output = JSON.stringify(report, null, 2);
      } else {
        output = renderDiffMarkdown(report);
      }

      if (options.output) {
        writeFileSync(options.output, output + "\n");
        process.stdout.write(
          chalk.green(`✓ Diff written to ${options.output}`) + "\n",
        );
      } else {
        process.stdout.write(output + "\n");
      }
    });
}
