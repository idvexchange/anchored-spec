# Anchored Spec — AI Agent Skill

> **Purpose:** Enforce spec-as-source enterprise architecture workflows when working in any codebase managed by [anchored-spec](https://github.com/idvexchange/anchored-spec).
>
> **Activation:** This skill activates when the project contains `.anchored-spec/config.json` with `"schemaVersion": "1.0"` or an `ea/` directory with YAML/JSON artifact files.
>
> **Agent compatibility:** Works with any AI coding agent (GitHub Copilot, Cursor, Cline, Windsurf, Aider, Continue, etc.). Drop this file into your project root or reference it from your agent's configuration.

---

## 1. Detection — Is This an Anchored-Spec Project?

Before applying these rules, check for:

```
.anchored-spec/config.json   <- primary indicator (must have "schemaVersion": "1.0")
ea/systems/                   <- EA systems artifacts
ea/delivery/                  <- EA delivery artifacts
ea/data/                      <- EA data artifacts
```

If none exist, this skill does not apply. Do not suggest initializing anchored-spec unless the user explicitly asks.

---

## 2. Core Principles

**Spec-as-Source:** EA artifacts are the generative authority for architecture. Generators produce derived files (OpenAPI stubs, K8s manifests, schemas) FROM EA artifacts. Where generation is not yet possible, EA artifacts are the authoritative reference against which reality is validated via drift detection.

**Bottom-Up Adoption:** Start by modeling what already exists (services, APIs, deployments) and work up to strategic business capabilities. Use `discover` to bootstrap artifacts from running systems.

**Declared > Observed > Inferred:** Artifacts with `confidence: "declared"` are human-reviewed truth. `"observed"` artifacts come from resolvers. `"inferred"` artifacts are discovery drafts. Never treat inferred artifacts as authoritative.

**JSON/YAML First:** Machine-readable JSON or YAML is the source of truth. Markdown and other documentation formats are generated — never hand-edited.

---

## 3. Artifact Structure

Every EA artifact follows the unified base shape:

```yaml
# ea/systems/APP-order-service.yaml
apiVersion: anchored-spec/ea/v1
kind: application
id: APP-order-service
metadata:
  name: Order Service
  summary: Processes customer orders
  owners: ["team-commerce"]
  tags: ["core", "revenue"]
  confidence: declared
  status: active
anchors:
  symbols: ["OrderController"]
  apis: ["POST /api/v2/orders"]
  schemas: ["orders"]
  infra: []
relations:
  - type: dependsOn
    target: APP-inventory-service
  - type: ownedBy
    target: CAP-order-management
```

**Key rules:**
- `id` uses the format `{KIND_PREFIX}-{kebab-slug}` (e.g., `APP-order-service`, `SVC-payment-api`, `STORE-orders-db`)
- `kind` must be a registered EA kind (see Section 4)
- `anchors` map the artifact to actual code/config locations — each category is a flat string array (e.g., `symbols: ["ClassName"]`, `apis: ["POST /orders"]`). Valid categories: `symbols`, `apis`, `events`, `schemas`, `infra`, `catalogRefs`, `iam`, `network`, `statuses`, `transitions`, `other`
- `relations` are stored in the canonical direction only; inverses are computed virtually

---

## 4. Kind Taxonomy

48 kinds across 6 domains:

| Domain | Kind | ID Prefix | Description |
|---|---|---|---|
| **systems** | `application` | `APP` | A deployable software system |
| **systems** | `service` | `SVC` | A runtime service component |
| **systems** | `api-contract` | `API` | An API specification (REST, GraphQL, gRPC) |
| **systems** | `event-contract` | `EVT` | An async event/message contract |
| **systems** | `integration` | `INT` | A declared integration between two systems |
| **systems** | `system-interface` | `SIF` | An external system boundary interface |
| **systems** | `consumer` | `CON` | A declared consumer of an API or event |
| **delivery** | `platform` | `PLAT` | A runtime platform (K8s cluster, serverless) |
| **delivery** | `deployment` | `DEPLOY` | A deployed instance of an application |
| **delivery** | `runtime-cluster` | `CLUSTER` | A compute cluster |
| **delivery** | `network-zone` | `ZONE` | A network security zone |
| **delivery** | `identity-boundary` | `IDB` | An identity/auth boundary |
| **delivery** | `cloud-resource` | `CLOUD` | A specific cloud resource |
| **delivery** | `environment` | `ENV` | A deployment environment |
| **systems** | `security-requirement` | `SREQ` | NIST security requirement (SP 800-53 controls) |
| **delivery** | `technology-standard` | `TECH` | An approved technology standard |
| **delivery** | `technical-requirement` | `TREQ` | NIST technical requirement (infrastructure) |
| **data** | `logical-data-model` | `LDM` | Logical data model with entity attributes |
| **data** | `physical-schema` | `SCHEMA` | Physical database schema definition |
| **data** | `data-store` | `STORE` | A data storage system |
| **data** | `lineage` | `LINEAGE` | A data lineage path |
| **data** | `master-data-domain` | `MDM` | A master data domain |
| **data** | `data-quality-rule` | `DQR` | A data quality rule |
| **data** | `data-product` | `DPROD` | A data product with SLAs |
| **data** | `data-requirement` | `DREQ` | NIST data requirement (FIPS 199 categorization) |
| **information** | `information-concept` | `IC` | A high-level information concept |
| **information** | `canonical-entity` | `CE` | A canonical data entity with typed attributes |
| **information** | `information-exchange` | `EXCH` | An information exchange between systems |
| **information** | `classification` | `CLASS` | A data classification level |
| **information** | `retention-policy` | `RET` | A data retention policy |
| **information** | `glossary-term` | `TERM` | A canonical glossary term |
| **information** | `information-requirement` | `IREQ` | NIST information requirement (flow/sensitivity) |
| **business** | `mission` | `MISSION` | A strategic mission with key results |
| **business** | `capability` | `CAP` | A business capability |
| **business** | `value-stream` | `VS` | A value stream with stages |
| **business** | `process` | `PROC` | A business process |
| **business** | `org-unit` | `ORG` | An organizational unit |
| **business** | `policy-objective` | `POL` | A policy objective |
| **business** | `business-service` | `BSVC` | A business service |
| **business** | `control` | `CTRL` | A governance control |
| **business** | `requirement` | `REQ` | A behavioral requirement (EARS format) |
| **transitions** | `baseline` | `BASELINE` | A point-in-time architecture snapshot |
| **transitions** | `target` | `TARGET` | A desired future architecture state |
| **transitions** | `transition-plan` | `PLAN` | A plan from baseline to target |
| **transitions** | `migration-wave` | `WAVE` | A batch of changes in a transition |
| **transitions** | `exception` | `EXCEPT` | An approved exception to policy |
| **transitions** | `change` | `CHG` | A change record (NIST config management) |
| **transitions** | `decision` | `ADR` | An architecture decision record (NIST traceability) |

---

## 5. Workflow — Create

When a user asks to create a new EA artifact:

1. **Determine the kind** — Ask which domain and kind the artifact represents
2. **Generate the ID** — Use the appropriate prefix from the kind taxonomy
3. **Fill the base shape** — Include all required fields: `apiVersion`, `kind`, `id`, `metadata` (name, summary, owners, confidence, status)
4. **Add anchors** — If the artifact maps to code, add `anchors` with at least one anchor type
5. **Add relations** — Link to related artifacts using canonical direction relation types
6. **Place the file** — Save to `ea/{domain}/{ID}.yaml`

```bash
npx anchored-spec create --kind application --id APP-my-service
npx anchored-spec validate
```

---

## 6. Workflow — Validate

When making changes to EA artifacts, always validate:

```bash
npx anchored-spec validate                    # All artifacts
npx anchored-spec validate --domain systems   # One domain
```

Validation checks:
- Schema compliance (required fields, valid kind, valid status)
- ID format matches kind prefix
- Relation targets exist
- No duplicate IDs
- Owners are non-empty for active artifacts
- Anchors reference existing files (warning if file not found)

---

## 7. Workflow — Drift Detection

Run drift detection to compare declared architecture with reality:

```bash
npx anchored-spec drift                       # All domains
npx anchored-spec drift --domain systems      # One domain
npx anchored-spec drift --severity error      # Only errors
npx anchored-spec drift --from-snapshot snap1 # Compare against snapshot
```

52 drift rules across 8 categories. Representative examples:

| Category | Rule | What it catches |
|---|---|---|
| systems | `ea:systems/consumer-contract-version-mismatch` | Consumer references an outdated contract version |
| systems | `ea:systems/technology-standard-violation` | System uses a non-approved technology |
| data | `ea:data/lineage-stale` | Lineage path hasn't been verified recently |
| data | `ea:data/orphan-store` | Data store not referenced by any application |
| information | `ea:information/classification-not-propagated` | Classification not applied to downstream stores |
| business | `ea:business/orphan-capability` | Capability not linked to any value stream |
| business | `ea:business/control-missing-evidence` | Governance control has no evidence attached |
| transitions | `ea:transition/baseline-stale` | Baseline snapshot is outdated |
| exception | `ea:exception/expired` | Exception past its expiry date |
| docs | `ea:docs/cross-doc-contradiction` | Contradictory facts across documents |
| docs | `ea:docs/extra-entry` | Entry present in one document but missing from another |

### Doc Consistency

The `docs` virtual drift domain extracts structured facts from markdown
and checks for cross-document contradictions:

```bash
anchored-spec drift --domain docs              # Check doc consistency
anchored-spec drift --domain docs --kind events # Filter by fact kind
anchored-spec drift --domain docs --include-artifacts  # Compare with artifacts
anchored-spec reconcile --include-docs          # Add to reconcile pipeline
```

Facts are extracted from:
- Markdown tables (events, statuses, endpoints, entities, mapping tables)
- TypeScript/JSON fenced code blocks
- Mermaid state diagrams
- Heading + bullet list patterns
- YAML frontmatter

Use `@ea:events`, `@ea:states`, `@ea:mapping`, etc. annotation hints for precise classification.
Use `@ea:suppress` to mark intentional contradictions.
Use `@ea:canonical` / `@ea:derived` to classify documents as authoritative sources or derived copies.
Use `link-docs --annotate` to auto-suggest annotation comments for un-annotated fact regions.

---

## 8. Workflow — Discovery

Use discovery to bootstrap EA artifacts from existing systems:

```bash
npx anchored-spec discover --resolver openapi --source ./openapi.yaml
npx anchored-spec discover --resolver kubernetes --source ~/.kube/config
npx anchored-spec discover --resolver terraform --source ./infrastructure/
npx anchored-spec discover --resolver sql-ddl --source ./migrations/
npx anchored-spec discover --resolver dbt --source ./dbt/models/
npx anchored-spec discover --resolver tree-sitter                 # Semantic code analysis
# Discover facts from markdown documentation
npx anchored-spec discover --resolver markdown --source docs/
```

### Config-Driven Resolvers

Instead of specifying `--resolver` each time, configure resolvers in `.anchored-spec/config.json`:

```json
{
  "resolvers": [
    { "name": "openapi" },
    { "name": "markdown" },
    { "name": "tree-sitter", "options": { "queryPacks": ["javascript"] } },
    { "path": "./ea/resolvers/custom.js" }
  ]
}
```

Then run `npx anchored-spec discover` with no flags — only configured resolvers execute. Resolution order:
1. `--resolver <name>` flag → that resolver only
2. `config.resolvers[]` non-empty → configured resolvers in order
3. No config → all built-in resolvers run

Built-in resolver names: `openapi`, `kubernetes`, `terraform`, `sql-ddl`, `dbt`, `tree-sitter`, `markdown`.

Discovery rules:
- Always creates artifacts with `confidence: "inferred"` or `"observed"`
- Never overwrites existing artifacts
- Produces a discovery report showing: new artifacts found, matches, suggested relations
- Human must review and promote drafts to `confidence: "declared"` before they become authoritative

### Tree-sitter Code Analysis

The `tree-sitter` resolver uses language-agnostic AST analysis to discover artifacts directly from source code (requires `web-tree-sitter` peer dependency):

- **Routes**: Express, Fastify, Hono, Next.js API handlers → `api-contract` artifacts
- **DB access**: Prisma, TypeORM model operations → `physical-schema` artifacts
- **Events**: EventEmitter, Bull/BullMQ queue patterns → `event-contract` artifacts
- **External calls**: fetch/axios HTTP calls → `service` artifacts (inferred)

Patterns are defined as declarative Tree-sitter query packs. Custom packs can be added for any language with a Tree-sitter grammar.

---

## 9. Workflow — Generation

Generate derived files from EA artifacts:

```bash
npx anchored-spec generate                    # All generators
npx anchored-spec generate --type openapi     # Specific generator
npx anchored-spec generate --check            # Dry run — check for divergence
```

Generation rules:
- Generated files are derived outputs, not sources
- Never manually edit generated files — edit the EA artifact instead
- `generate --check` in CI ensures generated files stay in sync
- Generator plugins implement the `EaGenerator` interface

---

## 10. Workflow — Spec Diffing

Compare EA artifact states between git refs with semantic awareness:

```bash
npx anchored-spec diff main                   # Diff working tree vs main
npx anchored-spec diff --base v1.0 --head v2.0  # Diff between tags
npx anchored-spec diff main --summary         # One-line summary for CI
npx anchored-spec diff main --domain systems  # Filter to domain
npx anchored-spec diff main --json            # JSON output
```

Diff capabilities:
- Semantic field classification: identity, metadata, structural, behavioral, contractual, governance
- Relation diffing with set semantics (type+target as composite key)
- Array diffing for tags, traceRefs, anchors — set operations, not positional
- Domain-level and semantic-level summary breakdowns

---

## 11. Workflow — Compatibility Assessment

Classify changes as breaking, additive, compatible, ambiguous, or no-impact:

```bash
npx anchored-spec diff main --compat                    # Show compatibility assessment
npx anchored-spec diff main --compat --fail-on breaking # CI gate: exit 1 if breaking
npx anchored-spec diff main --compat --fail-on ambiguous # Stricter: fail on ambiguous too
```

16 built-in compatibility rules covering:
- Artifact removal (breaking if active/shipped, compatible if deprecated)
- Status regression (active→draft = breaking)
- Relation removal (breaking), relation addition (additive)
- Anchor removal (breaking), anchor addition (additive)
- Kind reclassification (breaking)
- Contractual field changes (removal = breaking, addition = additive, modification = ambiguous)
- Confidence downgrade (ambiguous)
- Metadata-only changes (no impact)

---

## 12. Workflow — Reconcile Pipeline

Run the full SDD control loop as a single command — generate → validate → drift:

```bash
npx anchored-spec reconcile                    # Full pipeline (check mode)
npx anchored-spec reconcile --write            # Generate + write + validate + drift
npx anchored-spec reconcile --fix              # Auto-fix validation issues
npx anchored-spec reconcile --fail-on warning  # Strict CI mode
npx anchored-spec reconcile --skip-generate    # Validate + drift only
npx anchored-spec reconcile --fail-fast        # Stop at first failing step
```

This is the single command for CI pipelines. It replaces running validate, generate --check, and drift separately.

---

## 13. Workflow — Version Policy Enforcement

Declare compatibility policies and enforce them automatically:

```bash
npx anchored-spec diff main --policy          # Enforce version policies
npx anchored-spec diff main --policy --json   # JSON policy report
```

Four compatibility modes:
- `backward-only` — no breaking changes allowed
- `full` — no breaking or ambiguous changes
- `breaking-allowed` — all changes allowed (default — zero disruption)
- `frozen` — no changes at all (artifact is immutable)

Policy resolution cascade: artifact-level (`extensions.versionPolicy`) → kind-level → domain-level → global default.

Configure in `.anchored-spec/config.json`:
```json
{
  "versionPolicy": {
    "defaultCompatibility": "backward-only",
    "perKind": {
      "api-contract": { "compatibility": "backward-only", "deprecationWindow": "90d" },
      "canonical-entity": { "compatibility": "full" }
    },
    "perDomain": {
      "business": { "compatibility": "breaking-allowed" }
    }
  }
}
```

---

## 14. Workflow — Explain Change (Narrative Synthesis)

When a user asks you to explain, summarize, or review architecture changes (e.g., "what changed?", "explain this PR", "walk me through the impact"), synthesize a narrative using existing commands. Do not just dump command output — tell the story.

### Step 1: Gather the raw data

Run these commands and capture their output:

```bash
npx anchored-spec diff main --compat --json   # Semantic diff + compatibility
npx anchored-spec diff main --summary          # One-line summary
```

For each artifact with breaking or ambiguous changes, also run:

```bash
npx anchored-spec impact <artifact-id>         # Transitive dependency graph
npx anchored-spec graph --focus <artifact-id> --format mermaid  # Visual context
```

### Step 2: Synthesize into three narrative layers

**Layer 1 — Executive Summary (2-3 sentences)**
What changed at a high level. Use the `--summary` output as a starting point but rewrite it in natural language. Include the compatibility verdict.

Example: *"This PR adds a new payment gateway service and modifies the order entity's data contract. The changes are additive — no breaking impact on existing consumers. Two new `dependsOn` relations connect the gateway to the auth and billing services."*

**Layer 2 — Structural Walkthrough (per-artifact)**
For each modified artifact, explain:
- **What** changed (field-level, using semantic categories)
- **Why** it matters (is it contractual? structural? just metadata?)
- **Who** is affected (use `impact` output to name downstream dependents)

Group by risk level: breaking first, then ambiguous, then additive, then metadata-only.

**Layer 3 — Recommendations**
Based on the compatibility assessment and impact analysis:
- Flag artifacts that need version policy review
- Suggest migration steps for breaking changes
- Identify artifacts whose status should transition (e.g., a new artifact still at `draft` that should be `planned`)
- Note if any changed artifacts lack owners, anchors, or traceRefs

### Step 3: Offer interactive drill-down

After presenting the narrative, offer the user targeted follow-ups:
- "Want me to show the full dependency graph for [artifact]?"
- "Should I check if [breaking change] is covered by version policy?"
- "Want me to trace which source files are anchored to the modified artifacts?"

### When to use this workflow

- User asks "what changed?" or "explain this diff" or "summarize the PR"
- User asks "what's the impact of these changes?"
- User asks "is this safe to merge?"
- User asks for a change review or architecture review
- Before claiming a task is complete, if the changes span multiple artifacts or domains

### Example output

```
## Change Narrative: feat/payment-gateway → main

### Summary
3 artifacts modified, 1 added. Overall compatibility: **additive** (safe to merge).

### New: SVC-payment-gateway (service, systems)
A new payment gateway service connecting to Stripe. Depends on SVC-auth
for token validation and CE-billing-account for account lookup.
- Status: draft (promote to planned when approved)
- Missing: no anchors yet — add source file anchors after implementation

### Modified: CE-order (canonical-entity, data)
Added `paymentGatewayRef` field to the entity contract.
- Semantic: contractual (new field = additive, no breakage)
- Impact: 4 downstream consumers (APP-checkout, APP-admin, RPT-orders, API-orders)
  All consume order data — the new field is additive, no action needed.

### Modified: API-orders (api-contract, systems)
Added `GET /orders/{id}/payment-status` endpoint to anchors.
- Semantic: structural (anchor addition = additive)
- No downstream impact — this is a leaf endpoint.

### Recommendations
- Promote SVC-payment-gateway from draft → planned once this PR is approved
- Add source anchors to SVC-payment-gateway after implementation lands
- Consider adding a traceRef to the payment integration spec document
```

---

## 15. Workflow — Spec-First Implementation

When a user asks to build a feature, add a capability, or implement a change, follow the spec-first workflow. Do not write implementation code until the spec artifacts exist and validate.

### Step 1: Spec before code

1. **Identify affected artifacts** — Which EA artifacts describe the feature? Do they exist already?
2. **Create missing artifacts** — Use `anchored-spec create` for any new services, entities, contracts, or capabilities. Fill all required fields: summary, owners, status, relations.
3. **Update existing artifacts** — Modify relations, anchors, or contractual fields on artifacts affected by the change.
4. **Validate** — Run `npx anchored-spec validate` to ensure the spec is structurally sound.

### Step 2: Implement against the spec

5. **Write code** — Implement the feature as described by the artifacts. Code should match the declared anchors, relations, and contractual fields.
6. **Anchor the code** — Add file/API/event anchors to artifacts pointing to the new code.

### Step 3: Verify alignment

7. **Drift check** — Run `npx anchored-spec drift` to verify implementation matches spec.
8. **Reconcile** — Run `npx anchored-spec reconcile` for full pipeline verification.

### Why this order matters

Writing code first and documenting later creates two problems:
- The spec reflects what was built, not what was intended — losing the "why"
- AI agents implementing subsequent features will reason from an incomplete spec, amplifying ambiguity

Spec-first ensures the intent is captured precisely before any implementation begins. This is the core principle of Spec-Driven Development.

### When to apply

- Always, when the change involves creating or modifying architecture (new services, APIs, entities, contracts)
- For pure bug fixes in existing code that don't change architecture, skip to Step 2

---

## 16. Workflow — Pre-Implementation Spec Audit

Before writing any implementation code, audit whether the relevant specs are complete enough to guide the work. Incomplete specs produce ambiguous implementations.

### Run the audit

```bash
npx anchored-spec validate --strict
npx anchored-spec graph --focus <artifact-id> --format mermaid
```

### Checklist

For each artifact relevant to the task, verify:

| Check | Command / Field | Why |
|---|---|---|
| Has a meaningful summary (not placeholder) | `summary` field | Agents use summaries to understand intent |
| Has at least one owner | `owners` field | Ownership = accountability |
| Has relations to dependencies | `relations` array | Isolated artifacts can't constrain the solution space |
| Has anchors to code (if active) | `anchors` object | No anchors = no drift detection = no confidence |
| Has traceRefs to normative docs | `traceRefs` array | Traceability to requirements/decisions |
| Status matches reality | `status` field | A "draft" spec guiding production code is a red flag |
| Confidence is declared (not inferred) | `confidence` field | Inferred artifacts are provisional — don't build on them |

### If the audit fails

Do not proceed to implementation. Instead:
1. Fix the spec gaps (add missing owners, relations, summaries)
2. Promote inferred artifacts to declared if they're accurate
3. Re-validate, then continue to implementation

### Example

```
⚠ Spec audit for task "Add payment gateway":

  SVC-payment-gateway — MISSING (needs creation)
  API-orders — incomplete:
    → No anchors (can't verify implementation matches spec)
    → Summary is "TODO" (agents will guess intent)
  CE-billing-account — OK ✓
  CE-order — OK ✓

Action: Create SVC-payment-gateway, fix API-orders before coding.
```

---

## 17. Workflow — Context Assembly

Before starting any task, assemble the relevant architectural context from EA artifacts. This is structured context engineering — not ad-hoc prompt context.

### Step 1: Identify the context perimeter

Determine which artifacts are relevant to the task:

```bash
# Find artifacts in the affected domain
npx anchored-spec report --view system-data-matrix --domain systems

# Trace dependencies from the focal artifact
npx anchored-spec impact <artifact-id>

# Visualize the local neighborhood
npx anchored-spec graph --focus <artifact-id> --depth 2 --format mermaid
```

### Step 2: Assemble context blocks

For each relevant artifact, gather these structured context blocks:

| Block | Source | Purpose |
|---|---|---|
| **Feature intent** | Artifact `summary` + `traceRefs` to spec docs | What we're building and why |
| **Architecture** | `relations` + `graph --focus` output | How components connect |
| **Standards** | `compliance` field + linked `standard` artifacts | What rules apply |
| **Guardrails** | Version policies + quality rules + active exceptions | What constraints exist |
| **Current state** | `status`, `confidence`, `drift` findings | Where we are now |

### Step 3: Use context in prompts

When delegating to sub-agents or continuing implementation:

```
Implement Feature X strictly according to:
- SVC-payment-gateway (artifact): handles Stripe integration
- Depends on: SVC-auth (token validation), CE-billing-account (account lookup)
- Contract: API-orders exposes GET /orders/{id}/payment-status
- Constraint: API-orders has backward-only version policy — no breaking changes
- Standard: Must comply with PCI-DSS (linked via STD-pci-compliance)
```

This eliminates ambiguity by giving the agent the exact architectural context, not vague instructions.

### Shortcut: `context` command

For the fastest path to structured context:

```bash
# Assemble full context for an artifact (traced docs + relations + transitive requires)
npx anchored-spec context SVC-payment-gateway

# Limit to a token budget for LLM context windows
npx anchored-spec context SVC-payment-gateway --max-tokens 8000

# Follow relations deeper (default depth: 1)
npx anchored-spec context SVC-payment-gateway --depth 2

# Get JSON for programmatic use
npx anchored-spec context SVC-payment-gateway --json
```

The `context` command follows the trace graph automatically: artifact → `traceRefs` docs → frontmatter `requires` → related artifacts. It prioritizes documents by role (`specification` > `rationale` > `context` > `evidence`) and respects token budgets.

---

## 18. Workflow — Document Traceability

Link narrative documentation (markdown) to EA artifacts with bidirectional trace links. This bridges human-readable specs and machine-validated architecture.

### Frontmatter convention

Add YAML frontmatter to markdown documents:

```yaml
---
type: spec
status: current
audience: agent, developer
domain: systems
requires: [api-conventions.md]
ea-artifacts: [SVC-auth-core, API-auth-v1, SREQ-auth-pkce]
tokens: 1200
last-verified: 2025-07-18
---
```

The `ea-artifacts` field lists EA artifact IDs this document relates to. The framework also accepts `anchored-spec` as an alternative field name.

### Check trace integrity

```bash
# Show trace summary
npx anchored-spec trace --summary

# Full bidirectional integrity check
npx anchored-spec trace --check

# Inspect a specific artifact's trace web
npx anchored-spec trace SVC-auth-core

# Inspect a specific document's artifact links
npx anchored-spec trace docs/security/auth-contracts.md

# Find docs with frontmatter refs but no traceRef back
npx anchored-spec trace --orphans
```

### Auto-sync trace links

```bash
# Preview what would change
npx anchored-spec link-docs --dry-run

# Add missing traceRefs to artifacts (from doc frontmatter)
npx anchored-spec link-docs

# Also update doc frontmatter from artifact traceRefs
npx anchored-spec link-docs --bidirectional
```

### Create pre-linked documents

```bash
# Create a spec doc linked to artifacts
npx anchored-spec create-doc --title "Auth Contracts" --type spec \
  --artifacts API-auth-v1 SVC-auth-core SREQ-auth-pkce

# Create an ADR with rationale role
npx anchored-spec create-doc --title "ADR-01 Auth Strategy" --type adr \
  --artifacts DECISION-auth-strategy --dir docs/decisions
```

### Prose-first workflow (doc-driven discovery)

Write docs first, then scaffold the artifacts they reference:

```bash
# 1. Write your spec docs with ea-artifacts listing desired artifact IDs
#    (the artifacts don't need to exist yet)

# 2. Discover and scaffold missing artifacts from doc frontmatter
npx anchored-spec discover --from-docs --dry-run   # preview
npx anchored-spec discover --from-docs              # create drafts

# 3. Refine the generated drafts (fill in kind-specific fields)
# 4. Sync bidirectional trace links
npx anchored-spec link-docs
```

The `--from-docs` flag parses each doc's `ea-artifacts` field, identifies IDs that don't match existing artifacts, infers the kind from the ID prefix (e.g., `SVC-` → service), and scaffolds draft artifacts. This eliminates the chicken-and-egg problem.

### When to use

- **Prose-first**: Write docs → `discover --from-docs` → refine → `link-docs`
- **Artifact-first**: Create artifact → add `traceRefs` → write docs → `link-docs`
- **Before starting work**: Run `context <artifact-id>` to assemble full AI context
- **After writing docs**: Run `link-docs` to sync trace links
- **In CI**: Run `trace --check` to catch broken or orphaned links
- **During onboarding**: Use `trace <artifact-id>` to understand documentation coverage

---

## 19. Workflow — Architecture Onboarding

When starting a new AI session, onboarding a new team member, or re-engaging with an unfamiliar part of the codebase, use this workflow to rapidly build system understanding.

### Quick orientation (< 2 minutes)

```bash
# What does this project contain?
npx anchored-spec validate --json | head -5       # Artifact count and health

# What are the key systems?
npx anchored-spec report --view capability-map     # Business capabilities

# What's the dependency structure?
npx anchored-spec graph --format mermaid           # Full architecture graph

# What's at risk?
npx anchored-spec report --view exceptions         # Active exceptions
npx anchored-spec report --view drift-heatmap      # Drift hotspots
```

### Deep dive into a domain

```bash
# Focus on a specific domain
npx anchored-spec graph --domain systems --format mermaid
npx anchored-spec report --view system-data-matrix

# Understand a specific artifact's context
npx anchored-spec impact <artifact-id>
npx anchored-spec graph --focus <artifact-id> --depth 3
```

### What to look for

- **High-risk artifacts**: status=active but confidence=inferred — these are guesses in production
- **Drift hotspots**: artifacts with chronic drift findings — spec and reality have diverged
- **Orphan artifacts**: no relations to anything — possibly stale or missing connections
- **Stale exceptions**: expired exceptions that haven't been resolved
- **Missing anchors**: active artifacts with no code anchors — invisible to drift detection

### When to use

- Starting a new coding session on an unfamiliar part of the system
- Before making cross-domain changes
- When an AI agent asks "how does this system work?"
- During architecture review meetings

---

## 20. Workflow — Confidence Audit

Periodically assess the health of the EA model to identify where confidence is eroding. This catches the slow decay that leads to the gap between what's in production and what the team understands.

### Run the audit

```bash
npx anchored-spec validate --strict --json
npx anchored-spec drift --json
npx anchored-spec report --view exceptions
npx anchored-spec report --view drift-heatmap
```

### Confidence indicators

Check each category and flag issues:

| Indicator | How to check | Red flag |
|---|---|---|
| **Inferred artifacts** | `confidence: "inferred"` artifacts | Active systems described by guesses, not declarations |
| **Missing owners** | `validate` rule `ea:active-needs-owner` | Nobody accountable for the artifact |
| **Stale exceptions** | `report --view exceptions` | Expired exceptions still suppressing real drift |
| **Anchor coverage** | Active artifacts without `anchors` | No drift detection = silent divergence |
| **Relation completeness** | Artifacts with 0 relations | Isolated artifacts can't model dependencies |
| **Draft sprawl** | Many `draft` artifacts never promoted | Discovery ran but nobody curated the results |
| **Drift density** | `report --view drift-heatmap` | Domains with chronic unsuppressed drift |

### Triage actions

| Priority | Condition | Action |
|---|---|---|
| **P0** | Active + inferred + no anchor | Promote to declared or delete — this is a blind spot |
| **P1** | Expired exception still active | Review and either renew, fix the drift, or retire the artifact |
| **P1** | Active artifact, chronic drift | Spec is wrong or code is wrong — investigate and align |
| **P2** | Draft artifacts older than 30 days | Promote, delete, or mark deferred — don't let drafts accumulate |
| **P2** | Active artifact, no relations | Add relations or verify it's truly standalone |
| **P3** | Missing traceRefs | Add links to normative docs for audit trail |

### When to run

- Weekly for teams actively building (high rate of change)
- Before major releases or compliance reviews
- When onboarding reveals "nobody knows what this does"
- After a production incident to check if the EA model predicted the failure path

---

## 21. Relation Types

28 relation types. Use only canonical (forward) directions when declaring relations. Inverses are computed automatically.

| Canonical | Inverse (Virtual) |
|---|---|
| `realizes` | `realizedBy` |
| `uses` | `usedBy` |
| `exposes` | `exposedBy` |
| `consumes` | `consumedBy` |
| `dependsOn` | `dependedOnBy` |
| `deploys` | `deployedBy` |
| `runsOn` | `runs` |
| `boundedBy` | `bounds` |
| `authenticatedBy` | `authenticates` |
| `deployedTo` | `hosts` |
| `interfacesWith` | `interfacedBy` |
| `standardizes` | `standardizedBy` |
| `providedBy` | `provides` |
| `stores` | `storedIn` |
| `hostedOn` | `hostsData` |
| `lineageFrom` | `lineageTo` |
| `implementedBy` | `implements` |
| `classifiedAs` | `classifies` |
| `exchangedVia` | `exchanges` |
| `retainedUnder` | `retains` |
| `supports` | `supportedBy` |
| `performedBy` | `performs` |
| `governedBy` | `governs` |
| `owns` | `ownedBy` |
| `supersedes` | `supersededBy` |
| `generates` | `generatedBy` |
| `mitigates` | `mitigatedBy` |
| `targets` | `targetedBy` |

---

## 22. Quality Rules

When creating or modifying EA artifacts, enforce these rules:

| Rule | Severity | Condition |
|---|---|---|
| `ea:active-needs-owner` | error | Active artifacts must have at least one owner |
| `ea:active-needs-anchor` | warning | Active systems/delivery/data artifacts should have at least one anchor |
| `ea:id-format` | error | ID must match `{PREFIX}-{kebab-slug}` for its kind |
| `ea:relation-target-exists` | error | Relation targets must reference existing artifact IDs |
| `ea:no-self-relation` | error | An artifact cannot relate to itself |
| `ea:confidence-promotion` | warning | Inferred artifacts should be promoted or deleted within 30 days |
| `ea:exception-expiry` | warning | Exception artifacts past their expiry date |
| `ea:generated-file-modified` | warning | Generated files should not be manually edited |

---

## 23. Lifecycle Rules

Status transitions follow a defined lifecycle:

```
draft -> planned -> active -> shipped -> deprecated -> retired
                                       \-> deferred
```

Valid statuses: `draft`, `planned`, `active`, `shipped`, `deprecated`, `retired`, `deferred`

- `draft`: Initial creation; may have incomplete metadata
- `planned`: Approved but not yet implemented
- `active`: Production use; full metadata required
- `shipped`: Delivered and verified
- `deprecated`: Still running but scheduled for removal
- `retired`: No longer in service; kept for history
- `deferred`: Postponed to a future iteration

**Rules:**
- Moving to `active` requires: owners, summary, and at least one anchor (for anchorable kinds)
- Moving to `deprecated` requires: a linked transition plan or exception
- Moving to `retired` requires: no active `dependsOn` relations pointing to this artifact

---

## 24. Command Reference

| Command | Description |
|---|---|
| `init` | Initialize project with v1.0 config (`--ide` for VS Code, `--ai <targets>` for AI configs, `--ci` for CI workflow + pre-commit hook). `--force` overwrites existing files. Copilot/Claude targets include 6 reusable prompt commands; Kiro includes 4 event-driven hooks; Spec-Kit includes extension with 4 AI commands |
| `create` | Create a new EA artifact from template. `--interactive` / `-i` launches a step-by-step wizard (domain → kind → title → owner → relations). Without `-i`, `[kind]` and `--title` are required as before |
| `validate` | Validate all EA artifacts against schemas and rules |
| `verify` | Run all validation + drift + quality checks (comprehensive) |
| `drift` | Run drift detection (supports `--from-snapshot`, `--domain`, `--severity`) |
| `discover` | Discover artifacts from resolvers (openapi, kubernetes, terraform, sql-ddl, dbt, tree-sitter, markdown) |
| `generate` | Generate derived files from EA artifacts (OpenAPI, JSON Schema) |
| `graph` | Export the relation graph (Mermaid, DOT, JSON; supports `--kind`, `--focus`, `--domain`) |
| `impact` | Analyze transitive impact of changes to an artifact |
| `report` | Generate reports (system-data-matrix, capability-map, gap-analysis, exceptions, drift-heatmap, traceability-index) |
| `evidence` | Manage EA evidence collection |
| `status` | Show artifact lifecycle status dashboard |
| `transition` | Manage artifact status transitions |
| `diff` | Semantic diff of EA artifacts between git refs (`--compat`, `--policy`, `--fail-on`) |
| `reconcile` | Full SDD pipeline: generate → validate → drift (`--write`, `--fix`, `--fail-fast`) |
| `trace` | Show traceability web between artifacts and docs (`--check`, `--orphans`, `--summary`) |
| `link-docs` | Auto-sync trace links: doc frontmatter ↔ artifact traceRefs (`--dry-run`, `--bidirectional`) |
| `context` | Assemble AI context package for an artifact (`--max-tokens`, `--depth`) |
| `create-doc` | Create markdown doc pre-linked to artifacts (`--type`, `--artifacts`, `--link-back`) |
| `move` | Move/reclassify an artifact to a different kind with reference rewrites |
| `enrich` | Merge fields from a JSON file into an existing artifact |
| `link` | Create a relation between two artifacts (`link <from> <to> --type <relation-type>`, `--description`, `--dry-run`, `--root-dir`). Supports YAML and JSON; detects duplicates |
| `search` | Full-text search across artifacts (`search <query>`, `--kind`, `--domain`, `--status`, `--tag`, `--confidence`, `--json`). Searches ID, name, kind, summary, and tags |
| `create-batch` | Bulk-create artifacts from a JSON manifest |

---

## 25. Before Claiming Completion

Before telling the user a task is complete, **always** run:

```bash
npx anchored-spec validate
```

If it fails, fix the issues. Additionally:

- After any code change touching declared `anchors` -> run `npx anchored-spec drift`
- After creating/editing artifact files -> run `npx anchored-spec validate`
- After all changes -> run `npx anchored-spec generate --check` if generators are configured
- For comprehensive CI check -> run `npx anchored-spec reconcile` (runs generate + validate + drift)
- Before merging to main -> run `npx anchored-spec diff main --compat` to assess breaking changes

---

## 26. Anti-Patterns

### Do not model everything at once

Start with 5-10 critical services. Expand outward as the team builds confidence.

### Do not skip discovery for brownfield

For existing systems, always start with `discover` to bootstrap artifacts. Manual creation from scratch is error-prone and slow.

### Do not leave artifacts at `inferred` confidence

Inferred artifacts are drafts. They do not participate in drift detection. Review and promote them to `declared` within 30 days.

### Do not manually edit generated files

Generated files are derived outputs. Edit the source EA artifact, then regenerate. Manual edits will be overwritten.

### Do not create bidirectional relations

Only declare the canonical direction. Inverses are computed automatically. Declaring both creates duplicate edges.

### Do not use blanket exceptions

Scope exceptions to specific artifact IDs and specific rules. Never create an exception with empty scope.

### Do not ignore the transition domain

Architecture is not static. Use baselines, targets, and transition plans to manage strategic change. Without them, the EA model becomes a snapshot that drifts from reality.

---

## 27. Integration Guide

### Quick Prompts — Copy-Paste Workflow Triggers

These prompts work with **any** AI agent. Copy-paste them into your chat, or generate them as slash commands with `init --ai copilot` or `init --ai claude`.

| When you… | Say this to your agent |
|---|---|
| Create a new spec doc | "Enrich this doc with EA frontmatter — identify artifact references and add `ea-artifacts` to the YAML frontmatter" |
| Want artifacts from docs | "Run `npx anchored-spec discover --from-docs --dry-run` and scaffold any missing artifacts" |
| Finish editing a spec | "Check trace integrity: `npx anchored-spec trace --check` and fix any one-way links with `link-docs`" |
| Start implementation | "Assemble context for `SVC-auth-core`: run `npx anchored-spec context SVC-auth-core`" |
| Change implementation code | "Check for EA drift: `npx anchored-spec drift` and report any spec violations" |
| Before marking done | "Run a spec audit: `npx anchored-spec validate && npx anchored-spec drift && npx anchored-spec trace --check`" |

**Generated slash commands** (available after `init --ai`):

| Agent | Commands directory | Invocation |
|---|---|---|
| **GitHub Copilot** | `.github/prompts/ea-*.prompt.md` | Type `/ea-enrich`, `/ea-scaffold`, `/ea-trace`, `/ea-context`, `/ea-drift`, `/ea-audit` in Copilot Chat |
| **Claude Code** | `.claude/commands/ea-*.md` | Type `/ea-enrich`, `/ea-scaffold`, `/ea-trace`, `/ea-context`, `/ea-drift`, `/ea-audit` in Claude |
| **Kiro** | `.kiro/hooks/*.yml` | Automatic — hooks fire on save/create events |
| **Spec-Kit** | `.specify/extensions/anchored-spec/` | `speckit.anchored-spec.enrich`, `.scaffold`, `.trace`, `.context` |

### GitHub Copilot

Generate with `npx anchored-spec init --ai copilot`. This creates:
- `.github/copilot-instructions.md` — Project context
- `.github/prompts/ea-*.prompt.md` — 6 reusable slash commands (`/ea-enrich`, `/ea-scaffold`, `/ea-trace`, `/ea-context`, `/ea-drift`, `/ea-audit`)

### Cursor

Add to `.cursorrules`:

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Cline / Roo Code

Reference in `.clinerules`:

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Windsurf

Reference in `.windsurfrules`:

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Claude Code (CLAUDE.md)

Generate with `npx anchored-spec init --ai claude`. This creates:
- `CLAUDE.md` — Project context
- `.claude/commands/ea-*.md` — 6 slash commands (`/ea-enrich`, `/ea-scaffold`, `/ea-trace`, `/ea-context`, `/ea-drift`, `/ea-audit`)

### Kiro IDE

Generate with `npx anchored-spec init --ai kiro`. This creates 3 steering files in `.kiro/steering/` plus 4 event-driven hooks in `.kiro/hooks/`:

**Steering files** (always generated):

| File | Purpose |
|---|---|
| `product.md` | Product context for the EA framework |
| `structure.md` | Repository structure guide |
| `tech.md` | Technology stack and constraints |

**Event-driven hooks** (always generated):

| File | Trigger | Purpose |
|---|---|---|
| `validate-artifact.yml` | `onSave` on `ea/**/*.{yaml,yml,json}` | Validate artifacts against JSON schemas |
| `enrich-spec.yml` | `onCreate` on `{docs,specs}/**/*.md` | Auto-generate `ea-artifacts` frontmatter for new docs |
| `trace-integrity.yml` | `onSave` on `{docs,specs}/**/*.md` | Check bidirectional trace links |
| `drift-detection.yml` | `onSave` on `src/**/*.{ts,js,...}` | Detect drift when implementation changes |

### Spec-Kit Extension

Generate the extension with `npx anchored-spec init --ai speckit`. This creates `.specify/extensions/anchored-spec/` containing:

| File | Purpose |
|---|---|
| `extension.yml` | Manifest declaring 4 commands and an `after_tasks` hook |
| `commands/enrich.md` | AI command: analyze a spec and auto-generate `ea-artifacts` YAML frontmatter |
| `commands/scaffold.md` | AI command: run `discover --from-docs` to scaffold EA artifacts from spec references |
| `commands/trace.md` | AI command: check bidirectional trace integrity between docs and artifacts |
| `commands/context.md` | AI command: assemble an AI context package for an artifact |

The `after_tasks` hook in `extension.yml` runs `npx anchored-spec validate` automatically after task completion, ensuring artifacts stay valid.

### CI / Pre-commit

Generate with `npx anchored-spec init --ci`. This creates:

| File | Purpose |
|---|---|
| `.github/workflows/ea-validation.yml` | GitHub Action that runs `validate --strict`, `trace --check`, `drift`, and semantic `diff` on every PR |
| `.anchored-spec/hooks/pre-commit` | Shell script that validates EA artifacts and checks trace integrity before commits |

Use `--force` to overwrite existing files. Pair with `init --ai` to get both CI enforcement and developer-facing slash commands.

### SchemaStore (Any Editor)

The repository includes `schemastore-catalog.json` with 3 catalog entries (config, workflow-policy, EA artifacts) referencing raw GitHub URLs for the JSON schema files. Once merged into [SchemaStore](https://github.com/SchemaStore/schemastore), any editor that supports SchemaStore (VS Code, IntelliJ, Sublime Text, Vim/Neovim with coc.nvim, etc.) will automatically validate anchored-spec files — no `init --ide` needed.

### Generic / Other Agents

Any agent that reads project-root markdown files will pick up `SKILL.md` automatically. For agents that support custom instructions, point them to this file.
