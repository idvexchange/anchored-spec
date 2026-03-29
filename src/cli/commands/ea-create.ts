/**
 * anchored-spec ea create <kind>
 *
 * Generate a new EA artifact YAML file with the correct base shape
 * and kind-specific defaults.
 */

import { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  getKindEntry,
  getKindPrefix,
  getDomainForKind,
  EA_KIND_REGISTRY,
  resolveEaConfig,
} from "../../ea/index.js";
import { CliError } from "../errors.js";

export function eaCreateCommand(): Command {
  return new Command("create")
    .description("Create a new EA artifact")
    .argument("<kind>", "Artifact kind (e.g., application, service, environment)")
    .requiredOption("--title <title>", "Human-readable title")
    .option("--id <id>", "Artifact ID (auto-generated from title if omitted)")
    .option("--owner <owner>", "Owner team or person", "your-team")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--json", "Output as JSON instead of YAML")
    .action((kind: string, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });

      // Validate kind
      const entry = getKindEntry(kind);
      if (!entry) {
        const validKinds = EA_KIND_REGISTRY.map((e) => e.kind).join(", ");
        throw new CliError(
          `Unknown kind "${kind}". Valid kinds: ${validKinds}`,
          2
        );
      }

      // Resolve ID
      const prefix = getKindPrefix(kind)!;
      const slug = (options.id as string) ?? slugify(options.title as string);
      const id = `${prefix}-${slug}`;

      // Resolve domain and output path
      const domain = getDomainForKind(kind)!;
      const domainDir = join(cwd, eaConfig.domains[domain]);
      const ext = options.json ? "json" : "yaml";
      const filePath = join(domainDir, `${id}.${ext}`);

      if (existsSync(filePath) && !options.force) {
        throw new CliError(`File already exists: ${filePath}`, 1);
      }

      // Ensure domain directory exists
      if (!existsSync(domainDir)) {
        mkdirSync(domainDir, { recursive: true });
      }

      const title = options.title as string;
      const owner = options.owner as string;

      // Generate content
      let content: string;
      if (options.json) {
        content = generateJson(id, kind, title, owner);
      } else {
        content = generateYaml(id, kind, title, owner);
      }

      writeFileSync(filePath, content);

      const relPath = `${eaConfig.domains[domain]}/${id}.${ext}`;
      console.log(chalk.green(`✓ Created ${relPath}`));
      console.log(chalk.dim(`  ID:     ${id}`));
      console.log(chalk.dim(`  Kind:   ${kind}`));
      console.log(chalk.dim(`  Domain: ${domain}`));
    });
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 40);
}

function generateYaml(id: string, kind: string, title: string, owner: string): string {
  const kindSpecific = getKindSpecificYaml(kind);
  const specBlock = kindSpecific ? `\nspec:\n${kindSpecific}\n` : "";

  return `apiVersion: anchored-spec/ea/v1
kind: ${kind}
id: ${id}

metadata:
  name: ${title}
  summary: >
    TODO: Describe what this ${kind} represents.
  owners:
    - ${owner}
  tags: []
  confidence: declared
  status: draft
  schemaVersion: "1.0.0"
${specBlock}
relations: []
`;
}

function generateJson(id: string, kind: string, title: string, owner: string): string {
  const artifact: Record<string, unknown> = {
    id,
    schemaVersion: "1.0.0",
    kind,
    title,
    status: "draft",
    summary: `TODO: Describe what this ${kind} represents.`,
    owners: [owner],
    confidence: "declared",
    tags: [],
    relations: [],
  };

  // Add kind-specific required fields
  const extra = getKindSpecificJson(kind);
  Object.assign(artifact, extra);

  return JSON.stringify(artifact, null, 2) + "\n";
}

function getKindSpecificYaml(kind: string): string | null {
  switch (kind) {
    case "system-interface":
      return "  direction: inbound\n  ownership: owned";
    case "consumer":
      return "  consumerType: internal\n  consumesContracts: []";
    case "cloud-resource":
      return "  provider: aws\n  resourceType: TODO";
    case "environment":
      return "  tier: development\n  isProduction: false";
    case "technology-standard":
      return "  category: framework\n  technology: TODO";
    default:
      return null;
  }
}

function getKindSpecificJson(kind: string): Record<string, unknown> {
  switch (kind) {
    case "system-interface":
      return { direction: "inbound", ownership: "owned" };
    case "consumer":
      return { consumerType: "internal", consumesContracts: [] };
    case "cloud-resource":
      return { provider: "aws", resourceType: "TODO" };
    case "environment":
      return { tier: "development", isProduction: false };
    case "technology-standard":
      return { category: "framework", technology: "TODO" };
    default:
      return {};
  }
}
