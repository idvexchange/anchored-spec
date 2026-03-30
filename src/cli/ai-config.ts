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

// ── Kiro Hooks Generator ────────────────────────────────────────────────────────

export interface KiroHooks {
  validateOnSave: string;
  enrichOnCreate: string;
  traceOnSave: string;
  driftOnSave: string;
}

export function generateKiroHooks(config: AiConfigInput): KiroHooks {
  const { rootDir } = config;

  const validateOnSave = `name: "Validate EA Artifact"
description: "Validate EA artifacts against JSON schemas when saved"
trigger: onSave
pattern: "${rootDir}/**/*.{yaml,yml,json}"
throttle: 2000
action: |
  An EA artifact file was just saved. Validate it:

  1. Run the anchored-spec validator on the saved file:
     \`\`\`bash
     npx anchored-spec validate --json
     \`\`\`
  2. If there are schema errors, report them concisely with the field path and expected type.
  3. If there are drift warnings, mention them but don't block.
  4. If everything is valid, report "✓ Artifact valid" and nothing more.

  Be concise — only report problems. A clean artifact needs no explanation.
`;

  const enrichOnCreate = `name: "Enrich New Spec Document"
description: "Auto-generate ea-artifacts frontmatter when a new markdown spec is created"
trigger: onCreate
pattern: "{docs,specs,doc,documentation}/**/*.md"
action: |
  A new markdown document was created. Help the author connect it to the EA model.

  1. Read the new file and analyze its content for architectural references:
     - Service names → SVC-{name}
     - API endpoints → API-{name}
     - Database schemas → SCHEMA-{name}
     - Business capabilities → CAP-{name}
     - Any explicit artifact IDs mentioned in the text

  2. Check which EA artifacts currently exist:
     \`\`\`bash
     npx anchored-spec status 2>/dev/null
     \`\`\`

  3. Determine the document metadata:
     - type: spec | architecture | guide | adr | runbook
     - audience: agent, developer, architect, or stakeholder
     - domain: which EA domain(s) — systems, delivery, data, information, business, transitions

  4. Add YAML frontmatter at the top of the file:
     \`\`\`yaml
     ---
     type: spec
     status: draft
     audience: developer
     domain: systems
     ea-artifacts: [SVC-auth-core, API-auth-v1]
     ---
     \`\`\`

  5. If new artifact IDs were referenced that don't exist yet, suggest:
     \`\`\`bash
     npx anchored-spec discover --from-docs
     \`\`\`

  Rules:
  - Only add artifact IDs that the document genuinely relates to
  - Use correct EA prefixes (APP, SVC, API, SCHEMA, CAP, etc.)
  - If the document is clearly non-architectural (e.g. a meeting note), skip enrichment
  - Preserve any existing frontmatter and merge new fields
`;

  const traceOnSave = `name: "Check Trace Integrity"
description: "Verify bidirectional trace links when a spec document is saved"
trigger: onSave
pattern: "{docs,specs,doc,documentation}/**/*.md"
throttle: 3000
action: |
  A spec document was saved. Check that trace links between this document and EA artifacts are intact.

  1. Run trace check:
     \`\`\`bash
     npx anchored-spec trace --check --json 2>/dev/null
     \`\`\`

  2. Report only problems:
     - ⚠ One-way links: artifact references the doc but doc doesn't list the artifact (or vice versa)
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
     - Which artifact(s) are affected
     - What the drift is (e.g. "endpoint /api/users not declared in API-users-v1")
     - Whether it's a warning or error

  3. Suggest resolution:
     - If the code is correct: "Update the artifact to match: npx anchored-spec reconcile"
     - If the spec is correct: "Revert the code change to match the spec"

  4. If no drift is detected, report nothing.
`;

  return { validateOnSave, enrichOnCreate, traceOnSave, driftOnSave };
}

// ── Spec-Kit Extension Generator ────────────────────────────────────────────────

export interface SpecKitExtension {
  manifest: string;
  enrichCmd: string;
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
  description: "Spec-as-source enterprise architecture: frontmatter enrichment, artifact scaffolding, trace validation, and AI context assembly"
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
    - name: "speckit.anchored-spec.enrich"
      file: "commands/enrich.md"
      description: "Analyze a spec and auto-generate ea-artifacts YAML frontmatter"
      aliases: ["speckit.anchored-spec.fm"]

    - name: "speckit.anchored-spec.scaffold"
      file: "commands/scaffold.md"
      description: "Scaffold EA artifacts from spec document frontmatter references"

    - name: "speckit.anchored-spec.trace"
      file: "commands/trace.md"
      description: "Check bidirectional traceability between specs and EA artifacts"

    - name: "speckit.anchored-spec.context"
      file: "commands/context.md"
      description: "Assemble AI context package for an EA artifact"

hooks:
  after_tasks:
    command: "speckit.anchored-spec.scaffold"
    optional: true
    prompt: "Scaffold EA artifacts from spec frontmatter references?"

tags:
  - "enterprise-architecture"
  - "traceability"
  - "spec-driven"
  - "frontmatter"
`;

  const enrichCmd = `---
description: "Analyze a markdown spec and auto-generate ea-artifacts YAML frontmatter"
---

# Enrich Spec with EA Frontmatter

You are an EA frontmatter enrichment agent. Your job is to analyze a spec document
and generate accurate YAML frontmatter that links it to EA artifacts.

## User Input

$ARGUMENTS

If no file is specified, operate on the currently open file.

## Steps

### 1. Understand the project's EA model

\`\`\`bash
npx anchored-spec status 2>/dev/null || echo "No artifacts yet"
npx anchored-spec trace --summary --json 2>/dev/null || echo "{}"
\`\`\`

### 2. Read the target spec document

Read the file specified in $ARGUMENTS. Analyze its content for:
- **Domain**: Which EA domain(s) does this spec relate to? (systems, delivery, data, information, business, transitions)
- **Type**: Is this a spec, architecture doc, guide, ADR, or runbook?
- **Audience**: Who is this for? (agent, developer, architect, stakeholder)
- **Artifact references**: Which EA artifact IDs are mentioned or implied?

### 3. Identify artifact IDs

Look for references to:
- Service names → \`SVC-{name}\`
- API endpoints → \`API-{name}\`
- Database tables/schemas → \`SCHEMA-{name}\` or \`STORE-{name}\`
- Events/messages → \`EVT-{name}\`
- Business capabilities → \`CAP-{name}\`
- Any explicit artifact IDs already in the text

Cross-reference against existing artifacts:
\`\`\`bash
npx anchored-spec validate --json 2>/dev/null | head -5
\`\`\`

### 4. Generate frontmatter

Add or update the YAML frontmatter at the top of the file:

\`\`\`yaml
---
type: spec          # spec | architecture | guide | adr | runbook
status: draft       # draft | current | deprecated | superseded
audience: agent, developer
domain: systems     # EA domain(s)
requires: []        # Other docs this depends on (relative paths)
ea-artifacts: [SVC-auth-core, API-auth-v1]  # EA artifact IDs
last-verified: {today's date in YYYY-MM-DD}
---
\`\`\`

### 5. Validate the result

\`\`\`bash
npx anchored-spec trace $ARGUMENTS 2>/dev/null
\`\`\`

Report which artifacts exist, which are new, and whether \`discover --from-docs\`
should be run to scaffold the new ones.

## Rules

- **Be accurate**: Only list artifact IDs that the spec genuinely relates to
- **Use correct prefixes**: SVC for services, API for APIs, SCHEMA for schemas, etc.
- **Preserve existing frontmatter**: Merge new fields with any existing frontmatter
- **Don't invent artifacts**: If unsure whether an artifact exists, list it anyway — \`trace --check\` will catch mismatches
`;

  const scaffoldCmd = `---
description: "Scaffold EA artifacts from spec document frontmatter references"
---

# Scaffold EA Artifacts from Specs

You are an EA scaffolding agent. Your job is to create draft EA artifacts
for any artifact IDs referenced in spec documents that don't yet exist.

## User Input

$ARGUMENTS

If empty, scaffold from all docs in the project.

## Steps

### 1. Preview what would be created

\`\`\`bash
npx anchored-spec discover --from-docs --dry-run
\`\`\`

Review the output. It shows:
- **New artifacts**: IDs from frontmatter that don't match existing artifacts
- **Already exists**: IDs that are already modeled (skipped)
- **Unknown prefix**: IDs whose prefix doesn't match any EA kind

### 2. Create the draft artifacts

If the preview looks correct:

\`\`\`bash
npx anchored-spec discover --from-docs
\`\`\`

### 3. Enrich the drafts

For each newly created draft artifact in \`${rootDir}/\`:
1. Read the draft (it will have \`status: "draft"\` and \`confidence: "inferred"\`)
2. Read the source spec document (listed in the draft's \`anchors.docs\`)
3. Fill in kind-specific fields based on the spec content:
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

- **Never overwrite existing artifacts** — the discovery pipeline prevents this
- **Draft artifacts need human review** — always enrich with kind-specific fields
- **Run link-docs after scaffolding** — this establishes bidirectional traces
- **Validate after every change** — catch schema errors early
`;

  const traceCmd = `---
description: "Check bidirectional traceability between specs and EA artifacts"
---

# Trace Integrity Check

You are a traceability validation agent. Your job is to check that
spec documents and EA artifacts are properly linked in both directions.

## User Input

$ARGUMENTS

If a specific artifact ID or file path is given, trace that item.
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
- ✅ **Bidirectional links**: artifact has traceRef → doc, doc has ea-artifacts → artifact
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
- Update the traceRef path in the artifact

### 4. Show summary

\`\`\`bash
npx anchored-spec trace --summary
\`\`\`
`;

  const contextCmd = `---
description: "Assemble AI context package for an EA artifact"
---

# Context Assembly

You are a context assembly agent. Your job is to gather all relevant
architectural context for an artifact before starting implementation work.

## User Input

$ARGUMENTS

The artifact ID to assemble context for.

## Steps

### 1. Assemble the context

\`\`\`bash
npx anchored-spec context $ARGUMENTS
\`\`\`

This outputs:
- The artifact's full specification
- All traced documents (sorted by role: specification > rationale > context)
- Transitive document dependencies (from \`requires\` frontmatter)
- Related artifacts (from \`relations[]\`)

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
| **Feature intent** | Artifact summary + spec docs | What we're building |
| **Architecture** | Relations + graph | How components connect |
| **Standards** | Compliance fields + tech standards | What rules apply |
| **Guardrails** | Version policies + drift findings | What constraints exist |
| **Current state** | Status, confidence, evidence | Where we are now |
`;

  return { manifest, enrichCmd, scaffoldCmd, traceCmd, contextCmd };
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
      ? ["copilot", "claude", "kiro", "speckit"]
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

    const hooks = generateKiroHooks(config);
    const hooksDir = join(".kiro", "hooks");
    filesToWrite.push(
      { rel: join(hooksDir, "validate-artifact.yml"), content: hooks.validateOnSave },
      { rel: join(hooksDir, "enrich-spec.yml"), content: hooks.enrichOnCreate },
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
      { rel: join(cmdDir, "enrich.md"), content: sk.enrichCmd },
      { rel: join(cmdDir, "scaffold.md"), content: sk.scaffoldCmd },
      { rel: join(cmdDir, "trace.md"), content: sk.traceCmd },
      { rel: join(cmdDir, "context.md"), content: sk.contextCmd },
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
