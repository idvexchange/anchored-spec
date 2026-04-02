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
  overwritten: string[];
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
  const { rootDir } = config;
  return `# Anchored Spec — Copilot Instructions

This project uses **anchored-spec**, a spec-as-source enterprise architecture framework.
Architecture is defined as Backstage-aligned entities stored in catalog manifests or markdown frontmatter.

## Project Structure

- \`.anchored-spec/config.json\` — Framework configuration
- \`catalog-info.yaml\` or \`docs/*.md\` — Entity storage, depending on \`entityMode\`
- \`${rootDir}/generated/\` — Generated outputs and reports
- \`SKILL.md\` — Detailed AI agent workflow instructions (READ THIS for comprehensive guidance)

## Key Commands

| Command | Purpose |
|---|---|
| \`npx anchored-spec validate\` | Validate all entities against schemas |
| \`npx anchored-spec create --kind Component --type website --title "Name"\` | Create a new entity |
| \`npx anchored-spec discover\` | Discover entities from code and infrastructure |
| \`npx anchored-spec drift\` | Detect drift between specs and reality |
| \`npx anchored-spec diff --base main\` | Semantic diff with compatibility checks |
| \`npx anchored-spec reconcile\` | Full pipeline: generate → validate → drift |
| \`npx anchored-spec graph\` | Generate dependency graph |
| \`npx anchored-spec impact <entity-ref>\` | Analyze change impact |

## Entity Format

Entities use the Backstage catalog shape: \`apiVersion\`, \`kind\`, \`metadata\`, and \`spec\`.
Anchored-spec metadata lives in \`anchored-spec.dev/*\` annotations and entity-specific \`spec\` fields.

## Rules

1. Always validate after modifying entities: \`npx anchored-spec validate\`
2. Keep \`metadata.name\` stable once referenced by other entities or docs
3. Use project-configured manifest or inline storage; do not invent ad-hoc file layouts
4. Read \`SKILL.md\` for detailed workflow guidance before complex operations
`;
}

export function generateClaudeMd(_config: AiConfigInput): string {
  return `# CLAUDE.md — Anchored Spec Project

Spec-as-source EA framework. Architecture = Backstage-aligned entities, not ad-hoc docs.

## Read First
- \`SKILL.md\` — Complete AI agent instruction set (26 sections, 15 workflows). READ THIS.
- \`.anchored-spec/config.json\` — Project configuration

## Structure
\`catalog-info.yaml\` or \`docs/*.md\` stores the project entities, based on \`.anchored-spec/config.json\`.

## Commands
- \`npx anchored-spec validate\` — Validate entities
- \`npx anchored-spec create --kind Component --type website --title "Name"\` — Create entity
- \`npx anchored-spec discover\` — Discover from code/infra
- \`npx anchored-spec drift\` — Check drift
- \`npx anchored-spec diff --base main\` — Semantic diff
- \`npx anchored-spec reconcile\` — Full SDD pipeline

## Key Rules
- Always validate after changes
- Entities use stable \`metadata.name\` slugs and Backstage-compatible refs
- Preserve \`anchored-spec.dev/*\` annotations when editing entity YAML/frontmatter
- Discovered entities stay \`draft\` + \`inferred\` until a human promotes them
`;
}

// ── Reusable Prompt Generators ──────────────────────────────────────────────────

export interface AgentPrompts {
  scaffold: string;
  trace: string;
  context: string;
  drift: string;
  audit: string;
}

/**
 * Generate reusable prompt templates for EA workflows.
 * Used by both Copilot (.prompt.md) and Claude (.claude/commands/) generators.
 * The format is agent-agnostic markdown with $ARGUMENTS placeholder.
 */
export function generateAgentPrompts(_config: AiConfigInput): AgentPrompts {
  const scaffold = `Scaffold EA entities from document frontmatter references.

Steps:
1. Preview: \`npx anchored-spec discover --from-docs --dry-run\`
2. Review the output — it shows new entities to create, existing ones (skipped), and unknown prefixes
3. If the preview looks correct: \`npx anchored-spec discover --from-docs\`
4. For each new draft entity, read the source spec and fill in schema-specific fields (tech stack, endpoints, schemas, etc.)
5. Set confidence to "declared" after human review
6. Sync trace links: \`npx anchored-spec link-docs\`
7. Validate: \`npx anchored-spec validate\`
`;

  const trace = `Check bidirectional traceability between docs and EA entities.

If $ARGUMENTS is provided, trace that specific entity or file. Otherwise run a full check.

Steps:
1. Run: \`npx anchored-spec trace --check\` (or \`npx anchored-spec trace $ARGUMENTS\`)
2. Report findings:
   - ✅ Bidirectional: entity traceRef → doc AND doc ea-entities → entity
   - ⚠ One-way: link exists in only one direction
   - ❌ Broken: traceRef points to a missing file
3. To fix one-way links: \`npx anchored-spec link-docs\`
4. Show summary: \`npx anchored-spec trace --summary\`
`;

  const context = `Assemble the full architectural context for entity $ARGUMENTS before starting implementation.

Steps:
1. Run: \`npx anchored-spec context $ARGUMENTS\`
2. This gathers: the entity descriptor, all traced docs (by role), transitive dependencies, and related entities
3. For token-limited contexts: \`npx anchored-spec context $ARGUMENTS --max-tokens 8000\`
4. Show the dependency graph: \`npx anchored-spec graph --focus $ARGUMENTS --depth 2 --format mermaid\`
5. Check impact: \`npx anchored-spec impact $ARGUMENTS\`
6. Present context blocks: Feature intent | Architecture | Standards | Guardrails | Current state
`;

  const drift = `Check for drift between EA specifications and the current codebase.

Steps:
1. Run: \`npx anchored-spec drift\`
2. If drift is detected, report which entities are affected and what drifted
3. For each finding, suggest resolution:
   - Code is correct → update the entity: \`npx anchored-spec reconcile\`
   - Spec is correct → revert the code change
4. Run \`npx anchored-spec validate\` after any reconciliation
`;

  const audit = `Run a pre-implementation spec audit to verify the architecture is ready for coding.

Steps:
1. Run: \`npx anchored-spec validate\` — zero schema errors required
2. Run: \`npx anchored-spec drift\` — check for existing drift
3. Run: \`npx anchored-spec trace --check\` — verify doc↔entity links
4. Check confidence: are key entities at "declared" (not "inferred")?
5. Check relations: does the target entity have defined dependencies?
6. Report a go/no-go decision with specific items to fix before implementation
`;

  return { scaffold, trace, context, drift, audit };
}

/**
 * Generate Copilot prompt files (.prompt.md) for .github/prompts/
 */
export function generateCopilotPrompts(config: AiConfigInput): Array<{ name: string; content: string }> {
  const prompts = generateAgentPrompts(config);

  return [
    {
      name: "ea-scaffold",
      content: `---
description: "Scaffold EA entities from document frontmatter references"
---
${prompts.scaffold}`,
    },
    {
      name: "ea-trace",
      content: `---
description: "Check bidirectional traceability between docs and EA entities"
---
${prompts.trace}`,
    },
    {
      name: "ea-context",
      content: `---
description: "Assemble full architectural context for an EA entity"
---
${prompts.context}`,
    },
    {
      name: "ea-drift",
      content: `---
description: "Check for drift between EA specs and the codebase"
---
${prompts.drift}`,
    },
    {
      name: "ea-audit",
      content: `---
description: "Pre-implementation spec audit — verify architecture is ready for coding"
---
${prompts.audit}`,
    },
  ];
}

/**
 * Generate Claude Code command files (.md) for .claude/commands/
 */
export function generateClaudeCommands(config: AiConfigInput): Array<{ name: string; content: string }> {
  const prompts = generateAgentPrompts(config);

  return [
    { name: "ea-scaffold", content: prompts.scaffold },
    { name: "ea-trace", content: prompts.trace },
    { name: "ea-context", content: prompts.context },
    { name: "ea-drift", content: prompts.drift },
    { name: "ea-audit", content: prompts.audit },
  ];
}

export function generateKiroSteering(config: AiConfigInput): KiroSteering {
  const { rootDir, domains } = config;

  const product = `# Product Context

This project uses anchored-spec for enterprise architecture governance.

## Goals
- Maintain a living architecture model as code
- Validate specs against 55 JSON schemas
- Detect drift between declared and observed state
- Track entity lifecycle from draft to retired

## Workflows
- Spec-first: write the spec before the code
- Discovery: bootstrap specs from existing infrastructure
- Drift detection: continuous validation of spec ↔ reality alignment
- Governed evolution: diff → compat check → reconcile pipeline
`;

  const tech = `# Technology Context

## Stack
- **Framework**: anchored-spec (npm package)
- **Entity format**: YAML and JSON with JSON Schema validation
- **CLI**: \`npx anchored-spec <command>\`
- **6 resolvers**: OpenAPI, Kubernetes, Terraform, SQL DDL, dbt, Tree-sitter
- **42 drift rules** across 7 domains

## Conventions
- Entity IDs: \`{PREFIX}-{slug}\` (e.g., APP-todo-web)
- File naming: \`{PREFIX}-{slug}.yaml\` in domain directories
- Relations: typed edges between entities (27 relation types)
- Confidence levels: declared > observed > inferred
`;

  const structure = `# Project Structure

## EA Entity Directories
${domainList(domains, "- ")}

## Configuration
- \`.anchored-spec/config.json\` — Framework config (schema version, domains, resolvers, quality rules)

## Key Files
- \`SKILL.md\` — AI agent instruction set (READ THIS for workflows)
- \`${rootDir}/workflow-policy.yaml\` — Workflow policy rules (if exists)

## Entity Naming
Each schema profile has a unique prefix:
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

// ── Kiro Hooks Generator ────────────────────────────────────────────────────────

export interface KiroHooks {
  validateOnSave: string;
  traceOnSave: string;
  driftOnSave: string;
}

export function generateKiroHooks(config: AiConfigInput): KiroHooks {
  const { rootDir } = config;

  const validateOnSave = `name: "Validate EA Entity"
description: "Validate EA entities against JSON schemas when saved"
trigger: onSave
pattern: "${rootDir}/**/*.{yaml,yml,json}"
throttle: 2000
action: |
  An EA entity file was just saved. Validate it:

  1. Run the anchored-spec validator on the saved file:
     \`\`\`bash
     npx anchored-spec validate --json
     \`\`\`
  2. If there are schema errors, report them concisely with the field path and expected type.
  3. If there are drift warnings, mention them but don't block.
  4. If everything is valid, report "✓ Entity valid" and nothing more.

  Be concise — only report problems. A clean entity needs no explanation.
`;

  const traceOnSave = `name: "Check Trace Integrity"
description: "Verify bidirectional trace links when a spec document is saved"
trigger: onSave
pattern: "{docs,specs,doc,documentation}/**/*.md"
throttle: 3000
action: |
  A spec document was saved. Check that trace links between this document and EA entities are intact.

  1. Run trace check:
     \`\`\`bash
     npx anchored-spec trace --check --json 2>/dev/null
     \`\`\`

  2. Report only problems:
     - ⚠ One-way links: entity references the doc but doc doesn't list the entity (or vice versa)
     - ❌ Broken links: traceRef points to a file that doesn't exist

  3. If there are one-way links, suggest running:
     \`\`\`bash
     npx anchored-spec link-docs
     \`\`\`

  4. If everything is bidirectional, report nothing — silence means success.
`;

  const driftOnSave = `name: "Drift Detection on Code Changes"
description: "Check for EA drift when implementation files change"
trigger: onSave
pattern: "src/**/*.{ts,js,tsx,jsx,py,java,go,rs}"
throttle: 5000
action: |
  An implementation file was saved. Check if it has drifted from the EA specification.

  1. Run drift detection:
     \`\`\`bash
     npx anchored-spec drift --json 2>/dev/null
     \`\`\`

  2. If drift is detected, report:
     - Which entities are affected
     - What the drift is (e.g. "endpoint /api/users not declared in API-users-v1")
     - Whether it's a warning or error

  3. Suggest resolution:
     - If the code is correct: "Update the entity to match: npx anchored-spec reconcile"
     - If the spec is correct: "Revert the code change to match the spec"

  4. If no drift is detected, report nothing.
`;

  return { validateOnSave, traceOnSave, driftOnSave };
}

// ── Spec-Kit Extension Generator ────────────────────────────────────────────────

export interface SpecKitExtension {
  manifest: string;
  scaffoldCmd: string;
  traceCmd: string;
  contextCmd: string;
}

export function generateSpecKitExtension(config: AiConfigInput): SpecKitExtension {
  const { rootDir } = config;

  const manifest = `schema_version: "1.0"

extension:
  id: "anchored-spec"
  name: "Anchored Spec EA Framework"
  version: "1.0.0"
  description: "Spec-as-source enterprise architecture: frontmatter enrichment, entity scaffolding, trace validation, and AI context assembly"
  author: "anchored-spec"
  repository: "https://github.com/idvexchange/anchored-spec"
  license: "MIT"

requires:
  speckit_version: ">=0.5.0"
  tools:
    - name: "npx"
      required: true
      version: ">=8.0.0"

provides:
  commands:
    - name: "speckit.anchored-spec.scaffold"
      file: "commands/scaffold.md"
      description: "Scaffold EA entities from spec document frontmatter references"

    - name: "speckit.anchored-spec.trace"
      file: "commands/trace.md"
      description: "Check bidirectional traceability between specs and EA entities"

    - name: "speckit.anchored-spec.context"
      file: "commands/context.md"
      description: "Assemble AI context package for an EA entity"

hooks:
  after_tasks:
    command: "speckit.anchored-spec.scaffold"
    optional: true
    prompt: "Scaffold EA entities from spec frontmatter references?"

tags:
  - "enterprise-architecture"
  - "traceability"
  - "spec-driven"
  - "frontmatter"
`;

  const scaffoldCmd = `---
description: "Scaffold EA entities from spec document frontmatter references"
---

# Scaffold EA Entities from Specs

You are an EA scaffolding agent. Your job is to create draft EA entities
for any entity refs referenced in spec documents that don't yet exist.

## User Input

$ARGUMENTS

If empty, scaffold from all docs in the project.

## Steps

### 1. Preview what would be created

\`\`\`bash
npx anchored-spec discover --from-docs --dry-run
\`\`\`

Review the output. It shows:
- **New entities**: IDs from frontmatter that don't match existing entities
- **Already exists**: IDs that are already modeled (skipped)
- **Unknown prefix**: IDs whose prefix doesn't match any EA kind

### 2. Create the draft entities

If the preview looks correct:

\`\`\`bash
npx anchored-spec discover --from-docs
\`\`\`

### 3. Enrich the drafts

For each newly created draft entity in \`${rootDir}/\`:
1. Read the draft (it will have \`status: "draft"\` and \`confidence: "inferred"\`)
2. Read the source spec document (listed in the draft's \`anchors.docs\`)
3. Fill in schema-specific fields based on the spec content:
   - Services: \`techStack\`, \`endpoints\`
   - APIs: \`protocol\`, \`basePath\`, \`operations\`
   - Schemas: \`engine\`, \`tables\`
   - Events: \`channel\`, \`payload\`
4. Update \`summary\` with an accurate description from the spec
5. Set \`confidence\` to \`"declared"\` (human-reviewed)

### 4. Sync trace links

\`\`\`bash
npx anchored-spec link-docs
\`\`\`

### 5. Validate

\`\`\`bash
npx anchored-spec validate
npx anchored-spec trace --check
\`\`\`

## Rules

- **Never overwrite existing entities** — the discovery pipeline prevents this
- **Draft entities need human review** — always enrich with schema-specific fields
- **Run link-docs after scaffolding** — this establishes bidirectional traces
- **Validate after every change** — catch schema errors early
`;

  const traceCmd = `---
description: "Check bidirectional traceability between specs and EA entities"
---

# Trace Integrity Check

You are a traceability validation agent. Your job is to check that
spec documents and EA entities are properly linked in both directions.

## User Input

$ARGUMENTS

If a specific entity ref or file path is given, trace that item.
Otherwise, run a full integrity check.

## Steps

### 1. Run the integrity check

If $ARGUMENTS is empty:
\`\`\`bash
npx anchored-spec trace --check
\`\`\`

If $ARGUMENTS is a specific target:
\`\`\`bash
npx anchored-spec trace $ARGUMENTS
\`\`\`

### 2. Analyze the results

Report:
- ✅ **Bidirectional links**: entity has traceRef → doc, doc has ea-entities → entity
- ⚠ **One-way links**: only one direction exists
- ❌ **Broken links**: traceRef points to a file that doesn't exist

### 3. Fix issues

For one-way links (most common):
\`\`\`bash
npx anchored-spec link-docs --dry-run    # preview fixes
npx anchored-spec link-docs              # apply fixes
\`\`\`

For broken links:
- Check if the file was moved/renamed
- Update the traceRef path in the entity

### 4. Show summary

\`\`\`bash
npx anchored-spec trace --summary
\`\`\`
`;

  const contextCmd = `---
description: "Assemble AI context package for an EA entity"
---

# Context Assembly

You are a context assembly agent. Your job is to gather all relevant
architectural context for an entity before starting implementation work.

## User Input

$ARGUMENTS

The entity ref to assemble context for.

## Steps

### 1. Assemble the context

\`\`\`bash
npx anchored-spec context $ARGUMENTS
\`\`\`

This outputs:
- The entity's full specification
- All traced documents (sorted by role: specification > rationale > context)
- Transitive document dependencies (from \`requires\` frontmatter)
- Related entities (from \`relations[]\`)

### 2. For token-limited contexts

\`\`\`bash
npx anchored-spec context $ARGUMENTS --max-tokens 8000
\`\`\`

### 3. Show the dependency neighborhood

\`\`\`bash
npx anchored-spec graph --focus $ARGUMENTS --depth 2 --format mermaid
npx anchored-spec impact $ARGUMENTS
\`\`\`

### 4. Present the context

Organize the output into these context blocks for the implementing agent:

| Block | Source | Purpose |
|---|---|---|
| **Feature intent** | Entity summary + spec docs | What we're building |
| **Architecture** | Relations + graph | How components connect |
| **Standards** | Compliance fields + tech standards | What rules apply |
| **Guardrails** | Version policies + drift findings | What constraints exist |
| **Current state** | Status, confidence, evidence | Where we are now |
`;

  return { manifest, scaffoldCmd, traceCmd, contextCmd };
}

// ── Writer ──────────────────────────────────────────────────────────────────────

export interface WriteOptions {
  force?: boolean;
}

export function writeAiConfigFiles(
  projectRoot: string,
  config: AiConfigInput,
  targets: string[],
  options?: WriteOptions,
): WriteResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const overwritten: string[] = [];

  const resolvedTargets = new Set(
    targets.includes("all")
      ? ["copilot", "claude", "kiro", "speckit"]
      : targets,
  );

  const filesToWrite: Array<{ rel: string; content: string }> = [];

  if (resolvedTargets.has("copilot")) {
    filesToWrite.push({
      rel: join(".github", "copilot-instructions.md"),
      content: generateCopilotInstructions(config),
    });

    const copilotPrompts = generateCopilotPrompts(config);
    for (const p of copilotPrompts) {
      filesToWrite.push({
        rel: join(".github", "prompts", `${p.name}.prompt.md`),
        content: p.content,
      });
    }
  }

  if (resolvedTargets.has("claude")) {
    filesToWrite.push({
      rel: "CLAUDE.md",
      content: generateClaudeMd(config),
    });

    const claudeCommands = generateClaudeCommands(config);
    for (const c of claudeCommands) {
      filesToWrite.push({
        rel: join(".claude", "commands", `${c.name}.md`),
        content: c.content,
      });
    }
  }

  if (resolvedTargets.has("kiro")) {
    const kiro = generateKiroSteering(config);
    const steeringDir = join(".kiro", "steering");
    filesToWrite.push(
      { rel: join(steeringDir, "product.md"), content: kiro.product },
      { rel: join(steeringDir, "tech.md"), content: kiro.tech },
      { rel: join(steeringDir, "structure.md"), content: kiro.structure },
    );

    const hooks = generateKiroHooks(config);
    const hooksDir = join(".kiro", "hooks");
    filesToWrite.push(
      { rel: join(hooksDir, "validate-entity.yml"), content: hooks.validateOnSave },
      { rel: join(hooksDir, "trace-integrity.yml"), content: hooks.traceOnSave },
      { rel: join(hooksDir, "drift-detection.yml"), content: hooks.driftOnSave },
    );
  }

  if (resolvedTargets.has("speckit")) {
    const sk = generateSpecKitExtension(config);
    const extDir = join(".specify", "extensions", "anchored-spec");
    const cmdDir = join(extDir, "commands");
    filesToWrite.push(
      { rel: join(extDir, "extension.yml"), content: sk.manifest },
      { rel: join(cmdDir, "scaffold.md"), content: sk.scaffoldCmd },
      { rel: join(cmdDir, "trace.md"), content: sk.traceCmd },
      { rel: join(cmdDir, "context.md"), content: sk.contextCmd },
    );
  }

  for (const { rel, content } of filesToWrite) {
    const abs = join(projectRoot, rel);
    if (existsSync(abs)) {
      if (options?.force) {
        writeFileSync(abs, content, "utf-8");
        overwritten.push(rel);
      } else {
        skipped.push(rel);
      }
    } else {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf-8");
      created.push(rel);
    }
  }

  return { created, skipped, overwritten };
}
