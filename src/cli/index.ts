#!/usr/bin/env node

/**
 * Anchored Spec CLI — v1.0
 *
 * Spec-as-source enterprise architecture framework.
 * Usage: anchored-spec <command> [options]
 *
 * All commands operate on EA artifacts. Legacy core commands have been
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

// ─── Deprecated "ea" alias group ────────────────────────────────────────────────
// Keeps `anchored-spec ea <cmd>` working but emits a deprecation warning.

function wrapWithDeprecationWarning(cmd: Command): Command {
  cmd.hook("preAction", () => {
    console.error(
      chalk.yellow(
        `⚠ "anchored-spec ea ${cmd.name()}" is deprecated. Use "anchored-spec ${cmd.name()}" directly.`,
      ),
    );
  });
  return cmd;
}

const ea = new Command("ea")
  .description("(Deprecated) EA commands — use top-level commands instead");

ea.addCommand(wrapWithDeprecationWarning(eaInitCommand()));
ea.addCommand(wrapWithDeprecationWarning(eaCreateCommand()));
ea.addCommand(wrapWithDeprecationWarning(eaValidateCommand()));
ea.addCommand(wrapWithDeprecationWarning(eaGraphCommand()));
ea.addCommand(wrapWithDeprecationWarning(eaReportCommand()));
ea.addCommand(wrapWithDeprecationWarning(eaEvidenceCommand()));
ea.addCommand(wrapWithDeprecationWarning(eaDriftCommand()));
ea.addCommand(wrapWithDeprecationWarning(eaDiscoverCommand()));
ea.addCommand(wrapWithDeprecationWarning(eaGenerateCommand()));
ea.addCommand(wrapWithDeprecationWarning(eaImpactCommand()));
ea.addCommand(wrapWithDeprecationWarning(eaStatusCommand()));
ea.addCommand(wrapWithDeprecationWarning(eaTransitionCommand()));

program.addCommand(ea);

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
