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
    .option("--no-examples", "Skip creating starter example files")
    .option("--force", "Overwrite existing files")
    .option("--dry-run", "Show what would be created without writing")
    .action(async (options) => {
      const cwd = process.cwd();
      const specRoot = options.specRoot as string;
      const dryRun = options.dryRun as boolean;

      console.log(chalk.blue("🔗 Anchored Spec — Initializing spec infrastructure\n"));
      if (dryRun) {
        console.log(chalk.yellow("  [DRY RUN] No files will be written.\n"));
      }

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
          if (!dryRun) mkdirSync(fullPath, { recursive: true });
          console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${dir}/`));
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
        if (!dryRun) writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
        console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create .anchored-spec/config.json`));
      }

      // 3. Copy schemas — resolve from sibling core directory
      const possibleSchemaDirs = [
        resolve(__dirname, "..", "..", "core", "schemas"),  // dist/core/schemas (built)
        resolve(__dirname, "..", "..", "..", "src", "core", "schemas"),  // src/core/schemas (dev)
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
            if (!dryRun) copyFileSync(src, dest);
            console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Copy ${specRoot}/schemas/${schemaFile}`));
          }
        } else if (!existsSync(dest)) {
          console.log(chalk.yellow(`  ⚠ Schema source not found: ${schemaFile}`));
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
        if (!dryRun) writeFileSync(policyPath, JSON.stringify(starterPolicy, null, 2) + "\n");
        console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${specRoot}/workflow-policy.json`));
      }

      // 5. Create starter .gitkeep files so empty dirs are tracked
      for (const dir of ["requirements", "changes", "decisions"]) {
        const keepFile = join(cwd, specRoot, dir, ".gitkeep");
        if (!existsSync(keepFile)) {
          if (!dryRun) writeFileSync(keepFile, "");
        }
      }

      // 6. Create starter example requirement
      if (options.examples !== false) {
        const exampleReqPath = join(cwd, specRoot, "requirements", "REQ-1.json");
        if (!existsSync(exampleReqPath) || options.force) {
          const exampleReq = {
            id: "REQ-1",
            title: "Example Requirement",
            summary: "TODO: Describe what this feature does in behavioral terms. Replace this with your first real requirement.",
            priority: "should",
            status: "draft",
            behaviorStatements: [
              {
                id: "BS-1",
                text: "When a user performs an action, the system shall produce an observable result.",
                format: "EARS",
                trigger: "a user performs an action",
                response: "the system shall produce an observable result",
              },
            ],
            traceRefs: [],
            semanticRefs: {
              interfaces: [],
              routes: [],
              errorCodes: [],
              symbols: [],
            },
            verification: {
              requiredTestKinds: ["unit"],
              coverageStatus: "none",
              testFiles: [],
              testRefs: [],
            },
            implementation: {
              activeChanges: [],
              shippedBy: null,
              deprecatedBy: null,
            },
            owners: ["team"],
            tags: [],
            supersedes: null,
            supersededBy: null,
            docSource: "canonical-json",
          };
          if (!dryRun) writeFileSync(exampleReqPath, JSON.stringify(exampleReq, null, 2) + "\n");
          console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${specRoot}/requirements/REQ-1.json (starter example)`));
        }
      }

      // 7. Add specs/generated/ to .gitignore
      const gitignorePath = join(cwd, ".gitignore");
      const generatedIgnore = `${specRoot}/generated/`;
      if (existsSync(gitignorePath)) {
        const gitignoreContent = readFileSync(gitignorePath, "utf-8");
        if (!gitignoreContent.includes(generatedIgnore)) {
          if (!dryRun) {
            const separator = gitignoreContent.endsWith("\n") ? "" : "\n";
            writeFileSync(gitignorePath, gitignoreContent + separator + `\n# Anchored Spec generated files\n${generatedIgnore}\n`);
          }
          console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Add ${generatedIgnore} to .gitignore`));
        }
      } else {
        if (!dryRun) writeFileSync(gitignorePath, `# Anchored Spec generated files\n${generatedIgnore}\n`);
        console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create .gitignore with ${generatedIgnore}`));
      }

      // 8. Add scripts to package.json
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
            if (!dryRun) writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
            console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Add spec scripts to package.json`));
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
