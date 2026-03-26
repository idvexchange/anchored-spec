#!/usr/bin/env node

/**
 * Anchored Spec CLI
 *
 * Drop-in spec-driven development framework.
 * Usage: anchored-spec <command> [options]
 */

import { Command } from "commander";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import chalk from "chalk";
import { initCommand } from "./commands/init.js";
import { createCommand } from "./commands/create.js";
import { verifyCommand } from "./commands/verify.js";
import { generateCommand } from "./commands/generate.js";
import { statusCommand } from "./commands/status.js";
import { transitionCommand } from "./commands/transition.js";
import { checkCommand } from "./commands/check.js";
import { migrateCommand } from "./commands/migrate.js";
import { driftCommand } from "./commands/drift.js";
import { importCommand } from "./commands/import-cmd.js";
import { reportCommand } from "./commands/report.js";
import { evidenceCommand } from "./commands/evidence.js";
import { impactCommand } from "./commands/impact.js";
import { CliError } from "./errors.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

const program = new Command();

program
  .name("anchored-spec")
  .description("Spec-driven development framework — specs as living contracts")
  .version(pkg.version)
  .option("--cwd <dir>", "Project root directory (default: current directory)");

// --cwd support: change process.cwd() before any command runs
program.hook("preAction", (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  if (opts.cwd) {
    process.chdir(resolve(opts.cwd as string));
  }
});

program.addCommand(initCommand());
program.addCommand(createCommand());
program.addCommand(verifyCommand());
program.addCommand(generateCommand());
program.addCommand(statusCommand());
program.addCommand(transitionCommand());
program.addCommand(checkCommand());
program.addCommand(migrateCommand());
program.addCommand(driftCommand());
program.addCommand(importCommand());
program.addCommand(reportCommand());
program.addCommand(evidenceCommand());
program.addCommand(impactCommand());

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
