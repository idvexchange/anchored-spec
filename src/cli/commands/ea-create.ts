/**
 * anchored-spec ea create <kind>
 *
 * Generate a new EA artifact YAML file with the correct base shape
 * and kind-specific defaults. Supports Backstage entity format when
 * the project is configured for it.
 */

import { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import {
  getKindEntry,
  getKindPrefix,
  getDomainForKind,
  EA_KIND_REGISTRY,
  EA_DOMAINS,
  resolveEaConfig,
} from "../../ea/index.js";
import { resolveConfigV1, detectConfigVersion } from "../../ea/config.js";
import type { AnchoredSpecConfigV1 } from "../../ea/config.js";
import { mapLegacyKind, legacyIdToEntityName } from "../../ea/backstage/kind-mapping.js";
import { writeEntity } from "../../ea/backstage/entity-writer.js";
import type { BackstageEntity } from "../../ea/backstage/types.js";
import { CliError } from "../errors.js";

export function eaCreateCommand(): Command {
  return new Command("create")
    .description("Create a new EA artifact")
    .argument("[kind]", "Artifact kind (e.g., application, service, environment)")
    .option("--title <title>", "Human-readable title")
    .option("--id <id>", "Artifact slug (kind prefix auto-prepended, e.g. --id my-app → APP-my-app)")
    .option("--owner <owner>", "Owner team or person", "your-team")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--json", "Output as JSON instead of YAML")
    .option("-i, --interactive", "Interactive wizard — prompts for kind, title, owner, and relations")
    .action(async (kind: string | undefined, options) => {
      if (options.interactive) {
        return runInteractiveCreate(options);
      }

      if (!kind) {
        throw new CliError("Missing required argument: kind. Use --interactive for a wizard.", 2);
      }
      if (!options.title) {
        throw new CliError("Missing required option: --title. Use --interactive for a wizard.", 2);
      }

      return createArtifact(kind, options.title, options);
    });
}

// ── Core creation logic ─────────────────────────────────────────────────────────

interface CreateOptions {
  id?: string;
  owner?: string;
  rootDir?: string;
  json?: boolean;
  force?: boolean;
  relations?: Array<{ target: string; type: string }>;
}

function createArtifact(kind: string, title: string, options: CreateOptions): void {
  const cwd = process.cwd();
  const rootDir = (options.rootDir as string) ?? "ea";

  // Detect if the project is in Backstage mode
  const v1Config = loadProjectConfig(cwd, rootDir);
  if (v1Config && (v1Config.entityMode === "manifest" || v1Config.entityMode === "inline")) {
    createBackstageEntity(kind, title, options, v1Config, cwd);
    return;
  }

  // Legacy artifacts mode
  const eaConfig = resolveEaConfig({ rootDir });

  const entry = getKindEntry(kind);
  if (!entry) {
    const validKinds = EA_KIND_REGISTRY.map((e) => e.kind).join(", ");
    throw new CliError(`Unknown kind "${kind}". Valid kinds: ${validKinds}`, 2);
  }

  const prefix = getKindPrefix(kind)!;
  let slug = (options.id as string) ?? slugify(title);
  if (options.id) {
    const prefixWithDash = `${prefix}-`.toLowerCase();
    if (slug.toLowerCase().startsWith(prefixWithDash)) {
      slug = slug.slice(prefixWithDash.length);
    }
  }
  const id = `${prefix}-${slug}`;

  const domain = getDomainForKind(kind)!;
  const explicitRootDir = rootDir !== "ea";
  const domainDir = explicitRootDir
    ? join(cwd, rootDir)
    : join(cwd, eaConfig.domains[domain]);
  const ext = options.json ? "json" : "yaml";
  const filePath = join(domainDir, `${id}.${ext}`);

  if (existsSync(filePath) && !options.force) {
    throw new CliError(`File already exists: ${filePath}`, 1);
  }

  if (!existsSync(domainDir)) {
    mkdirSync(domainDir, { recursive: true });
  }

  const owner = (options.owner as string) ?? "your-team";

  let content: string;
  if (options.json) {
    content = generateJson(id, kind, title, owner, options.relations);
  } else {
    content = generateYaml(id, kind, title, owner, options.relations);
  }

  writeFileSync(filePath, content);

  const relDir = explicitRootDir ? rootDir : eaConfig.domains[domain];
  const relPath = `${relDir}/${id}.${ext}`;
  console.log(chalk.green(`✓ Created ${relPath}`));
  console.log(chalk.dim(`  ID:     ${id}`));
  console.log(chalk.dim(`  Kind:   ${kind}`));
  console.log(chalk.dim(`  Domain: ${domain}`));
  if (options.relations && options.relations.length > 0) {
    console.log(chalk.dim(`  Relations: ${options.relations.length}`));
  }
}

// ── Interactive wizard ──────────────────────────────────────────────────────────

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function runInteractiveCreate(baseOptions: CreateOptions): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log(chalk.blue("🏛  Anchored Spec — Interactive Artifact Wizard\n"));

    // 1. Domain
    const domainNames = Object.keys(EA_DOMAINS);
    console.log(chalk.dim("Domains: " + domainNames.join(", ")));
    const domainInput = await prompt(rl, chalk.cyan("Domain? ") + chalk.dim("(systems) "));
    const domain = domainInput || "systems";

    // 2. Kind (filtered by domain)
    const kindsForDomain = EA_KIND_REGISTRY
      .filter((e) => e.domain === domain)
      .map((e) => e.kind);
    if (kindsForDomain.length === 0) {
      throw new CliError(`No artifact kinds in domain "${domain}". Valid domains: ${domainNames.join(", ")}`, 2);
    }
    const defaultKind = kindsForDomain[0]!;
    console.log(chalk.dim("Kinds: " + kindsForDomain.join(", ")));
    const kind = await prompt(rl, chalk.cyan("Kind? ") + chalk.dim(`(${defaultKind}) `));
    const resolvedKind = kind || defaultKind;

    // 3. Title
    const title = await prompt(rl, chalk.cyan("Title? "));
    if (!title) {
      throw new CliError("Title is required.", 2);
    }

    // 4. Owner
    const ownerInput = await prompt(rl, chalk.cyan("Owner? ") + chalk.dim("(your-team) "));
    const owner = ownerInput || "your-team";

    // 5. Relations (optional, repeating)
    const relations: Array<{ target: string; type: string }> = [];
    console.log(chalk.dim("\nAdd relations (leave target empty to skip/finish):"));
    while (true) {
      const target = await prompt(rl, chalk.cyan("  Related artifact ID? "));
      if (!target) break;
      const relType = await prompt(rl, chalk.cyan("  Relation type? ") + chalk.dim("(uses) "));
      relations.push({ target, type: relType || "uses" });
    }

    console.log("");

    createArtifact(resolvedKind, title, {
      ...baseOptions,
      owner,
      relations: relations.length > 0 ? relations : undefined,
    });
  } finally {
    rl.close();
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 40);
}

function generateYaml(id: string, kind: string, title: string, owner: string, relations?: Array<{ target: string; type: string }>): string {
  const kindSpecific = getKindSpecificYaml(kind);
  const specBlock = kindSpecific ? `\nspec:\n${kindSpecific}\n` : "";

  let relationsBlock: string;
  if (relations && relations.length > 0) {
    const entries = relations
      .map((r) => `  - target: ${r.target}\n    type: ${r.type}`)
      .join("\n");
    relationsBlock = `relations:\n${entries}`;
  } else {
    relationsBlock = "relations: []";
  }

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
${relationsBlock}
`;
}

function generateJson(id: string, kind: string, title: string, owner: string, relations?: Array<{ target: string; type: string }>): string {
  const artifact: Record<string, unknown> = {
    $schema: `./node_modules/anchored-spec/dist/ea/schemas/${kind}.schema.json`,
    id,
    schemaVersion: "1.0.0",
    kind,
    title,
    status: "draft",
    summary: `TODO: Describe what this ${kind} represents.`,
    owners: [owner],
    confidence: "declared",
    tags: [],
    relations: relations && relations.length > 0
      ? relations.map((r) => ({ target: r.target, type: r.type }))
      : [],
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

// ─── Backstage Mode ─────────────────────────────────────────────────────────────

function loadProjectConfig(
  cwd: string,
  rootDir: string,
): AnchoredSpecConfigV1 | null {
  const configPath = join(cwd, ".anchored-spec", "config.json");
  if (!existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const version = detectConfigVersion(raw);
    if (version === "1.0") {
      return resolveConfigV1(raw as Partial<AnchoredSpecConfigV1>);
    }
  } catch {
    // Fall through to null — config is malformed
  }
  return null;
}

function createBackstageEntity(
  kind: string,
  title: string,
  options: CreateOptions,
  config: AnchoredSpecConfigV1,
  cwd: string,
): void {
  const entry = getKindEntry(kind);
  if (!entry) {
    const validKinds = EA_KIND_REGISTRY.map((e) => e.kind).join(", ");
    throw new CliError(`Unknown kind "${kind}". Valid kinds: ${validKinds}`, 2);
  }

  const mapping = mapLegacyKind(kind);
  if (!mapping) {
    throw new CliError(
      `No Backstage mapping found for kind "${kind}".`,
      2,
    );
  }

  const prefix = getKindPrefix(kind)!;
  let slug = (options.id as string) ?? slugify(title);
  if (options.id) {
    const prefixWithDash = `${prefix}-`.toLowerCase();
    if (slug.toLowerCase().startsWith(prefixWithDash)) {
      slug = slug.slice(prefixWithDash.length);
    }
  }
  const legacyId = `${prefix}-${slug}`;
  const entityName = legacyIdToEntityName(legacyId);
  const owner = (options.owner as string) ?? "your-team";

  const entity: BackstageEntity = {
    apiVersion: mapping.apiVersion,
    kind: mapping.backstageKind,
    metadata: {
      name: entityName,
      title,
      description: "TODO: Add description.",
      annotations: {
        "anchored-spec.dev/legacy-id": legacyId,
        "anchored-spec.dev/legacy-kind": kind,
        "anchored-spec.dev/confidence": "0.5",
      },
      tags: [],
    },
    spec: {
      ...(mapping.specType ? { type: mapping.specType } : {}),
      lifecycle: "experimental",
      owner,
      ...(options.relations && options.relations.length > 0
        ? {
            dependsOn: options.relations
              .filter((r) => r.type === "depends-on")
              .map((r) => r.target),
          }
        : {}),
    },
  };

  // Synchronous wrapper for the async writeEntity
  writeEntity(entity, config, cwd)
    .then((result) => {
      console.log(chalk.green(`✓ Created ${result.filePath}`));
      console.log(chalk.dim(`  Kind:   ${mapping.backstageKind} (${kind})`));
      console.log(chalk.dim(`  Name:   ${entityName}`));
      console.log(chalk.dim(`  Mode:   ${config.entityMode}`));
    })
    .catch((err) => {
      throw new CliError(
        `Failed to write entity: ${(err as Error).message}`,
        1,
      );
    });
}
