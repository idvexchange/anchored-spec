/**
 * anchored-spec ea validate
 *
 * Load all EA artifacts, run schema + quality rule + relation validation,
 * and print findings.
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  EaRoot,
  validateEaArtifacts,
  validateEaRelations,
  createDefaultRegistry,
  resolveEaConfig,
} from "../../ea/index.js";
import type { EaValidationError, EaDomain } from "../../ea/index.js";
import { autoFixArtifacts } from "../../ea/auto-fix.js";
import { CliError } from "../errors.js";

export function eaValidateCommand(): Command {
  return new Command("validate")
    .description("Validate EA artifacts (schema + quality rules + relations)")
    .option("--domain <domain>", "Validate only a specific domain")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--strict", "Treat warnings as errors")
    .option("--fix", "Auto-fix common validation issues before validating")
    .option("--json", "Output structured JSON")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, { specDir: "specs", outputDir: "output", ea: eaConfig } as never);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec ea init' first.",
          2
        );
      }

      // Auto-fix before validation if requested
      if (options.fix) {
        const fixResults = autoFixArtifacts(cwd, eaConfig.domains);
        if (fixResults.length > 0) {
          console.log(chalk.blue("🔧 Auto-fix applied:\n"));
          for (const r of fixResults) {
            console.log(chalk.green(`  ✓ ${r.relativePath}`));
            for (const fix of r.fixes) {
              console.log(chalk.dim(`    ${fix}`));
            }
          }
          console.log("");
        }
      }

      // Load artifacts
      let result;
      if (options.domain) {
        result = await root.loadDomain(options.domain as EaDomain);
      } else {
        result = await root.loadArtifacts();
      }

      // Schema errors from loading
      const allErrors: EaValidationError[] = [...result.errors];
      const allWarnings: EaValidationError[] = [];

      // Quality rules
      const qualityResult = validateEaArtifacts(result.artifacts, {
        quality: { strictMode: options.strict },
      });
      allErrors.push(...qualityResult.errors);
      allWarnings.push(...qualityResult.warnings);

      // Relation validation
      const registry = createDefaultRegistry();
      const relationResult = validateEaRelations(result.artifacts, registry, {
        quality: { strictMode: options.strict },
      });
      allErrors.push(...relationResult.errors);
      allWarnings.push(...relationResult.warnings);

      // Promote warnings to errors in strict mode
      if (options.strict) {
        allErrors.push(...allWarnings.splice(0));
      }

      if (options.json) {
        const output = {
          valid: allErrors.length === 0,
          artifactsLoaded: result.artifacts.length,
          errors: allErrors,
          warnings: allWarnings,
          summary: root.getSummary(),
        };
        process.stdout.write(JSON.stringify(output, null, 2) + "\n");
      } else {
        printHumanOutput(result.artifacts.length, allErrors, allWarnings);
      }

      if (allErrors.length > 0) {
        throw new CliError("", 1);
      }
    });
}

function printHumanOutput(
  artifactCount: number,
  errors: EaValidationError[],
  warnings: EaValidationError[]
): void {
  console.log(chalk.blue("🏛  Anchored Spec — EA Validation\n"));

  if (errors.length > 0) {
    console.log(chalk.red(`  ✗ ${errors.length} error(s):`));
    for (const err of errors) {
      console.log(chalk.red(`    ${err.path}: ${err.message}`));
      console.log(chalk.dim(`      Rule: ${err.rule}`));
    }
  }

  if (warnings.length > 0) {
    console.log(chalk.yellow(`  ⚠ ${warnings.length} warning(s):`));
    for (const warn of warnings) {
      console.log(chalk.yellow(`    ${warn.path}: ${warn.message}`));
      console.log(chalk.dim(`      Rule: ${warn.rule}`));
    }
  }

  console.log(
    chalk.dim(
      `\n  ${artifactCount} artifacts | ${errors.length} errors | ${warnings.length} warnings`
    )
  );

  if (errors.length === 0) {
    console.log(chalk.green("\n✓ EA validation passed."));
  } else {
    console.log(chalk.red("\n✗ EA validation failed."));
  }
}
