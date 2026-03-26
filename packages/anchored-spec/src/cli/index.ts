#!/usr/bin/env node

/**
 * Anchored Spec CLI
 *
 * Drop-in spec-driven development framework.
 * Usage: anchored-spec <command> [options]
 */

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { createCommand } from "./commands/create.js";
import { verifyCommand } from "./commands/verify.js";
import { generateCommand } from "./commands/generate.js";
import { statusCommand } from "./commands/status.js";

const program = new Command();

program
  .name("anchored-spec")
  .description("Spec-driven development framework — specs as living contracts")
  .version("0.1.0");

program.addCommand(initCommand());
program.addCommand(createCommand());
program.addCommand(verifyCommand());
program.addCommand(generateCommand());
program.addCommand(statusCommand());

program.parse();
