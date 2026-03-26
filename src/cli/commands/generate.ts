/**
 * anchored-spec generate
 *
 * Regenerate derived markdown documents from JSON spec files.
 * JSON is the source of truth; markdown is for human reading.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SpecRoot,
  generateRequirementsMarkdown,
  generateDecisionsMarkdown,
  generateChangesMarkdown,
  generateStatusMarkdown,
} from "../../core/index.js";
import { watchSpecs } from "../watch.js";
import { CliError } from "../errors.js";

export function generateCommand(): Command {
  return new Command("generate")
    .description("Regenerate markdown documents from spec JSON")
    .option("--check", "Check if generated files are up-to-date (don't write)")
    .option("--watch", "Re-run on spec file changes")
    .action((options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
      }

      console.log(chalk.blue("📝 Anchored Spec — Generate\n"));

      if (options.watch) {
        if (options.check) {
          throw new CliError("Error: --watch and --check cannot be used together.");
        }
        watchSpecs(spec.specRoot, () => {
          runGeneration(spec);
        }, "generate");
        return;
      }

      const staleCount = options.check ? runCheckGeneration(spec) : runGeneration(spec);

      if (options.check && staleCount > 0) {
        console.log(chalk.red(`\n✗ ${staleCount} artifact(s) are stale. Run 'anchored-spec generate' to update.`));
        throw new CliError("", 1);
      }
    });
}

function getArtifacts(spec: SpecRoot): Array<{ name: string; path: string; content: string }> {
  const requirements = spec.loadRequirements();
  const changes = spec.loadChanges();
  const decisions = spec.loadDecisions();
  const generatedDir = spec.generatedDir;
  const artifacts: Array<{ name: string; path: string; content: string }> = [];

  if (requirements.length > 0) {
    artifacts.push({
      name: "requirements.md",
      path: join(generatedDir, "requirements.md"),
      content: generateRequirementsMarkdown(requirements),
    });
  }
  if (decisions.length > 0) {
    artifacts.push({
      name: "decisions.md",
      path: join(generatedDir, "decisions.md"),
      content: generateDecisionsMarkdown(decisions),
    });
  }
  if (changes.length > 0) {
    artifacts.push({
      name: "changes.md",
      path: join(generatedDir, "changes.md"),
      content: generateChangesMarkdown(changes),
    });
  }
  if (requirements.length > 0 || changes.length > 0 || decisions.length > 0) {
    artifacts.push({
      name: "status.md",
      path: join(generatedDir, "status.md"),
      content: generateStatusMarkdown(requirements, changes, decisions),
    });
  }
  return artifacts;
}

function runGeneration(spec: SpecRoot): number {
  const generatedDir = spec.generatedDir;
  if (!existsSync(generatedDir)) {
    mkdirSync(generatedDir, { recursive: true });
  }

  const artifacts = getArtifacts(spec);
  for (const artifact of artifacts) {
    writeFileSync(artifact.path, artifact.content);
    console.log(chalk.green(`  ✓ Generated ${artifact.name}`));
  }
  if (artifacts.length === 0) {
    console.log(chalk.dim("  No spec artifacts found to generate from."));
  } else {
    console.log(chalk.green(`\n✓ Generated ${artifacts.length} artifact(s).`));
  }
  return artifacts.length;
}

function runCheckGeneration(spec: SpecRoot): number {
  const artifacts = getArtifacts(spec);
  let staleCount = 0;

  for (const artifact of artifacts) {
    if (!existsSync(artifact.path)) {
      console.log(chalk.yellow(`  ⚠ Missing: ${artifact.name}`));
      staleCount++;
    } else {
      const existing = readFileSync(artifact.path, "utf-8");
      if (existing !== artifact.content) {
        console.log(chalk.yellow(`  ⚠ Stale: ${artifact.name}`));
        staleCount++;
      } else {
        console.log(chalk.green(`  ✓ Up-to-date: ${artifact.name}`));
      }
    }
  }
  if (artifacts.length === 0) {
    console.log(chalk.dim("  No spec artifacts found to generate from."));
  }
  return staleCount;
}
