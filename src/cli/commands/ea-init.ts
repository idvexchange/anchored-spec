/**
 * anchored-spec init
 *
 * Scaffolds Backstage-aligned project config and storage for manifest or inline mode.
 */

import { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveConfigV1,
  loadProjectConfig,
  getConfiguredDocSections,
  getConfiguredRootDocs,
  type AnchoredSpecConfigV1,
  type AnchoredSpecConfigV1_1,
} from "../../ea/index.js";
import { writeIdeFiles } from "../ide-scaffold.js";
import { writeAiConfigFiles } from "../ai-config.js";
import { writeCiRecipes } from "../ci-recipes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function eaInitCommand(): Command {
  return new Command("init")
    .description("Initialize EA directory structure and configuration")
    .option("--root-dir <path>", "Root directory for EA entities", "docs")
    .option("--mode <mode>", "Storage mode for backstage format: manifest (default), inline", "manifest")
    .option(
      "--docs-structure <profile>",
      "Docs structure profile: legacy-domain, architecture-views (default), custom",
      "architecture-views",
    )
    .option("--with-examples", "Create starter Backstage entities")
    .option("--with-policy", "Create a starter workflow policy file")
    .option("--force", "Overwrite existing files")
    .option("--dry-run", "Show what would be created without writing")
    .option("--ide", "Generate VS Code workspace settings, snippets, and extension recommendations")
    .option("--no-ide", "Skip VS Code integration files")
    .option("--ai <targets>", "Generate AI assistant config files (copilot, claude, kiro, speckit, all)")
    .option("--ci", "Generate CI integration recipes (GitHub Actions workflow + pre-commit hook)")
    .option("--version-policy-defaults", "Bootstrap sensible version policy defaults per schema profile")
    .action((options) => {
      const cwd = process.cwd();
      const rootDir = options.rootDir as string;
      const dryRun = options.dryRun as boolean;
      const force = options.force as boolean;

      console.log(chalk.blue("🏛  Anchored Spec — Project Initialization\n"));
      if (dryRun) {
        console.log(chalk.yellow("  [DRY RUN] No files will be written.\n"));
      }

      const configDir = join(cwd, ".anchored-spec");
      const configPath = join(configDir, "config.json");

      let v1Config: AnchoredSpecConfigV1;
      if (existsSync(configPath) && !force) {
        v1Config = loadProjectConfig(cwd, rootDir);
        console.log(chalk.dim(`  · Reusing existing v${v1Config.schemaVersion} config`));
      } else {
        v1Config = resolveConfigV1(({
          schemaVersion: "1.1",
          rootDir,
          docs: {
            structure: options.docsStructure as AnchoredSpecConfigV1_1["docs"]["structure"],
          },
        }) as Partial<AnchoredSpecConfigV1_1>);
      }

      const storageMode = (options.mode as string) ?? "manifest";
      v1Config.entityMode = storageMode as "manifest" | "inline";
      if (storageMode === "manifest") {
        v1Config.manifestPath = v1Config.manifestPath ?? "catalog-info.yaml";
      } else if (storageMode === "inline") {
        v1Config.inlineDocDirs = v1Config.inlineDocDirs ?? [v1Config.rootDir];
      }

      // 1a. Apply version policy defaults if requested
      if (options.versionPolicyDefaults) {
        v1Config.versionPolicy = {
          defaultCompatibility: "breaking-allowed",
          perSchema: {
            "api-contract": { compatibility: "backward-only", deprecationWindow: "90d" },
            "event-contract": { compatibility: "backward-only", deprecationWindow: "90d" },
            "canonical-entity": { compatibility: "full", deprecationWindow: "30d" },
          },
          perDomain: {
            business: { compatibility: "breaking-allowed" },
          },
        };
        console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Apply version policy defaults`));
      }

      // 2. Create .anchored-spec directory and write config
      if (!existsSync(configDir)) {
        if (!dryRun) mkdirSync(configDir, { recursive: true });
        console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create .anchored-spec/`));
      }

      if (!existsSync(configPath) || force) {
        if (!dryRun) writeFileSync(configPath, JSON.stringify(v1Config, null, 2) + "\n");
        console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Write .anchored-spec/config.json (v${v1Config.schemaVersion})`));
      } else {
        console.log(chalk.dim("  · .anchored-spec/config.json already exists (use --force to overwrite)"));
      }

      scaffoldDocsStructure(cwd, v1Config, dryRun, force);

      // 3. Create directories (mode-dependent)
      if (storageMode === "manifest") {
        const manifestPath = join(cwd, v1Config.manifestPath ?? "catalog-info.yaml");
        if (!existsSync(manifestPath) || force) {
          if (!dryRun) writeFileSync(manifestPath, "# Backstage Software Catalog\n# Add entities as YAML documents separated by ---\n");
          console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${v1Config.manifestPath ?? "catalog-info.yaml"}`));
        }
      } else if (storageMode === "inline") {
        const docDirs = v1Config.inlineDocDirs ?? ["docs"];
        for (const dir of docDirs) {
          const absDir = join(cwd, dir);
          if (!existsSync(absDir)) {
            if (!dryRun) mkdirSync(absDir, { recursive: true });
            console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${dir}/`));
          }
        }
      }
      const generatedDir = join(cwd, v1Config.generatedDir);
      if (!existsSync(generatedDir)) {
        if (!dryRun) mkdirSync(generatedDir, { recursive: true });
        console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${v1Config.generatedDir}/`));
      }

      // 6. Copy EA JSON schemas for IDE validation
      copyEaSchemas(cwd, v1Config.rootDir, dryRun, force);

      // 7. Update .gitignore
      const gitignorePath = join(cwd, ".gitignore");
      const generatedIgnore = `${v1Config.generatedDir}/`;
      const cacheIgnore = ".anchored-spec/cache/";
      if (existsSync(gitignorePath)) {
        let content = readFileSync(gitignorePath, "utf-8");
        let updated = false;
        if (!content.includes(generatedIgnore)) {
          const sep = content.endsWith("\n") ? "" : "\n";
          content += `${sep}\n# Anchored Spec\n${generatedIgnore}\n${cacheIgnore}\n`;
          updated = true;
        }
        if (updated && !dryRun) writeFileSync(gitignorePath, content);
        if (updated) console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Update .gitignore`));
      } else {
        if (!dryRun) writeFileSync(gitignorePath, `# Anchored Spec\n${generatedIgnore}\n${cacheIgnore}\n`);
        console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create .gitignore`));
      }

      // 8. Optionally create workflow policy
      if (options.withPolicy) {
        createWorkflowPolicy(cwd, v1Config, dryRun, force);
      }

      // 9. Optionally create starter examples
      if (options.withExamples) {
        createBackstageExamples(cwd, v1Config, dryRun);
      }

      // 10. Update package.json scripts
      addPackageScripts(cwd, dryRun);

      // 11. Generate VS Code integration files (--ide flag or explicit)
      if (options.ide) {
        if (!dryRun) {
          const result = writeIdeFiles(cwd, { domains: v1Config.domains });
          for (const f of result.created) {
            console.log(chalk.green(`  ✓ Create ${f}`));
          }
          for (const f of result.skipped) {
            console.log(chalk.dim(`  · Merge ${f}`));
          }
        } else {
          console.log(chalk.green("  → Generate .vscode/settings.json"));
          console.log(chalk.green("  → Generate .vscode/extensions.json"));
          console.log(chalk.green("  → Generate .vscode/anchored-spec.code-snippets"));
        }
      }

      // 12. Generate AI assistant config files (--ai flag)
      if (options.ai) {
        const targets = (options.ai as string).split(",").map((t: string) => t.trim());
        if (!dryRun) {
          const result = writeAiConfigFiles(cwd, {
            rootDir: v1Config.rootDir,
            domains: v1Config.domains,
          }, targets, { force });
          for (const f of result.created) {
            console.log(chalk.green(`  ✓ Create ${f}`));
          }
          for (const f of result.overwritten) {
            console.log(chalk.yellow(`  ⟳ Update ${f}`));
          }
          for (const f of result.skipped) {
            console.log(chalk.dim(`  · Skip ${f} (already exists, use --force to overwrite)`));
          }
        } else {
          if (targets.includes("copilot") || targets.includes("all")) {
            console.log(chalk.green("  → Generate .github/copilot-instructions.md"));
            console.log(chalk.green("  → Generate .github/prompts/ (6 reusable prompt commands)"));
          }
          if (targets.includes("claude") || targets.includes("all")) {
            console.log(chalk.green("  → Generate CLAUDE.md"));
            console.log(chalk.green("  → Generate .claude/commands/ (6 slash commands)"));
          }
          if (targets.includes("kiro") || targets.includes("all")) {
            console.log(chalk.green("  → Generate .kiro/steering/ files"));
            console.log(chalk.green("  → Generate .kiro/hooks/ (4 event-driven agent hooks)"));
          }
          if (targets.includes("speckit") || targets.includes("all")) {
            console.log(chalk.green("  → Generate .specify/extensions/anchored-spec/ (Spec-Kit extension)"));
          }
        }
      }

      // 13. Generate CI integration recipes (--ci flag)
      if (options.ci) {
        if (!dryRun) {
          const ciResult = writeCiRecipes(cwd, { force });
          for (const f of ciResult.created) {
            console.log(chalk.green(`  ✓ Create ${f}`));
          }
          for (const f of ciResult.overwritten) {
            console.log(chalk.yellow(`  ⟳ Update ${f}`));
          }
          for (const f of ciResult.skipped) {
            console.log(chalk.dim(`  · Skip ${f} (already exists, use --force to overwrite)`));
          }
        } else {
          console.log(chalk.green("  → Generate .github/workflows/ea-validation.yml"));
          console.log(chalk.green("  → Generate .anchored-spec/hooks/pre-commit"));
        }
      }

      console.log(chalk.blue(`\n✅ Project initialized with anchored-spec v${v1Config.schemaVersion}!`));
      console.log(chalk.dim("\nNext steps:"));
      console.log(chalk.dim("  1. Create an entity:      anchored-spec create --kind Component --type website --title \"My App\""));
      console.log(chalk.dim("  2. Validate entities:     anchored-spec validate"));
      console.log(chalk.dim("  3. Run full verification: anchored-spec verify"));
      console.log(chalk.dim("  4. Visualize graph:       anchored-spec graph --format mermaid"));
      if (!options.withPolicy) {
        console.log(chalk.dim("  5. Create policy:         anchored-spec init --with-policy"));
      }
      if (!options.ide) {
        console.log(chalk.dim("  6. VS Code integration:   anchored-spec init --ide"));
      }
      if (!options.ai) {
        console.log(chalk.dim("  7. AI assistant config:   anchored-spec init --ai all"));
      }
      if (!options.ci) {
        console.log(chalk.dim("  8. CI integration:        anchored-spec init --ci"));
      }
    });
}

function copyEaSchemas(cwd: string, rootDir: string, dryRun: boolean, force: boolean): void {
  const possibleSchemaDirs = [
    resolve(__dirname, "..", "..", "ea", "schemas"),
    resolve(__dirname, "..", "..", "..", "src", "ea", "schemas"),
  ];
  const schemasSource = possibleSchemaDirs.find((d) => existsSync(d));
  if (!schemasSource) return;

  const schemasTarget = join(cwd, rootDir, "schemas");
  if (!existsSync(schemasTarget)) {
    if (!dryRun) mkdirSync(schemasTarget, { recursive: true });
  }

  // Copy config schema
  const configSchema = join(schemasSource, "config-v1.schema.json");
  const configDest = join(schemasTarget, "config-v1.schema.json");
  if (existsSync(configSchema) && (!existsSync(configDest) || force)) {
    if (!dryRun) copyFileSync(configSchema, configDest);
    console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Copy ${rootDir}/schemas/config-v1.schema.json`));
  }

}

function scaffoldDocsStructure(
  cwd: string,
  config: AnchoredSpecConfigV1,
  dryRun: boolean,
  force: boolean,
): void {
  const rootDir = join(cwd, config.rootDir);
  if (!existsSync(rootDir)) {
    if (!dryRun) mkdirSync(rootDir, { recursive: true });
    console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${config.rootDir}/`));
  }

  for (const dir of new Set(getConfiguredDocSections(config).map((section) => section.path))) {
    const absDir = join(cwd, dir);
    if (!existsSync(absDir)) {
      if (!dryRun) mkdirSync(absDir, { recursive: true });
      console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${dir}/`));
    }
  }

  for (const filePath of getConfiguredRootDocs(config)) {
    if (existsSync(join(cwd, filePath)) && !force) continue;
    if (!dryRun) {
      const dir = dirname(join(cwd, filePath));
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(join(cwd, filePath), buildSeedDocContent(filePath));
    }
    console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${filePath}`));
  }
}

function buildSeedDocContent(relativePath: string): string {
  const base = relativePath.split("/").pop() ?? "README.md";
  if (base.toLowerCase() === "readme.md") {
    return `# Documentation\n\nThis repository uses Anchored Spec.\n`;
  }

  return `# ${humanizeDocName(base)}\n\nTODO: Add content.\n`;
}

function humanizeDocName(fileName: string): string {
  return fileName
    .replace(/\.md$/i, "")
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createWorkflowPolicy(
  cwd: string,
  config: AnchoredSpecConfigV1,
  dryRun: boolean,
  force: boolean,
): void {
  const policyPath = join(cwd, config.workflowPolicyPath ?? `${config.rootDir}/workflow-policy.yaml`);
  if (existsSync(policyPath) && !force) {
    console.log(chalk.dim("  · Workflow policy already exists"));
    return;
  }

  const policyContent = `# Anchored Spec — Workflow Policy
# Defines governance rules for entity lifecycle transitions.

workflowVariants:
  - id: feature-behavior-first
    name: "Feature (Behavior First)"
    defaultTypes: [feature]
    requiredSchemas: [requirements, design-doc, implementation-plan]
    verificationFocus: [behavioral-coverage, semantic-drift]

  - id: fix-root-cause-first
    name: "Fix (Root Cause First)"
    defaultTypes: [fix]
    requiredSchemas: [bugfix-spec, design-doc]
    verificationFocus: [regression-testing, root-cause-verification]

  - id: chore
    name: "Chore (Lightweight)"
    defaultTypes: [chore]
    requiredSchemas: []
    skipSkillSequence: true
    verificationFocus: [build-passes]

changeRequiredRules:
  - id: source-change
    description: "Source code changes require a change entity"
    include: ["src/**"]
    exclude: ["src/**/*.test.*", "src/**/*.spec.*"]

trivialExemptions:
  - "*.md"
  - ".github/**"
  - ".vscode/**"
  - "*.config.*"
  - ".gitignore"

lifecycleRules:
  plannedToActiveRequiresChange: true
  activeToShippedRequiresCoverage: true
  deprecatedRequiresReason: true
`;

  if (!dryRun) {
    const dir = dirname(policyPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(policyPath, policyContent);
  }
  console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${config.workflowPolicyPath ?? "ea/workflow-policy.yaml"}`));
}

function addPackageScripts(cwd: string, dryRun: boolean): void {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const scripts = pkg.scripts ?? {};
    let updated = false;

    const newScripts: Record<string, string> = {
      "spec:validate": "anchored-spec validate",
      "spec:verify": "anchored-spec verify",
      "spec:graph": "anchored-spec graph --format mermaid",
      "spec:drift": "anchored-spec drift",
      "spec:report": "anchored-spec report",
    };

    for (const [key, value] of Object.entries(newScripts)) {
      if (!scripts[key]) {
        scripts[key] = value;
        updated = true;
      }
    }

    if (updated) {
      pkg.scripts = scripts;
      if (!dryRun) writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Add spec scripts to package.json`));
    }
  } catch {
    // Non-fatal — package.json might be malformed
  }
}

function createBackstageExamples(
  cwd: string,
  config: AnchoredSpecConfigV1,
  dryRun: boolean,
): void {
  const mode = config.entityMode ?? "manifest";

  const componentYaml = `apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: example-service
  description: >
    A starter component. Replace this with your actual service description.
  annotations:
    anchored-spec.dev/confidence: "0.5"
  tags:
    - example
spec:
  type: service
  lifecycle: experimental
  owner: your-team
  system: example-system
`;

  const systemYaml = `apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: example-system
  description: An example system grouping related components.
spec:
  owner: your-team
`;

  if (mode === "manifest") {
    const manifestPath = join(cwd, config.manifestPath ?? "catalog-info.yaml");
    const content = `---\n${systemYaml}---\n${componentYaml}`;
    if (!dryRun) writeFileSync(manifestPath, content);
    console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create example entities in ${config.manifestPath ?? "catalog-info.yaml"}`));
  } else if (mode === "inline") {
    const relativeDocDir = (config.inlineDocDirs ?? [config.rootDir])[0] ?? config.rootDir;
    const docDir = join(cwd, relativeDocDir);
    if (!existsSync(docDir) && !dryRun) mkdirSync(docDir, { recursive: true });

    const svcPath = join(docDir, "example-service.md");
    if (!existsSync(svcPath)) {
      const md = `---\n${componentYaml}---\n\n# Example Service\n\nTODO: Add documentation for this service.\n`;
      if (!dryRun) writeFileSync(svcPath, md);
      console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${relativeDocDir}/example-service.md`));
    }

    const sysPath = join(docDir, "example-system.md");
    if (!existsSync(sysPath)) {
      const md = `---\n${systemYaml}---\n\n# Example System\n\nTODO: Add documentation for this system.\n`;
      if (!dryRun) writeFileSync(sysPath, md);
      console.log(chalk.green(`  ${dryRun ? "→" : "✓"} Create ${relativeDocDir}/example-system.md`));
    }
  }
}
