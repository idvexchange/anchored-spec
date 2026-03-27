/**
 * anchored-spec status
 *
 * Show a health dashboard of the spec infrastructure.
 */

import { Command } from "commander";
import chalk from "chalk";
import { SpecRoot } from "../../core/index.js";
import type { Requirement, Change, Decision, WorkflowPolicy } from "../../core/index.js";
import { CliError } from "../errors.js";

export function statusCommand(): Command {
  return new Command("status")
    .description("Show spec health dashboard")
    .option("--json", "Output as JSON")
    .action((options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
      }

      const requirements = spec.loadRequirements();
      const changes = spec.loadChanges();
      const decisions = spec.loadDecisions();
      const policy = spec.loadWorkflowPolicy();

      if (options.json) {
        outputJson(requirements, changes, decisions, policy);
      } else {
        outputHuman(requirements, changes, decisions, policy);
      }
    });
}

function outputJson(
  requirements: Requirement[],
  changes: Change[],
  decisions: Decision[],
  policy: WorkflowPolicy | null
): void {
  const status = {
    requirements: {
      total: requirements.length,
      byStatus: groupBy(requirements, (r) => r.status),
      byPriority: groupBy(requirements, (r) => r.priority),
      byCategory: groupBy(requirements, (r) => r.category ?? "functional"),
      coverage: {
        none: requirements.filter((r) => (r.verification?.coverageStatus ?? "none") === "none").length,
        partial: requirements.filter((r) => r.verification?.coverageStatus === "partial").length,
        full: requirements.filter((r) => r.verification?.coverageStatus === "full").length,
      },
    },
    changes: {
      total: changes.length,
      byStatus: groupBy(changes, (c) => c.status),
      byType: groupBy(changes, (c) => c.type),
    },
    decisions: {
      total: decisions.length,
      byStatus: groupBy(decisions, (d) => d.status),
    },
    policy: policy
      ? {
          variants: policy.workflowVariants.length,
          rules: policy.changeRequiredRules.length,
          exemptions: policy.trivialExemptions.length,
        }
      : null,
  };

  console.log(JSON.stringify(status, null, 2));
}

function outputHuman(
  requirements: Requirement[],
  changes: Change[],
  decisions: Decision[],
  policy: WorkflowPolicy | null
): void {
  console.log(chalk.blue("📊 Anchored Spec — Status Dashboard\n"));

  // Requirements
  console.log(chalk.bold("Requirements"));
  if (requirements.length === 0) {
    console.log(chalk.dim("  No requirements yet."));
  } else {
    const statusCounts = groupBy(requirements, (r) => r.status);
    const parts = Object.entries(statusCounts)
      .map(([status, count]) => `${status}: ${count}`)
      .join(" | ");
    console.log(`  Total: ${requirements.length} — ${parts}`);

    const categoryCounts = groupBy(requirements, (r) => r.category ?? "functional");
    const catParts = Object.entries(categoryCounts)
      .map(([cat, count]) => `${cat}: ${count}`)
      .join(" | ");
    console.log(`  Categories: ${catParts}`);

    const coverageCount = requirements.filter(
      (r) => r.verification?.coverageStatus && r.verification.coverageStatus !== "none"
    ).length;
    const active = requirements.filter(
      (r) => r.status === "active" || r.status === "shipped"
    ).length;
    if (active > 0) {
      const pct = Math.round((coverageCount / active) * 100);
      console.log(`  Coverage: ${coverageCount}/${active} active/shipped (${pct}%)`);
    }

    const totalBehaviors = requirements.reduce(
      (sum, r) => sum + r.behaviorStatements.length,
      0
    );
    console.log(`  Behavior statements: ${totalBehaviors}`);
  }

  console.log("");

  // Changes
  console.log(chalk.bold("Changes"));
  if (changes.length === 0) {
    console.log(chalk.dim("  No changes yet."));
  } else {
    const statusCounts = groupBy(changes, (c) => c.status);
    const parts = Object.entries(statusCounts)
      .map(([status, count]) => `${status}: ${count}`)
      .join(" | ");
    console.log(`  Total: ${changes.length} — ${parts}`);
  }

  console.log("");

  // Decisions
  console.log(chalk.bold("Decisions"));
  if (decisions.length === 0) {
    console.log(chalk.dim("  No decisions yet."));
  } else {
    console.log(`  Total: ${decisions.length} — accepted: ${decisions.filter((d) => d.status === "accepted").length}`);
  }

  console.log("");

  // Policy
  console.log(chalk.bold("Workflow Policy"));
  if (!policy) {
    console.log(chalk.dim("  No workflow policy found."));
  } else {
    console.log(`  Variants: ${policy.workflowVariants.map((v) => v.id).join(", ")}`);
    console.log(`  Rules: ${policy.changeRequiredRules.length} path rules`);
    console.log(`  Exemptions: ${policy.trivialExemptions.length} trivial patterns`);
  }

  console.log("");
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    groups[key] = (groups[key] ?? 0) + 1;
  }
  return groups;
}
