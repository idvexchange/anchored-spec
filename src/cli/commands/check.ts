/**
 * anchored-spec check
 *
 * Git-aware policy enforcement. Runs git diff, feeds changed paths
 * into the policy engine, and reports which paths need change records.
 */

import { Command } from "commander";
import chalk from "chalk";
import { execFileSync } from "node:child_process";
import {
  SpecRoot,
  evaluatePolicy,
  validateWorkflowEntry,
  isPathCoveredByChange,
} from "../../core/index.js";
import { CliError } from "../errors.js";

const BRANCH_PATTERN = /^[a-zA-Z0-9/_.\-]+$/;

interface ChangedPathsResult {
  paths: string[];
  error?: string;
}

function getChangedPaths(mode: string, base?: string): ChangedPathsResult {
  try {
    let args: string[];
    switch (mode) {
      case "staged":
        args = ["diff", "--cached", "--name-only", "--diff-filter=ACMR"];
        break;
      case "branch": {
        const branch = base ?? "main";
        if (!BRANCH_PATTERN.test(branch)) {
          return { paths: [], error: `Invalid branch name: "${branch}"` };
        }
        args = ["diff", "--name-only", "--diff-filter=ACMR", `${branch}...HEAD`];
        break;
      }
      default:
        args = ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"];
    }
    const output = execFileSync("git", args, { encoding: "utf-8" }).trim();
    return { paths: output ? output.split("\n").filter(Boolean) : [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not a git repository") || msg.includes("ENOENT")) {
      return { paths: [], error: "Not a git repository or git is not installed." };
    }
    if (msg.includes("unknown revision")) {
      return { paths: [], error: `Branch "${base ?? "main"}" not found. Use --against <branch>.` };
    }
    return { paths: [], error: `Git error: ${msg.split("\n")[0]}` };
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
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
      }

      const policy = spec.loadWorkflowPolicy();
      if (!policy) {
        throw new CliError("Error: No workflow policy found.");
      }

      // Get changed paths
      let changedPaths: string[];
      if (options.paths) {
        changedPaths = options.paths as string[];
      } else if (options.staged) {
        const result = getChangedPaths("staged");
        if (result.error) {
          if (options.json) {
            console.log(JSON.stringify({ paths: [], valid: false, error: result.error }));
            throw new CliError("", 1);
          }
          throw new CliError(`Error: ${result.error}`);
        }
        changedPaths = result.paths;
      } else if (options.against) {
        const result = getChangedPaths("branch", options.against as string);
        if (result.error) {
          if (options.json) {
            console.log(JSON.stringify({ paths: [], valid: false, error: result.error }));
            throw new CliError("", 1);
          }
          throw new CliError(`Error: ${result.error}`);
        }
        changedPaths = result.paths;
      } else {
        const result = getChangedPaths("default");
        if (result.error) {
          if (options.json) {
            console.log(JSON.stringify({ paths: [], valid: false, error: result.error }));
            throw new CliError("", 1);
          }
          throw new CliError(`Error: ${result.error}`);
        }
        changedPaths = result.paths;
      }

      if (changedPaths.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ paths: [], valid: true, message: "No changed files" }));
        } else {
          console.log(chalk.dim("No changed files detected."));
        }
        return;
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
        if (!entry.valid) throw new CliError("", 1);
        return;
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
        console.log(chalk.dim("\n  Create a change record: anchored-spec create change --type <type> --title <title>"));
        throw new CliError("", 1);
      }
    });
}
