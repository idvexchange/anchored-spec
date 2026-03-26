/**
 * anchored-spec transition
 *
 * Advance a change record to the next phase or a specific phase.
 * Validates lifecycle gates before allowing transitions.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SpecRoot } from "../../core/index.js";
import type { Change, ChangePhase } from "../../core/index.js";
import { CliError } from "../errors.js";

const PHASE_ORDER: ChangePhase[] = [
  "design",
  "planned",
  "implementation",
  "verification",
  "done",
  "archived",
];

const CHORE_PHASE_ORDER: ChangePhase[] = [
  "implementation",
  "verification",
  "done",
  "archived",
];

function getPhaseOrder(change: Change): ChangePhase[] {
  return change.type === "chore" ? CHORE_PHASE_ORDER : PHASE_ORDER;
}

function getNextPhase(change: Change): ChangePhase | null {
  const order = getPhaseOrder(change);
  const currentIndex = order.indexOf(change.phase);
  if (currentIndex === -1 || currentIndex >= order.length - 1) return null;
  return order[currentIndex + 1]!;
}

function validateTransition(
  change: Change,
  targetPhase: ChangePhase,
  spec: SpecRoot
): string[] {
  const errors: string[] = [];
  const order = getPhaseOrder(change);
  const currentIndex = order.indexOf(change.phase);
  const targetIndex = order.indexOf(targetPhase);

  if (targetIndex === -1) {
    errors.push(`Invalid target phase "${targetPhase}" for ${change.type} change. Valid phases: ${order.join(", ")}`);
    return errors;
  }

  if (targetIndex <= currentIndex) {
    errors.push(`Cannot move backward from "${change.phase}" to "${targetPhase}". Current phase index: ${currentIndex}, target: ${targetIndex}`);
    return errors;
  }

  if (targetIndex > currentIndex + 1) {
    const skipped = order.slice(currentIndex + 1, targetIndex);
    errors.push(`Cannot skip phases: ${skipped.join(", ")}. Advance one phase at a time.`);
    return errors;
  }

  // Gate: design → planned: requirements should be linked (non-chore)
  if (change.phase === "design" && targetPhase === "planned") {
    if (change.type !== "chore" && (!change.requirements || change.requirements.length === 0)) {
      errors.push("Cannot move to planned: no requirements linked. Add requirement IDs to the change.");
    }
  }

  // Gate: verification → done: run verify to check
  if (targetPhase === "done") {
    if (change.type !== "chore") {
      const requirements = spec.loadRequirements();
      const linkedReqs = requirements.filter((r) =>
        change.requirements?.includes(r.id)
      );
      const uncovered = linkedReqs.filter(
        (r) => !r.verification?.coverageStatus || r.verification.coverageStatus === "none"
      );
      if (uncovered.length > 0) {
        errors.push(
          `Cannot move to done: ${uncovered.length} linked requirement(s) have no test coverage: ${uncovered.map((r) => r.id).join(", ")}`
        );
      }
    }
  }

  return errors;
}

/**
 * Find the actual file path for a change record.
 * Supports both nested (CHG-xxx/change.json) and flat (CHG-xxx.json) layouts.
 */
function findChangePath(changesDir: string, changeId: string): string | null {
  const nested = join(changesDir, changeId, "change.json");
  if (existsSync(nested)) return nested;
  const flat = join(changesDir, `${changeId}.json`);
  if (existsSync(flat)) return flat;
  return null;
}

export function transitionCommand(): Command {
  return new Command("transition")
    .description("Advance a change record to the next phase")
    .argument("<change-id>", "Change record ID (e.g., CHG-2025-0001-feature)")
    .option("--to <phase>", "Target phase (default: next phase)")
    .option("--force", "Skip gate validation")
    .option("--dry-run", "Show what would happen without writing")
    .action((changeId: string, options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
      }

      const changes = spec.loadChanges();
      const change = changes.find((c) => c.id === changeId);

      if (!change) {
        const suggestions = changes.filter((c) => c.id.includes(changeId.split("-").pop() ?? ""));
        const hint = suggestions.length > 0
          ? `\n  Did you mean: ${suggestions.map((c) => c.id).join(", ")}?`
          : "";
        throw new CliError(`Error: Change "${changeId}" not found.${hint}`);
      }

      const changePath = findChangePath(spec.changesDir, changeId);
      if (!changePath) {
        throw new CliError(`Error: Change file not found for "${changeId}".`);
      }

      const targetPhase = (options.to as ChangePhase) ?? getNextPhase(change);

      if (!targetPhase) {
        console.log(chalk.yellow(`Change "${changeId}" is already at terminal phase "${change.phase}".`));
        return;
      }

      console.log(chalk.blue(`🔄 Transition: ${changeId}`));
      console.log(chalk.dim(`  ${change.phase} → ${targetPhase}`));

      if (!options.force) {
        const errors = validateTransition(change, targetPhase, spec);
        if (errors.length > 0) {
          console.log(chalk.red("\n  ✗ Gate validation failed:"));
          for (const err of errors) {
            console.log(chalk.red(`    • ${err}`));
          }
          console.log(chalk.dim("\n  Use --force to skip validation."));
          throw new CliError("", 1);
        }
      }

      if (options.dryRun) {
        console.log(chalk.yellow(`\n  [DRY RUN] Would update phase to "${targetPhase}".`));
        return;
      }

      // Update the change
      const updated = {
        ...change,
        phase: targetPhase,
        status: targetPhase === "done" || targetPhase === "archived" ? "complete" as const : change.status,
        timestamps: {
          ...change.timestamps,
          updatedAt: new Date().toISOString().split("T")[0],
        },
      };

      writeFileSync(changePath, JSON.stringify(updated, null, 2) + "\n");

      console.log(chalk.green(`\n  ✓ Phase updated: ${change.phase} → ${targetPhase}`));
      if (updated.status !== change.status) {
        console.log(chalk.green(`  ✓ Status updated: ${change.status} → ${updated.status}`));
      }

      const next = getNextPhase(updated);
      if (next) {
        console.log(chalk.dim(`\n  Next phase: ${next}`));
      } else {
        console.log(chalk.dim(`\n  This change is now complete.`));
      }
    });
}
