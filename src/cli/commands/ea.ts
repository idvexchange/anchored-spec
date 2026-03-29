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
import { eaDriftCommand } from "./ea-drift.js";
import { eaDiscoverCommand } from "./ea-discover.js";
import { eaGenerateCommand } from "./ea-generate.js";
import { eaMigrateLegacyCommand } from "./ea-migrate-legacy.js";
import { eaImpactCommand } from "./ea-impact.js";

export function eaCommand(): Command {
  const ea = new Command("ea")
    .description("Enterprise Architecture — manage EA artifacts, validate, and visualize");

  ea.addCommand(eaInitCommand());
  ea.addCommand(eaCreateCommand());
  ea.addCommand(eaValidateCommand());
  ea.addCommand(eaGraphCommand());
  ea.addCommand(eaReportCommand());
  ea.addCommand(eaEvidenceCommand());
  ea.addCommand(eaDriftCommand());
  ea.addCommand(eaDiscoverCommand());
  ea.addCommand(eaGenerateCommand());
  ea.addCommand(eaMigrateLegacyCommand());
  ea.addCommand(eaImpactCommand());

  return ea;
}
