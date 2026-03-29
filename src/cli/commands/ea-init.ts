/**
 * anchored-spec ea init
 *
 * Scaffolds the EA directory structure into the current project.
 * Creates domain subdirectories and enables EA in config.
 */

import { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EA_DOMAINS, resolveEaConfig } from "../../ea/index.js";
import type { EaDomain } from "../../ea/index.js";

export function eaInitCommand(): Command {
  return new Command("init")
    .description("Initialize EA directory structure")
    .option("--root-dir <path>", "Root directory for EA artifacts", "ea")
    .option("--with-examples", "Create a starter artifact in each domain")
    .option("--force", "Overwrite existing files")
    .option("--dry-run", "Show what would be created without writing")
    .action((options) => {
      const cwd = process.cwd();
      const rootDir = options.rootDir as string;
      const dryRun = options.dryRun as boolean;
      const force = options.force as boolean;

      console.log(chalk.blue("🏛  Anchored Spec — EA Initialization\n"));
      if (dryRun) {
        console.log(chalk.yellow("  [DRY RUN] No files will be written.\n"));
      }

      const eaConfig = resolveEaConfig({ rootDir });

      // 1. Create root and domain directories
      const createdDirs: string[] = [];
      for (const domain of EA_DOMAINS) {
        const dir = join(cwd, eaConfig.domains[domain]);
        if (!existsSync(dir)) {
          if (!dryRun) mkdirSync(dir, { recursive: true });
          createdDirs.push(eaConfig.domains[domain]);
          console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${eaConfig.domains[domain]}/`));
        } else {
          console.log(chalk.dim(`  · ${eaConfig.domains[domain]}/ already exists`));
        }
      }

      // 2. Create generated directory
      const generatedDir = join(cwd, eaConfig.generatedDir);
      if (!existsSync(generatedDir)) {
        if (!dryRun) mkdirSync(generatedDir, { recursive: true });
        console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${eaConfig.generatedDir}/`));
      }

      // 3. Update config to enable EA
      const configDir = join(cwd, ".anchored-spec");
      const configPath = join(configDir, "config.json");
      if (existsSync(configPath)) {
        const existing = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
        if (!existing.ea || force) {
          existing.ea = { enabled: true, rootDir };
          if (!dryRun) writeFileSync(configPath, JSON.stringify(existing, null, 2) + "\n");
          console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Enable EA in .anchored-spec/config.json`));
        } else {
          console.log(chalk.dim("  · EA already enabled in config"));
        }
      } else {
        if (!dryRun) {
          mkdirSync(configDir, { recursive: true });
          const config = { ea: { enabled: true, rootDir } };
          writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
        }
        console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create .anchored-spec/config.json with EA enabled`));
      }

      // 4. Create .gitkeep files
      if (!dryRun) {
        for (const domain of EA_DOMAINS) {
          const keepFile = join(cwd, eaConfig.domains[domain], ".gitkeep");
          if (!existsSync(keepFile)) {
            writeFileSync(keepFile, "");
          }
        }
      }

      // 5. Optionally create starter examples
      if (options.withExamples) {
        createExamples(cwd, eaConfig.domains, dryRun);
      }

      console.log(chalk.blue("\n✅ EA infrastructure initialized!"));
      console.log(chalk.dim("\nNext steps:"));
      console.log(chalk.dim("  1. Create an artifact:    anchored-spec ea create application --title \"My App\""));
      console.log(chalk.dim("  2. Validate artifacts:    anchored-spec ea validate"));
      console.log(chalk.dim("  3. Visualize graph:       anchored-spec ea graph --format mermaid"));
    });
}

function createExamples(
  cwd: string,
  domains: Record<EaDomain, string>,
  dryRun: boolean,
): void {
  const examples: Array<{ domain: EaDomain; filename: string; content: string }> = [
    {
      domain: "systems",
      filename: "APP-example-service.yaml",
      content: `apiVersion: anchored-spec/ea/v1
kind: application
id: APP-example-service

metadata:
  name: Example Service
  summary: >
    A starter application artifact. Replace this with your
    actual application description.
  owners:
    - your-team
  tags:
    - example
  confidence: declared
  status: draft
  schemaVersion: "1.0.0"

relations: []
`,
    },
    {
      domain: "delivery",
      filename: "ENV-development.yaml",
      content: `apiVersion: anchored-spec/ea/v1
kind: environment
id: ENV-development

metadata:
  name: Development Environment
  summary: >
    Development environment for local and CI testing.
  owners:
    - your-team
  tags:
    - dev
  confidence: declared
  status: draft
  schemaVersion: "1.0.0"

spec:
  tier: development
  isProduction: false

relations: []
`,
    },
  ];

  for (const ex of examples) {
    const filePath = join(cwd, domains[ex.domain], ex.filename);
    if (!existsSync(filePath)) {
      if (!dryRun) writeFileSync(filePath, ex.content);
      console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${domains[ex.domain]}/${ex.filename}`));
    }
  }
}
