/**
 * anchored-spec diff
 *
 * Semantic diff between EA artifact states at different git refs.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import {
  resolveEaConfig,
} from "../../ea/index.js";
import {
  diffEaGitRefs,
} from "../../ea/diff-git.js";
import {
  renderDiffMarkdown,
  renderDiffSummary,
} from "../../ea/diff.js";
import { CliError } from "../errors.js";

export function eaDiffCommand(): Command {
  return new Command("diff")
    .description("Semantic diff of EA artifacts between git refs")
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
    .action(async (ref, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });
      const eaRoot = eaConfig.rootDir;

      const baseRef = ref ?? options.base;
      if (!baseRef) {
        throw new CliError(
          "Specify a base ref: anchored-spec diff <ref> or --base <ref>",
          2,
        );
      }

      const format = options.json ? "json" : (options.format as string);

      const report = diffEaGitRefs({
        projectRoot: cwd,
        eaRoot,
        baseRef,
        headRef: options.head,
      });

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
