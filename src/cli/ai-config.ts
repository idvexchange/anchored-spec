/**
 * Anchored Spec CLI — AI assistant configuration file generator
 *
 * Generates project-level instruction files for GitHub Copilot,
 * Claude Code, and Kiro so AI assistants understand the anchored-spec
 * framework conventions out of the box.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

// ── Types ───────────────────────────────────────────────────────────────────────

export interface AiConfigInput {
  rootDir: string;
  domains: Record<string, string>;
}

export interface WriteResult {
  created: string[];
  skipped: string[];
}

export interface KiroSteering {
  product: string;
  tech: string;
  structure: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function domainList(domains: Record<string, string>, prefix: string): string {
  return Object.entries(domains)
    .map(([name, dir]) => `${prefix}\`${dir}/\` — ${name}`)
    .join("\n");
}

// ── Generators ──────────────────────────────────────────────────────────────────

export function generateCopilotInstructions(config: AiConfigInput): string {
  const { rootDir, domains } = config;
  return `# Anchored Spec — Copilot Instructions

This project uses **anchored-spec**, a spec-as-source enterprise architecture framework.
Architecture is defined as machine-validated YAML/JSON artifacts, not documentation.

## Project Structure

- \`.anchored-spec/config.json\` — Framework configuration
- \`${rootDir}/\` — EA artifact directories organized by domain:
${domainList(domains, "  - ")}
- \`SKILL.md\` — Detailed AI agent workflow instructions (READ THIS for comprehensive guidance)

## Key Commands

| Command | Purpose |
|---|---|
| \`npx anchored-spec validate\` | Validate all artifacts against schemas |
| \`npx anchored-spec create --kind <kind> --title "Name"\` | Create a new artifact |
| \`npx anchored-spec discover\` | Discover artifacts from code and infrastructure |
| \`npx anchored-spec drift\` | Detect drift between specs and reality |
| \`npx anchored-spec diff --base main\` | Semantic diff with compatibility checks |
| \`npx anchored-spec reconcile\` | Full pipeline: generate → validate → drift |
| \`npx anchored-spec graph\` | Generate dependency graph |
| \`npx anchored-spec impact <artifact-id>\` | Analyze change impact |

## Artifact Format

Every artifact has: \`apiVersion: anchored-spec/ea/v1\`, \`kind\`, \`id\` ({PREFIX}-{slug}),
\`metadata\` (name, summary, owners, tags, confidence, status), \`relations[]\`.

## Rules

1. Always validate after modifying artifacts: \`npx anchored-spec validate\`
2. Never set \`confidence: "declared"\` on discovered/inferred artifacts — human must promote
3. Relations reference artifact IDs, not file paths
4. Read \`SKILL.md\` for detailed workflow guidance before complex operations
`;
}

export function generateClaudeMd(config: AiConfigInput): string {
  const { rootDir, domains } = config;
  return `# CLAUDE.md — Anchored Spec Project

Spec-as-source EA framework. Architecture = validated YAML/JSON artifacts, not docs.

## Read First
- \`SKILL.md\` — Complete AI agent instruction set (26 sections, 15 workflows). READ THIS.
- \`.anchored-spec/config.json\` — Project configuration

## Structure
\`${rootDir}/\` contains EA artifacts across domains:
${domainList(domains, "- ")}

## Commands
- \`npx anchored-spec validate\` — Validate artifacts
- \`npx anchored-spec create --kind <kind> --title "Name"\` — Create artifact
- \`npx anchored-spec discover\` — Discover from code/infra
- \`npx anchored-spec drift\` — Check drift
- \`npx anchored-spec diff --base main\` — Semantic diff
- \`npx anchored-spec reconcile\` — Full SDD pipeline

## Key Rules
- Always validate after changes
- Artifacts use \`id: {PREFIX}-{slug}\` format (e.g., APP-todo-web, API-v1)
- Relations reference artifact IDs, not paths
- Discovered artifacts are \`draft\` + \`inferred\` — never auto-promote
`;
}

export function generateKiroSteering(config: AiConfigInput): KiroSteering {
  const { rootDir, domains } = config;

  const product = `# Product Context

This project uses anchored-spec for enterprise architecture governance.

## Goals
- Maintain a living architecture model as code
- Validate specs against 55 JSON schemas
- Detect drift between declared and observed state
- Track artifact lifecycle from draft to retired

## Workflows
- Spec-first: write the spec before the code
- Discovery: bootstrap specs from existing infrastructure
- Drift detection: continuous validation of spec ↔ reality alignment
- Governed evolution: diff → compat check → reconcile pipeline
`;

  const tech = `# Technology Context

## Stack
- **Framework**: anchored-spec (npm package)
- **Artifact format**: YAML and JSON with JSON Schema validation
- **CLI**: \`npx anchored-spec <command>\`
- **6 resolvers**: OpenAPI, Kubernetes, Terraform, SQL DDL, dbt, Tree-sitter
- **42 drift rules** across 7 domains

## Conventions
- Artifact IDs: \`{PREFIX}-{slug}\` (e.g., APP-todo-web)
- File naming: \`{PREFIX}-{slug}.yaml\` in domain directories
- Relations: typed edges between artifacts (27 relation types)
- Confidence levels: declared > observed > inferred
`;

  const structure = `# Project Structure

## EA Artifact Directories
${domainList(domains, "- ")}

## Configuration
- \`.anchored-spec/config.json\` — Framework config (schema version, domains, resolvers, quality rules)

## Key Files
- \`SKILL.md\` — AI agent instruction set (READ THIS for workflows)
- \`${rootDir}/workflow-policy.yaml\` — Workflow policy rules (if exists)

## Artifact Naming
Each artifact kind has a unique prefix:
- Systems: APP, SVC, API, EVT, INT, SIF, CON
- Delivery: PLAT, DEPLOY, CLUSTER, ZONE, IDB, CLOUD, ENV, TECH
- Data: LDM, SCHEMA, STORE, LINEAGE, MDM, DQR, DPROD
- Information: IC, CE, EXCH, CLASS, RET, TERM
- Business: MISSION, CAP, VS, PROC, ORG, POL, BSVC, CTRL
- Transitions: BASELINE, TARGET, PLAN, WAVE, EXCEPT, CHG, ADR
- Requirements: REQ, SREQ, DREQ, TREQ, IREQ
`;

  return { product, tech, structure };
}

// ── Writer ──────────────────────────────────────────────────────────────────────

export function writeAiConfigFiles(
  projectRoot: string,
  config: AiConfigInput,
  targets: string[],
): WriteResult {
  const created: string[] = [];
  const skipped: string[] = [];

  const resolvedTargets = new Set(
    targets.includes("all")
      ? ["copilot", "claude", "kiro"]
      : targets,
  );

  const filesToWrite: Array<{ rel: string; content: string }> = [];

  if (resolvedTargets.has("copilot")) {
    filesToWrite.push({
      rel: join(".github", "copilot-instructions.md"),
      content: generateCopilotInstructions(config),
    });
  }

  if (resolvedTargets.has("claude")) {
    filesToWrite.push({
      rel: "CLAUDE.md",
      content: generateClaudeMd(config),
    });
  }

  if (resolvedTargets.has("kiro")) {
    const kiro = generateKiroSteering(config);
    const steeringDir = join(".kiro", "steering");
    filesToWrite.push(
      { rel: join(steeringDir, "product.md"), content: kiro.product },
      { rel: join(steeringDir, "tech.md"), content: kiro.tech },
      { rel: join(steeringDir, "structure.md"), content: kiro.structure },
    );
  }

  for (const { rel, content } of filesToWrite) {
    const abs = join(projectRoot, rel);
    if (existsSync(abs)) {
      skipped.push(rel);
    } else {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf-8");
      created.push(rel);
    }
  }

  return { created, skipped };
}
