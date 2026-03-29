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
    case "logical-data-model":
      return "  attributes:\n    - name: id\n      type: string\n      required: true";
    case "physical-schema":
      return "  engine: postgresql";
    case "data-store":
      return "  technology:\n    engine: postgresql\n    category: relational";
    case "lineage":
      return "  source:\n    artifactId: TODO\n  destination:\n    artifactId: TODO\n  mechanism: etl";
    case "master-data-domain":
      return "  entities: []\n  steward:\n    team: your-team";
    case "data-quality-rule":
      return "  ruleType: not-null\n  appliesTo: []\n  assertion: TODO\n  onFailure: alert";
    case "data-product":
      return "  domain: TODO\n  outputPorts:\n    - name: default\n      type: table";
    case "information-concept":
      return "  domain: TODO";
    case "canonical-entity":
      return "  attributes:\n    - name: id\n      type: string\n      required: true";
    case "information-exchange":
      return "  source:\n    artifactId: TODO\n  destination:\n    artifactId: TODO\n  exchangedEntities: []\n  purpose: TODO";
    case "classification":
      return "  level: TODO\n  requiredControls:\n    - control: TODO\n      description: TODO";
    case "retention-policy":
      return "  appliesTo: []\n  retention:\n    duration: TODO\n    basis: TODO\n  disposal:\n    method: delete";
    case "glossary-term":
      return "  definition: TODO\n  domain: TODO";
    case "mission":
      return "  timeHorizon: long-term\n  keyResults: []\n  strategicThemes: []";
    case "capability":
      return "  level: 1";
    case "value-stream":
      return "  stages:\n    - id: stage-1\n      name: TODO\n      supportingCapabilities: []\n  customer: TODO\n  valueProposition: TODO";
    case "process":
      return "  steps: []\n  processOwner: TODO";
    case "org-unit":
      return "  unitType: team";
    case "policy-objective":
      return "  category: operational\n  objective: TODO";
    case "business-service":
      return "  serviceType: internal";
    case "control":
      return "  controlType: detective\n  implementation: automated\n  assertion: TODO";
    case "baseline":
      return "  scope:\n    description: TODO\n  capturedAt: " + new Date().toISOString().split("T")[0] + "\n  artifactRefs: []";
    case "target":
      return "  scope:\n    description: TODO\n  effectiveBy: " + new Date(Date.now() + 180 * 86400000).toISOString().split("T")[0] + "\n  artifactRefs: []";
    case "transition-plan":
      return "  baseline: BASELINE-TODO\n  target: TARGET-TODO\n  milestones:\n    - id: m1\n      title: TODO\n      deliverables: []";
    case "migration-wave":
      return "  transitionPlan: PLAN-TODO\n  milestones: []\n  sequenceOrder: 1\n  scope:\n    create: []\n    modify: []\n    retire: []";
    case "exception":
      return "  scope:\n    artifactIds: []\n  approvedBy: TODO\n  approvedAt: " + new Date().toISOString() + "\n  expiresAt: " + new Date(Date.now() + 90 * 86400000).toISOString() + "\n  reason: TODO";
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
    case "logical-data-model":
      return { attributes: [{ name: "id", type: "string", required: true }] };
    case "physical-schema":
      return { engine: "postgresql" };
    case "data-store":
      return { technology: { engine: "postgresql", category: "relational" } };
    case "lineage":
      return { source: { artifactId: "TODO" }, destination: { artifactId: "TODO" }, mechanism: "etl" };
    case "master-data-domain":
      return { entities: [], steward: { team: "your-team" } };
    case "data-quality-rule":
      return { ruleType: "not-null", appliesTo: [], assertion: "TODO", onFailure: "alert" };
    case "data-product":
      return { domain: "TODO", outputPorts: [{ name: "default", type: "table" }] };
    case "information-concept":
      return { domain: "TODO" };
    case "canonical-entity":
      return { attributes: [{ name: "id", type: "string", required: true }] };
    case "information-exchange":
      return { source: { artifactId: "TODO" }, destination: { artifactId: "TODO" }, exchangedEntities: [], purpose: "TODO" };
    case "classification":
      return { level: "TODO", requiredControls: [{ control: "TODO", description: "TODO" }] };
    case "retention-policy":
      return { appliesTo: [], retention: { duration: "TODO", basis: "TODO" }, disposal: { method: "delete" } };
    case "glossary-term":
      return { definition: "TODO", domain: "TODO" };
    case "mission":
      return { timeHorizon: "long-term", keyResults: [], strategicThemes: [] };
    case "capability":
      return { level: 1 };
    case "value-stream":
      return { stages: [{ id: "stage-1", name: "TODO", supportingCapabilities: [] }], customer: "TODO", valueProposition: "TODO" };
    case "process":
      return { steps: [], processOwner: "TODO" };
    case "org-unit":
      return { unitType: "team" };
    case "policy-objective":
      return { category: "operational", objective: "TODO" };
    case "business-service":
      return { serviceType: "internal" };
    case "control":
      return { controlType: "detective", implementation: "automated", assertion: "TODO" };
    case "baseline":
      return { scope: { description: "TODO" }, capturedAt: new Date().toISOString().split("T")[0], artifactRefs: [] };
    case "target":
      return { scope: { description: "TODO" }, effectiveBy: new Date(Date.now() + 180 * 86400000).toISOString().split("T")[0], artifactRefs: [] };
    case "transition-plan":
      return { baseline: "BASELINE-TODO", target: "TARGET-TODO", milestones: [{ id: "m1", title: "TODO", deliverables: [] }] };
    case "migration-wave":
      return { transitionPlan: "PLAN-TODO", milestones: [], sequenceOrder: 1, scope: { create: [], modify: [], retire: [] } };
    case "exception":
      return { scope: { artifactIds: [] }, approvedBy: "TODO", approvedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(), reason: "TODO" };
    default:
      return {};
  }
}
