/**
 * anchored-spec check
 *
 * Git-aware policy enforcement. Runs git diff, feeds changed paths
 * into the policy engine, and reports which paths need change records.
 */

import { Command } from "commander";
import chalk from "chalk";
import { execSync } from "node:child_process";
import {
  SpecRoot,
  evaluatePolicy,
  validateWorkflowEntry,
  isPathCoveredByChange,
} from "../../core/index.js";

function getChangedPaths(mode: string, base?: string): string[] {
  try {
    let cmd: string;
    switch (mode) {
      case "staged":
        cmd = "git diff --cached --name-only --diff-filter=ACMR";
        break;
      case "branch":
        cmd = `git diff --name-only --diff-filter=ACMR ${base ?? "main"}...HEAD`;
        break;
      default:
        cmd = "git diff --name-only --diff-filter=ACMR HEAD";
    }
    const output = execSync(cmd, { encoding: "utf-8" }).trim();
    return output ? output.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function checkCommand(): Command {
  return new Command("check")
    .description("Check if changed files require change records (git-aware)")
    .option("--staged", "Check only staged files")
    .option("--against <branch>", "Compare against a branch (default: main)")
    .option("--paths <paths...>", "Manually specify paths instead of git diff")
    .option("--json", "Output as JSON")
    .action((options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);

      if (!spec.isInitialized()) {
        console.error(chalk.red("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first."));
        process.exit(1);
      }

      const policy = spec.loadWorkflowPolicy();
      if (!policy) {
        console.error(chalk.red("Error: No workflow policy found."));
        process.exit(1);
      }

      // Get changed paths
      let changedPaths: string[];
      if (options.paths) {
        changedPaths = options.paths as string[];
      } else if (options.staged) {
        changedPaths = getChangedPaths("staged");
      } else if (options.against) {
        changedPaths = getChangedPaths("branch", options.against as string);
      } else {
        changedPaths = getChangedPaths("default");
      }

      if (changedPaths.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ paths: [], valid: true, message: "No changed files" }));
        } else {
          console.log(chalk.dim("No changed files detected."));
        }
        process.exit(0);
      }

      // Evaluate policy
      const evaluation = evaluatePolicy(changedPaths, policy);

      // Check workflow entry
      const activeChanges = spec.loadChanges().filter((c) => c.status === "active");
      const entry = validateWorkflowEntry(changedPaths, policy, activeChanges);

      if (options.json) {
        console.log(JSON.stringify({
          paths: changedPaths,
          evaluation: evaluation.summary,
          valid: entry.valid,
          uncoveredPaths: entry.uncoveredPaths,
        }, null, 2));
        process.exit(entry.valid ? 0 : 1);
      }

      console.log(chalk.blue("🔍 Anchored Spec — Policy Check\n"));
      console.log(chalk.dim(`  ${changedPaths.length} changed file(s) detected\n`));

      // Summary
      const { trivialPaths, governedPaths, ungoverned } = evaluation.summary;
      if (trivialPaths > 0) {
        console.log(chalk.dim(`  ✓ ${trivialPaths} trivially exempt (README, config, etc.)`));
      }
      if (ungoverned > 0) {
        console.log(chalk.dim(`  · ${ungoverned} not matched by any rule`));
      }
      if (governedPaths > 0) {
        console.log(chalk.yellow(`  ⚠ ${governedPaths} path(s) require a change record`));

        // Show governed paths
        for (const result of evaluation.paths) {
          if (result.requiresChange) {
            const rules = result.matchedRules.map((r) => r.id).join(", ");
            const covered = activeChanges.some((c) =>
              c.status === "active" && isPathCoveredByChange(result.path, c)
            );
            const icon = covered ? chalk.green("✓") : chalk.red("✗");
            console.log(`    ${icon} ${result.path} ${chalk.dim(`(${rules})`)}`);
          }
        }
      }

      console.log("");

      if (entry.valid) {
        console.log(chalk.green("✓ All governed paths are covered by active change records."));
      } else {
        console.log(chalk.red(`✗ ${entry.uncoveredPaths.length} path(s) not covered by any active change:`));
        for (const path of entry.uncoveredPaths) {
          console.log(chalk.red(`    ${path}`));
        }
        console.log(chalk.dim("\n  Create a change record: anchored-spec create change --type <type> --title <title> --slug <slug>"));
        process.exit(1);
      }
    });
}
