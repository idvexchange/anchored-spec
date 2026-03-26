#!/usr/bin/env node

/**
 * Anchored Spec CLI
 *
 * Drop-in spec-driven development framework.
 * Usage: anchored-spec <command> [options]
 */

import { Command } from "commander";
import { createRequire } from "node:module";
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

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

const program = new Command();

program
  .name("anchored-spec")
  .description("Spec-driven development framework — specs as living contracts")
  .version(pkg.version);

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

program.parse();
