#!/usr/bin/env node

/**
 * Anchored Spec CLI — v1.0
 *
 * Spec-as-source enterprise architecture framework.
 * Usage: anchored-spec <command> [options]
 *
 * All commands operate on Backstage-aligned entities. Legacy core commands have been
 * replaced by their EA equivalents.
 */

import { Command } from "commander";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import chalk from "chalk";
import { eaInitCommand } from "./commands/ea-init.js";
import { eaCreateCommand } from "./commands/ea-create.js";
import { eaValidateCommand } from "./commands/ea-validate.js";
import { eaGraphCommand } from "./commands/ea-graph.js";
import { eaReportCommand } from "./commands/ea-report.js";
import { eaEvidenceCommand } from "./commands/ea-evidence.js";
import { eaDriftCommand } from "./commands/ea-drift.js";
import { eaDiscoverCommand } from "./commands/ea-discover.js";
import { eaGenerateCommand } from "./commands/ea-generate.js";
import { eaImpactCommand } from "./commands/ea-impact.js";
import { eaStatusCommand } from "./commands/ea-status.js";
import { eaTransitionCommand } from "./commands/ea-transition.js";
import { verifyCommand } from "./commands/verify.js";
import { batchUpdateCommand } from "./commands/batch-update.js";
import { eaDiffCommand } from "./commands/ea-diff.js";
import { eaReconcileCommand } from "./commands/ea-reconcile.js";
import { eaTraceCommand } from "./commands/ea-trace.js";
import { eaLinkDocsCommand } from "./commands/ea-link-docs.js";
import { eaContextCommand } from "./commands/ea-context.js";
import { eaCreateDocCommand } from "./commands/ea-create-doc.js";
import { eaLinkCommand } from "./commands/ea-link.js";
import { eaSearchCommand } from "./commands/ea-search.js";
import { eaConstraintsCommand } from "./commands/ea-constraints.js";
import { CliError } from "./errors.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

const program = new Command();

program
  .name("anchored-spec")
  .description("Spec-as-source enterprise architecture framework")
  .version(pkg.version)
  .option("--cwd <dir>", "Project root directory (default: current directory)");

// --cwd support: change process.cwd() before any command runs
program.hook("preAction", (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  if (opts.cwd) {
    process.chdir(resolve(opts.cwd as string));
  }
});

// ─── Top-level EA commands (v1.0) ───────────────────────────────────────────────

program.addCommand(eaInitCommand());
program.addCommand(eaCreateCommand());
program.addCommand(eaValidateCommand());
program.addCommand(eaGraphCommand());
program.addCommand(eaReportCommand());
program.addCommand(eaEvidenceCommand());
program.addCommand(eaDriftCommand());
program.addCommand(eaDiscoverCommand());
program.addCommand(eaGenerateCommand());
program.addCommand(eaImpactCommand());
program.addCommand(eaStatusCommand());
program.addCommand(eaTransitionCommand());
program.addCommand(verifyCommand());
program.addCommand(batchUpdateCommand());
program.addCommand(eaDiffCommand());
program.addCommand(eaReconcileCommand());
program.addCommand(eaTraceCommand());
program.addCommand(eaLinkDocsCommand());
program.addCommand(eaContextCommand());
program.addCommand(eaCreateDocCommand());
program.addCommand(eaLinkCommand());
program.addCommand(eaSearchCommand());
program.addCommand(eaConstraintsCommand());

// ─── Run ────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    await program.parseAsync();
  } catch (err) {
    if (err instanceof CliError) {
      if (err.message) {
        console.error(chalk.red(err.message));
      }
      process.exit(err.exitCode);
    }
    // Unknown error — re-throw for stack trace
    throw err;
  }
}

main();
