/**
 * anchored-spec ea constraints
 *
 * Extract governing constraints (Decisions, Requirements) reachable from a
 * subject entity set, with path evidence.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import {
  EaRoot,
  createDefaultRegistry,
  buildRelationGraph,
  resolveConfigV1,
} from "../../ea/index.js";
import {
  extractConstraints,
  renderConstraintsMarkdown,
} from "../../ea/constraints.js";
import type { ConstraintOptions } from "../../ea/constraints.js";
import {
  resolveFromFiles,
  resolveFromDiff,
  resolveFromSymbols,
} from "../../ea/reverse-resolution.js";
import { scanDocs } from "../../ea/docs/scanner.js";
import { getEntityId } from "../../ea/backstage/index.js";
import { buildEntityLookup, suggestEntities } from "../entity-ref.js";
import { CliError } from "../errors.js";

export function eaConstraintsCommand(): Command {
  return new Command("constraints")
    .description(
      "Extract governing constraints (Decisions, Requirements) for an entity",
    )
    .argument("[entity-ref]", "Entity ref to analyze")
    .option("--format <format>", "Output format: markdown, json", "markdown")
    .option("--output <file>", "Write to file instead of stdout")
    .option("--max-depth <n>", "Maximum traversal depth", "3")
    .option("--profile <name>", "Traversal profile: strict, contract", "strict")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option(
      "--from-file <path>",
      "Resolve file to entity refs, then find constraints",
    )
    .option(
      "--from-symbol <name>",
      "Resolve symbol to entity refs, then find constraints",
    )
    .option(
      "--from-diff [ref]",
      "Resolve git diff to entity refs, then find constraints",
    )
    .option("--staged", "Use staged changes with --from-diff")
    .option(
      "--fail-on-constraints",
      "Exit with code 1 if any governing constraints are found (CI gate)",
    )
    .action(async (entityInput: string | undefined, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec init' first.",
          2,
        );
      }

      const result = await root.loadEntities();

      if (result.entities.length === 0) {
        console.log(chalk.yellow("No entities found."));
        return;
      }

      const registry = createDefaultRegistry();
      const entities = result.entities;
      const graph = buildRelationGraph(entities, registry);
      const lookup = buildEntityLookup(entities);

      // Determine entity refs to analyze
      let entityRefs: string[] = [];

      if (options.fromFile) {
        const scanned = scanDocs(cwd);
        const resolutions = resolveFromFiles(
          [options.fromFile as string],
          entities,
          scanned.docs,
          cwd,
        );
        if (resolutions.length === 0) {
          throw new CliError(
            `No entities resolved from file: ${options.fromFile}`,
            2,
          );
        }
        console.error(
          chalk.dim(
            `Resolved ${resolutions.length} entity ref(s) from file: ${options.fromFile}`,
          ),
        );
        for (const r of resolutions) {
          console.error(
            chalk.dim(`  → ${r.resolvedEntityRef} (${r.confidence})`),
          );
        }
        entityRefs = [...new Set(resolutions.map((r) => r.resolvedEntityRef))];
      } else if (options.fromSymbol) {
        const scanned = scanDocs(cwd);
        const resolutions = resolveFromSymbols(
          [options.fromSymbol as string],
          entities,
          scanned.docs,
        );
        if (resolutions.length === 0) {
          throw new CliError(
            `No entities resolved from symbol: ${options.fromSymbol}`,
            2,
          );
        }
        console.error(
          chalk.dim(
            `Resolved ${resolutions.length} entity ref(s) from symbol: ${options.fromSymbol}`,
          ),
        );
        for (const r of resolutions) {
          console.error(
            chalk.dim(`  → ${r.resolvedEntityRef} (${r.confidence})`),
          );
        }
        entityRefs = [...new Set(resolutions.map((r) => r.resolvedEntityRef))];
      } else if (options.fromDiff !== undefined) {
        const scanned = scanDocs(cwd);
        const diffRef =
          typeof options.fromDiff === "string"
            ? options.fromDiff
            : undefined;
        const resolutions = resolveFromDiff(
          {
            staged: !!options.staged,
            refRange: diffRef,
          },
          entities,
          scanned.docs,
          cwd,
        );
        if (resolutions.length === 0) {
          throw new CliError(
            "No entities resolved from diff. Are there changed files?",
            2,
          );
        }
        console.error(
          chalk.dim(
            `Resolved ${resolutions.length} entity ref(s) from diff`,
          ),
        );
        for (const r of resolutions) {
          console.error(
            chalk.dim(
              `  → ${r.resolvedEntityRef} (${r.confidence}, ${r.inputValue})`,
            ),
          );
        }
        entityRefs = [...new Set(resolutions.map((r) => r.resolvedEntityRef))];
      } else if (entityInput) {
        const targetEntity = lookup.byInput.get(entityInput);
        const resolvedId = targetEntity
          ? getEntityId(targetEntity)
          : entityInput;

        if (!graph.node(resolvedId)) {
          const similar = suggestEntities(entityInput, entities);
          const hint =
            similar.length > 0
              ? `\n  Did you mean: ${similar.join(", ")}?`
              : "";
          throw new CliError(
            `Entity "${entityInput}" not found.${hint}`,
            2,
          );
        }

        entityRefs = [resolvedId];
      } else {
        throw new CliError(
          "No input specified. Provide <entity-ref>, --from-file, --from-symbol, or --from-diff.",
          2,
        );
      }

      const constraintOptions: ConstraintOptions = {
        maxDepth: parseInt(options.maxDepth as string, 10),
        profile: options.profile as "strict" | "contract",
        format: options.format as "markdown" | "json",
        entities,
      };

      const constraints = extractConstraints(
        graph,
        entityRefs,
        constraintOptions,
      );

      // Render output
      let output: string;
      if (options.format === "json") {
        output = JSON.stringify(constraints, null, 2) + "\n";
      } else {
        output = renderConstraintsMarkdown(constraints, entityRefs);
      }

      if (options.output) {
        writeFileSync(options.output as string, output);
        console.log(
          chalk.green(`✓ Constraints report written to ${options.output}`),
        );
      } else {
        process.stdout.write(output);
      }

      // Summary
      if (constraints.length > 0) {
        console.error(
          chalk.yellow(
            `⚠ ${constraints.length} governing constraint${constraints.length !== 1 ? "s" : ""} found`,
          ),
        );
      } else {
        console.error(
          chalk.green("✓ No governing constraints found."),
        );
      }

      // CI gate
      if (options.failOnConstraints && constraints.length > 0) {
        throw new CliError("Governing constraints found", 1);
      }
    });
}
