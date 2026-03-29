/**
 * anchored-spec ea
 *
 * Top-level EA command namespace. Registers subcommands:
 * ea init, ea create, ea validate, ea graph
 */

import { Command } from "commander";
import { eaInitCommand } from "./ea-init.js";
import { eaCreateCommand } from "./ea-create.js";
import { eaValidateCommand } from "./ea-validate.js";
import { eaGraphCommand } from "./ea-graph.js";
import { eaReportCommand } from "./ea-report.js";
import { eaEvidenceCommand } from "./ea-evidence.js";

export function eaCommand(): Command {
  const ea = new Command("ea")
    .description("Enterprise Architecture — manage EA artifacts, validate, and visualize");

  ea.addCommand(eaInitCommand());
  ea.addCommand(eaCreateCommand());
  ea.addCommand(eaValidateCommand());
  ea.addCommand(eaGraphCommand());
  ea.addCommand(eaReportCommand());
  ea.addCommand(eaEvidenceCommand());

  return ea;
}
