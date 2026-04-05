import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  applyCatalogPlan,
  buildCatalogPlan,
  explainCatalogPlanEntity,
  loadProjectConfig,
  planToManifestYaml,
  renderCatalogPlanText,
} from "../../ea/index.js";
import { CliError } from "../errors.js";

export function eaCatalogCommand(): Command {
  const command = new Command("catalog")
    .description("Bootstrap and explain a curated software catalog from repository evidence");

  command
    .command("bootstrap")
    .description("Generate a proposed catalog from repository evidence")
    .option("--dry-run", "Show the proposed catalog plan without writing files")
    .option("--write <path>", "Write the proposed manifest to a file")
    .option("--merge", "Merge missing entities into the existing manifest")
    .option("--force", "Overwrite the target manifest when using --write")
    .option("--format <format>", "Output format: text (default), json, yaml", "text")
    .option("--profile <profile>", "Repository synthesis profile override")
    .option("--include <list>", "Comma-separated entity families to include")
    .option("--source <dir>", "Additional evidence scan directory", collectMultiValue, [] as string[])
    .option("--min-confidence <n>", "Minimum synthesis confidence threshold")
    .option("--max-components <n>", "Maximum top-level components to synthesize")
    .option("--explain", "Include evidence explanations in text output")
    .action(async (options) => {
      const config = loadProjectConfig(process.cwd());
      const plan = await buildCatalogPlan(process.cwd(), config, toPlanOptions(options));
      await emitOrApplyPlan(plan, config, {
        format: options.format as string,
        dryRun: options.dryRun as boolean,
        write: options.write as string | undefined,
        merge: options.merge as boolean,
        force: options.force as boolean,
        explain: options.explain as boolean,
      });
    });

  command
    .command("plan")
    .description("Produce a normalized synthesis plan without writing entities")
    .option("--format <format>", "Output format: text (default), json, yaml", "text")
    .option("--profile <profile>", "Repository synthesis profile override")
    .option("--include <list>", "Comma-separated entity families to include")
    .option("--source <dir>", "Additional evidence scan directory", collectMultiValue, [] as string[])
    .option("--min-confidence <n>", "Minimum synthesis confidence threshold")
    .option("--max-components <n>", "Maximum top-level components to synthesize")
    .option("--explain", "Include evidence explanations in text output")
    .action(async (options) => {
      const config = loadProjectConfig(process.cwd());
      const plan = await buildCatalogPlan(process.cwd(), config, toPlanOptions(options));
      outputPlan(plan, options.format as string, options.explain as boolean);
    });

  command
    .command("apply")
    .description("Apply a synthesized catalog plan to a manifest file")
    .option("--plan <path>", "Read a previously generated JSON plan from disk")
    .option("--merge", "Merge missing entities into the existing manifest")
    .option("--force", "Overwrite the target manifest")
    .option("--write <path>", "Write to an explicit manifest path")
    .option("--profile <profile>", "Repository synthesis profile override")
    .option("--include <list>", "Comma-separated entity families to include")
    .option("--source <dir>", "Additional evidence scan directory", collectMultiValue, [] as string[])
    .option("--min-confidence <n>", "Minimum synthesis confidence threshold")
    .option("--max-components <n>", "Maximum top-level components to synthesize")
    .action(async (options) => {
      const config = loadProjectConfig(process.cwd());
      const plan = options.plan
        ? (JSON.parse(readFileSync(resolve(process.cwd(), options.plan as string), "utf-8")) as Awaited<ReturnType<typeof buildCatalogPlan>>)
        : await buildCatalogPlan(process.cwd(), config, toPlanOptions(options));

      const result = await applyCatalogPlan(plan, process.cwd(), config, {
        merge: options.merge as boolean,
        force: options.force as boolean,
        writePath: options.write as string | undefined,
      });

      console.log(chalk.green(`✓ Wrote ${result.entityCount} entities to ${result.filePath}`));
      if (plan.validation.warnings.length > 0) {
        console.log(chalk.yellow(`⚠ ${plan.validation.warnings.length} validation warning(s) remain in the synthesized plan`));
      }
    });

  command
    .command("explain")
    .description("Explain why a specific entity was proposed")
    .argument("<entity-ref>", "Entity reference to explain")
    .option("--profile <profile>", "Repository synthesis profile override")
    .option("--include <list>", "Comma-separated entity families to include")
    .option("--source <dir>", "Additional evidence scan directory", collectMultiValue, [] as string[])
    .option("--min-confidence <n>", "Minimum synthesis confidence threshold")
    .option("--max-components <n>", "Maximum top-level components to synthesize")
    .action(async (entityRef, options) => {
      const config = loadProjectConfig(process.cwd());
      const plan = await buildCatalogPlan(process.cwd(), config, toPlanOptions(options));
      const entry = explainCatalogPlanEntity(plan, entityRef as string);
      if (!entry) {
        throw new CliError(`No synthesized entity found for ${entityRef}`, 2);
      }

      console.log(chalk.blue(`${entry.entity.kind} ${entry.entity.metadata.name}`));
      console.log(`Ref: ${entry.entityRef}`);
      console.log(`Confidence: ${entry.confidence.toFixed(2)}`);
      console.log(`Reason: ${entry.reason}`);
      console.log("");
      console.log("Evidence:");
      for (const evidence of entry.evidence) {
        console.log(`  - ${evidence.source}/${evidence.kind}`);
        if (evidence.path) console.log(`    path: ${evidence.path}`);
        if (evidence.title) console.log(`    title: ${evidence.title}`);
        console.log(`    confidence: ${evidence.confidence.toFixed(2)}`);
        if (evidence.signals.length > 0) {
          console.log(`    signals: ${evidence.signals.join(", ")}`);
        }
      }
    });

  return command;
}

function toPlanOptions(options: Record<string, unknown>) {
  return {
    profile: options.profile as string | undefined,
    include: typeof options.include === "string"
      ? options.include.split(",").map((item) => item.trim()).filter(Boolean)
      : undefined,
    sourceDirs: Array.isArray(options.source) ? options.source as string[] : undefined,
    minConfidence: options.minConfidence != null ? Number(options.minConfidence) : undefined,
    maxTopLevelComponents: options.maxComponents != null ? Number(options.maxComponents) : undefined,
  };
}

async function emitOrApplyPlan(
  plan: Awaited<ReturnType<typeof buildCatalogPlan>>,
  config: ReturnType<typeof loadProjectConfig>,
  options: {
    format: string;
    dryRun: boolean;
    write?: string;
    merge: boolean;
    force: boolean;
    explain: boolean;
  },
): Promise<void> {
  if (options.write || options.merge) {
    const result = await applyCatalogPlan(plan, process.cwd(), config, {
      writePath: options.write,
      merge: options.merge,
      force: options.force,
    });
    console.log(chalk.green(`✓ Wrote ${result.entityCount} entities to ${result.filePath}`));
    if (!options.dryRun) return;
  }

  outputPlan(plan, options.format, options.explain);
}

function outputPlan(
  plan: Awaited<ReturnType<typeof buildCatalogPlan>>,
  format: string,
  explain: boolean,
): void {
  switch (format) {
    case "json":
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      return;
    case "yaml":
      process.stdout.write(planToManifestYaml(plan));
      if (!planToManifestYaml(plan).endsWith("\n")) process.stdout.write("\n");
      return;
    case "text":
    default:
      process.stdout.write(renderCatalogPlanText(plan, { explain }));
  }
}

function collectMultiValue(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}
