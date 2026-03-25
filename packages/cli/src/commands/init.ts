/**
 * anchored-spec init
 *
 * Scaffolds the spec infrastructure into the current project.
 * Creates directories, copies schemas, generates starter workflow policy,
 * and optionally updates package.json with verify/generate scripts.
 */

import { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function initCommand(): Command {
  return new Command("init")
    .description("Initialize spec infrastructure in the current project")
    .option("--spec-root <path>", "Root directory for specs", "specs")
    .option("--no-scripts", "Skip adding scripts to package.json")
    .option("--force", "Overwrite existing files")
    .action(async (options) => {
      const cwd = process.cwd();
      const specRoot = options.specRoot as string;

      console.log(chalk.blue("🔗 Anchored Spec — Initializing spec infrastructure\n"));

      // 1. Create directory structure
      const dirs = [
        join(specRoot, "schemas"),
        join(specRoot, "requirements"),
        join(specRoot, "changes"),
        join(specRoot, "decisions"),
        join(specRoot, "generated"),
        ".anchored-spec",
      ];

      for (const dir of dirs) {
        const fullPath = join(cwd, dir);
        if (!existsSync(fullPath)) {
          mkdirSync(fullPath, { recursive: true });
          console.log(chalk.green(`  ✓ Created ${dir}/`));
        } else {
          console.log(chalk.dim(`  · ${dir}/ already exists`));
        }
      }

      // 2. Write config
      const configPath = join(cwd, ".anchored-spec", "config.json");
      if (!existsSync(configPath) || options.force) {
        const config = {
          specRoot,
          schemasDir: `${specRoot}/schemas`,
          requirementsDir: `${specRoot}/requirements`,
          changesDir: `${specRoot}/changes`,
          decisionsDir: `${specRoot}/decisions`,
          workflowPolicyPath: `${specRoot}/workflow-policy.json`,
          generatedDir: `${specRoot}/generated`,
        };
        writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
        console.log(chalk.green(`  ✓ Created .anchored-spec/config.json`));
      }

      // 3. Copy schemas from core package
      const corePackageDir = resolve(__dirname, "..", "..", "..", "core");
      const possibleSchemaDirs = [
        join(corePackageDir, "dist", "schemas"),
        join(corePackageDir, "src", "schemas"),
      ];
      const schemasSource = possibleSchemaDirs.find((d) => existsSync(d));
      const schemasTarget = join(cwd, specRoot, "schemas");
      const schemaFiles = [
        "requirement.schema.json",
        "change.schema.json",
        "decision.schema.json",
        "workflow-policy.schema.json",
      ];

      for (const schemaFile of schemaFiles) {
        const dest = join(schemasTarget, schemaFile);
        if (schemasSource) {
          const src = join(schemasSource, schemaFile);
          if (existsSync(src) && (!existsSync(dest) || options.force)) {
            copyFileSync(src, dest);
            console.log(chalk.green(`  ✓ Copied ${specRoot}/schemas/${schemaFile}`));
          }
        } else if (!existsSync(dest)) {
          console.log(chalk.yellow(`  ⚠ Schema source not found: ${schemaFile} (install @anchored-spec/core)`));
        }
      }

      // 4. Create starter workflow policy
      const policyPath = join(cwd, specRoot, "workflow-policy.json");
      if (!existsSync(policyPath) || options.force) {
        const starterPolicy = {
          workflowVariants: [
            {
              id: "feature-behavior-first",
              name: "Feature (Behavior First)",
              defaultTypes: ["feature"],
              artifacts: ["requirements", "design-doc", "implementation-plan"],
              verificationFocus: ["behavioral-coverage", "semantic-drift"],
            },
            {
              id: "feature-design-first",
              name: "Feature (Design First)",
              defaultTypes: ["refactor"],
              artifacts: ["design-doc", "requirements", "implementation-plan"],
              verificationFocus: ["contract-compatibility", "semantic-drift"],
            },
            {
              id: "fix-root-cause-first",
              name: "Fix (Root Cause First)",
              defaultTypes: ["fix"],
              artifacts: ["bugfix-spec", "design-doc", "implementation-plan"],
              verificationFocus: ["regression-testing", "root-cause-verification"],
            },
            {
              id: "chore",
              name: "Chore (Lightweight)",
              defaultTypes: ["chore"],
              artifacts: [],
              skipSkillSequence: true,
              verificationFocus: ["build-passes"],
            },
          ],
          changeRequiredRules: [
            {
              id: "source-change",
              description: "Any source code change requires a change record",
              include: ["src/**"],
              exclude: ["src/**/*.test.*", "src/**/*.spec.*"],
            },
          ],
          trivialExemptions: [
            "README.md",
            "*.md",
            ".github/**",
            ".vscode/**",
            "*.config.*",
            ".gitignore",
          ],
          choreEligibility: {
            conditions: [
              "No behavioral changes",
              "No contract/API changes",
              "No new routes, error codes, or interfaces",
              "No requirement lifecycle transitions",
            ],
            escalationRule: "If any condition fails, escalate to a full workflow variant",
          },
          lifecycleRules: {
            plannedToActiveRequiresChange: true,
            activeToShippedRequiresCoverage: true,
            deprecatedRequiresReason: true,
          },
        };
        writeFileSync(policyPath, JSON.stringify(starterPolicy, null, 2) + "\n");
        console.log(chalk.green(`  ✓ Created ${specRoot}/workflow-policy.json`));
      }

      // 5. Create starter .gitkeep files so empty dirs are tracked
      for (const dir of ["requirements", "changes", "decisions"]) {
        const keepFile = join(cwd, specRoot, dir, ".gitkeep");
        if (!existsSync(keepFile)) {
          writeFileSync(keepFile, "");
        }
      }

      // 6. Add scripts to package.json
      if (options.scripts !== false) {
        const pkgPath = join(cwd, "package.json");
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
          const scripts = pkg.scripts ?? {};
          let updated = false;

          if (!scripts["spec:verify"]) {
            scripts["spec:verify"] = "anchored-spec verify";
            updated = true;
          }
          if (!scripts["spec:generate"]) {
            scripts["spec:generate"] = "anchored-spec generate";
            updated = true;
          }
          if (!scripts["spec:status"]) {
            scripts["spec:status"] = "anchored-spec status";
            updated = true;
          }
          if (!scripts["spec:create"]) {
            scripts["spec:create"] = "anchored-spec create";
            updated = true;
          }

          if (updated) {
            pkg.scripts = scripts;
            writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
            console.log(chalk.green(`  ✓ Added spec scripts to package.json`));
          }
        }
      }

      console.log(chalk.blue("\n✅ Spec infrastructure initialized!"));
      console.log(chalk.dim("\nNext steps:"));
      console.log(chalk.dim("  1. Create your first requirement:  anchored-spec create requirement"));
      console.log(chalk.dim("  2. Run verification:               anchored-spec verify"));
      console.log(chalk.dim("  3. Check status:                   anchored-spec status"));
    });
}
