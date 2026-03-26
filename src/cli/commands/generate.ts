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

export function generateCommand(): Command {
  return new Command("generate")
    .description("Regenerate markdown documents from spec JSON")
    .option("--check", "Check if generated files are up-to-date (don't write)")
    .action((options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);

      if (!spec.isInitialized()) {
        console.error(chalk.red("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first."));
        process.exit(1);
      }

      console.log(chalk.blue("📝 Anchored Spec — Generate\n"));

      const generatedDir = spec.generatedDir;
      if (!existsSync(generatedDir)) {
        mkdirSync(generatedDir, { recursive: true });
      }

      const requirements = spec.loadRequirements();
      const changes = spec.loadChanges();
      const decisions = spec.loadDecisions();

      let staleCount = 0;
      const artifacts: Array<{ name: string; path: string; content: string }> = [];

      // Requirements markdown
      if (requirements.length > 0) {
        artifacts.push({
          name: "requirements.md",
          path: join(generatedDir, "requirements.md"),
          content: generateRequirementsMarkdown(requirements),
        });
      }

      // Decisions markdown
      if (decisions.length > 0) {
        artifacts.push({
          name: "decisions.md",
          path: join(generatedDir, "decisions.md"),
          content: generateDecisionsMarkdown(decisions),
        });
      }

      // Changes markdown
      if (changes.length > 0) {
        artifacts.push({
          name: "changes.md",
          path: join(generatedDir, "changes.md"),
          content: generateChangesMarkdown(changes),
        });
      }

      // Status dashboard
      if (requirements.length > 0 || changes.length > 0 || decisions.length > 0) {
        artifacts.push({
          name: "status.md",
          path: join(generatedDir, "status.md"),
          content: generateStatusMarkdown(requirements, changes, decisions),
        });
      }

      for (const artifact of artifacts) {
        if (options.check) {
          // Check mode: compare with existing
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
        } else {
          // Write mode
          writeFileSync(artifact.path, artifact.content);
          console.log(chalk.green(`  ✓ Generated ${artifact.name}`));
        }
      }

      if (artifacts.length === 0) {
        console.log(chalk.dim("  No spec artifacts found to generate from."));
      }

      if (options.check && staleCount > 0) {
        console.log(chalk.red(`\n✗ ${staleCount} artifact(s) are stale. Run 'anchored-spec generate' to update.`));
        process.exit(1);
      } else if (!options.check && artifacts.length > 0) {
        console.log(chalk.green(`\n✓ Generated ${artifacts.length} artifact(s).`));
      }
    });
}
