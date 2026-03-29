# Anchored Spec — AI Agent Skill

> **Purpose:** Enforce spec-driven development (SDD) workflows when working in any codebase managed by [anchored-spec](https://github.com/AnchoredSpec/anchored-spec).
>
> **Activation:** This skill activates when the project contains `.anchored-spec/config.json` or a `specs/` directory with `requirements/`, `changes/`, or `decisions/` subdirectories.
>
> **Agent compatibility:** Works with any AI coding agent (GitHub Copilot, Cursor, Cline, Windsurf, Aider, Continue, etc.). Drop this file into your project root or reference it from your agent's configuration.

---

## 1. Detection — Is This an Anchored-Spec Project?

Before applying these rules, check for the presence of:

```
.anchored-spec/config.json   ← primary indicator
specs/requirements/           ← secondary indicator
specs/workflow-policy.json    ← secondary indicator
```

If none exist, this skill does not apply. Do not suggest initializing anchored-spec unless the user explicitly asks.

---

## 2. Core Principles

### Requirements Are Behavioral — Always

Requirements describe **what** the system does, never **how**. They use [EARS notation](https://en.wikipedia.org/wiki/Easy_Approach_to_Requirements_Syntax) (Easy Approach to Requirements Syntax):

| EARS Pattern | Template | Use When |
|---|---|---|
| **Event-driven** | _When \<trigger\>, the system shall \<response\>._ | Behavior triggered by a discrete event |
| **State-driven** | _While \<state\>, the system shall \<response\>._ | Behavior during an ongoing condition |
| **Unwanted** | _If \<condition\>, then the system shall \<response\>._ | Error handling, edge cases |
| **Optional** | _Where \<feature\>, the system shall \<response\>._ | Configurable or optional behavior |
| **Complex** | _While \<state\>, when \<trigger\>, the system shall \<response\>._ | Combination of state + event |
| **Ubiquitous** | _The system shall \<response\>._ | System-wide constraints, NFRs, policies (no trigger/precondition) |

### Requirement Categories

Classify each requirement by `category`:

| Category | When to Use | Quality Rule |
|---|---|---|
| **`functional`** (default) | Observable behavior with trigger/state | Standard checks |
| **`non-functional`** | Quality attributes (performance, security, availability) | `quality:nfr-measurability` — must include measurable thresholds |
| **`policy`** | Cross-cutting system constraints | Standard checks |

```bash
anchored-spec create requirement --title "API Performance SLA" --category non-functional
anchored-spec create requirement --title "Audit Logging" --category policy
```

### The Functional/Technical Boundary

| Ask yourself | Stay functional (requirement) | Add technical detail |
|---|---|---|
| "Can I verify this by observing behavior?" | ✅ Keep it in the requirement | |
| "Does this name a specific interface, file, or route?" | | ✅ Put it in `semanticRefs` |
| "Is this an architectural choice among alternatives?" | | ✅ Put it in a decision (ADR) |
| "Could the implementation change without this statement becoming false?" | ✅ Good acceptance criterion | |

**Anti-pattern:** Writing behavior statements like "Uses `IDomainEventBus` for side effects" — that's a technical constraint masquerading as behavior. The functional version: "Side effects (webhooks, billing) fire exactly once per finalization." The technical binding (`IDomainEventBus`) goes in `semanticRefs.interfaces`.

### JSON Is the Source of Truth

All spec artifacts are JSON files validated against schemas. Markdown is always generated — never hand-edited. When making changes, always edit the JSON, then run `anchored-spec generate`.

---

## 3. Workflow Variants

Every code change must be classified into a workflow variant. Match the user's request against this table:

| User Request Pattern | Workflow Variant | Change Type | Ceremony Level |
|---|---|---|---|
| "Add feature", "new capability", "build X" | `feature-behavior-first` | `feature` | Full: requirement → decision → change → implement → verify |
| "Refactor", "redesign", "restructure" | `feature-design-first` | `refactor` | Full: design doc → requirement → change → implement → verify |
| "Fix bug", "broken", "not working" | `fix-root-cause-first` | `fix` | Medium: bugfix spec → root cause → change → implement → verify |
| "Update docs", "rename", "cleanup" | `chore` | `chore` | Light: change → implement → verify |

### When in Doubt

- If the change **affects observable behavior** → it's a `feature`, not a `chore`
- If the change **modifies an API contract** → it's a `feature` or `refactor`, not a `chore`
- If the change **adds/removes/modifies routes, error codes, or interfaces** → it's not a `chore`

---

## 4. Workflow Enforcement — Feature (Behavior First)

This is the default workflow for new features. Follow these steps **in order**:

### Step 1: Write the Requirement

```bash
anchored-spec create requirement --title "<descriptive title>"
```

Edit the created `REQ-*.json` to include:

- **`summary`** — One paragraph describing the feature in behavioral terms
- **`behaviorStatements`** — At least one EARS statement per observable behavior. Each must have:
  - `text`: Full EARS sentence
  - `trigger` or `precondition`: The When/While clause
  - `response`: The "shall" clause — what the system does
- **`priority`** — `must` / `should` / `could` / `wont` (MoSCoW)
- **`category`** — `functional` (default) / `non-functional` / `policy`
- **`owners`** — Who is responsible

**Do NOT fill in** `semanticRefs`, `verification.testRefs`, or `implementation` at this stage. Those come later.

### Step 2: Record Decisions (if applicable)

If the feature involves a choice among alternatives:

```bash
anchored-spec create decision --title "<decision title>" --domain "<domain>"
```

Fill in `context` (why needed), `rationale` (why this choice), and `alternatives` (what was rejected and why). Link to the requirement via `relatedRequirements`.

### Step 3: Create a Change Record

```bash
anchored-spec create change --title "<change title>" --type feature --scope "<glob patterns>"
```

Edit the change to:
- Set `requirements: ["REQ-N"]` linking to the requirement
- Set `branch` to the git branch name
- Optionally set `designDoc` and `implementationPlan` paths

Then update the requirement's `implementation.activeChanges` to include the change ID (bidirectional link).

### Step 4: Activate the Requirement — Add Semantic Anchors

When transitioning from `draft` → `active`, add semantic refs that bind behavioral intent to code:

```json
"semanticRefs": {
  "interfaces": ["IMyService"],
  "routes": ["POST /api/v1/resource"],
  "errorCodes": ["RESOURCE_NOT_FOUND"],
  "symbols": ["createResource", "ResourceValidator"],
  "schemas": ["UserSchema"],
  "other": {
    "events": ["user.created", "user.deleted"]
  }
}
```

Also add `traceRefs` linking to relevant documentation:

```json
"traceRefs": [
  { "path": "docs/api.md", "role": "api", "label": "REST contract" },
  { "path": "specs/decisions/ADR-N.json", "role": "decision" }
]
```

### Step 5: Advance the Change Phase

```bash
anchored-spec transition <CHG-ID> --to implementation
```

### Step 6: Implement — Then Check Drift

After writing code, verify semantic refs still match:

```bash
anchored-spec drift
```

Every `interface`, `route`, `errorCode`, `symbol`, and `schema` in `semanticRefs` must resolve to at least one source file. Fix any "missing" findings before proceeding.

### Step 7: Write Tests — Link Them to Requirements

Reference requirement IDs in test descriptions:

```typescript
describe("REQ-N: Feature title", () => {
  it("BS-1: behavior description", () => { /* ... */ });
});
```

Update the requirement's `verification` section:

```json
"verification": {
  "coverageStatus": "full",
  "testRefs": [
    { "path": "src/__tests__/feature.test.ts", "kind": "unit", "notes": "Covers happy path + validation" },
    { "path": "src/__tests__/feature.integration.test.ts", "kind": "integration" }
  ]
}
```

### Step 8: Verify Everything

```bash
anchored-spec verify
```

All checks must pass before shipping. In strict mode:

```bash
anchored-spec verify --strict
```

### Step 9: Ship

```bash
anchored-spec transition <CHG-ID> --to done
```

Update the requirement: `status: "shipped"`, `implementation.shippedBy: "<CHG-ID>"`, clear `activeChanges`.

---

## 5. Workflow Enforcement — Fix (Root Cause First)

For bug fixes, **understand before you fix**:

### Step 1: Create the Change with a Bugfix Spec

```bash
anchored-spec create change --title "Fix: <description>" --type fix
```

The change will include a `bugfixSpec` block. Fill in:

```json
"bugfixSpec": {
  "currentBehavior": "What actually happens (the bug)",
  "expectedBehavior": "What should happen (correct behavior)",
  "rootCauseHypothesis": "Why it's broken (your theory)",
  "regressionRisk": "What else might break when you fix this"
}
```

### Step 2: Write a Failing Test First

Before touching production code, write a test that reproduces the bug. Reference the requirement it violates.

### Step 3: Fix, Verify, Ship

Same as feature steps 6–9: check drift, run verify, transition to done.

---

## 6. Workflow Enforcement — Chore (Lightweight)

For changes with no behavioral impact:

```bash
anchored-spec create change --title "Chore: <description>" --type chore
```

Chores skip the full ceremony — no requirement needed, no design doc. But they still must:
- Pass `anchored-spec verify`
- Not introduce behavioral changes (if they do, escalate to a feature)

---

## 7. Lifecycle Rules

### Requirement Status Transitions

```
draft → planned → active → shipped
                         ↘ deferred
                         ↘ deprecated
```

| Transition | Gate |
|---|---|
| `planned → active` | Must have an active change record linked |
| `active → shipped` | Must have `coverageStatus` ≠ `none` |
| `* → deprecated` | Must have `statusReason` or `supersededBy` |

### Change Phase Transitions

```
design → planned → implementation → verification → done → archived
```

| Transition | Gate |
|---|---|
| `design → planned` | Requirements must be linked (non-chore) |
| `* → done` | Linked requirements must have test coverage |
| `* → done` | Verification sidecar commands should have passed |

---

## 8. Quality Rules

These rules are enforced by `anchored-spec verify`. When you see violations, fix them before proceeding:

| Rule ID | Severity | What It Checks |
|---|---|---|
| `schema:*` | error | JSON matches its schema |
| `lifecycle:active-requires-change` | error | Active requirements need a change record |
| `lifecycle:shipped-requires-coverage` | error | Shipped requirements need test coverage |
| `lifecycle:deprecated-requires-reason` | error | Deprecated requirements need a reason |
| `cross-ref:bidirectional-consistency` | warning | CHG↔REQ links must be bidirectional |
| `quality:no-vague-language` | warning | No "should work", "properly", "seamless" in behavior statements |
| `quality:semantic-refs-populated` | warning | Active/shipped requirements need semantic refs |
| `quality:missing-test-refs` | warning | Active/shipped requirements should have test references |
| `quality:test-linking` | warning | Tests mentioning REQ-* should be in testRefs |
| `quality:nfr-measurability` | warning | Non-functional requirements must include measurable thresholds |
| `dependency:missing-ref` | error | `dependsOn` targets must exist |
| `dependency:cycle` | error | No circular dependencies |

### Rule Severity Overrides

Projects can override rule severity in `.anchored-spec/config.json`:

```json
{
  "quality": {
    "rules": {
      "quality:no-vague-language": "off",
      "quality:semantic-refs-populated": "error"
    }
  }
}
```

Respect these overrides — if a rule is set to `"off"`, don't flag it. Overrides apply to both built-in and plugin findings.

### Plugins

Projects may have custom verification plugins registered in `config.plugins`. These add:

- **`checks[]`** — Pure functions that run as step 11 in the verify pipeline
- **`onVerify` hook** — Full-context hook (step 12) that receives all prior findings and can add more

Plugin rule names follow the pattern `plugin:<name>/<check-id>`. They can be overridden in `quality.rules` just like built-in rules.

### Workflow Policy Extensions

The workflow policy (`specs/workflow-policy.json`) supports an `extensions` field for project-specific metadata like routing rules, impact maps, or agent instructions. Plugins can read `policy.extensions` via `PluginContext`. Do not modify `extensions` without consulting the project's plugin documentation.

---

## 9. Command Reference (Quick)

| Task | Command |
|---|---|
| Initialize project | `anchored-spec init` |
| Create requirement | `anchored-spec create requirement --title "..."` |
| Create change | `anchored-spec create change --title "..." --type feature` |
| Create decision | `anchored-spec create decision --title "..." --domain "..."` |
| Advance change phase | `anchored-spec transition <CHG-ID> --to <phase>` |
| Check for drift | `anchored-spec drift` |
| Verify everything | `anchored-spec verify` |
| Verify (CI/JSON) | `anchored-spec verify --json` |
| Generate markdown | `anchored-spec generate` |
| Project dashboard | `anchored-spec status` |
| Check policy | `anchored-spec check --paths <file...>` |
| Continuous watch | `anchored-spec verify --watch` |

---

## 10. Before Claiming Completion

Before telling the user a task is complete, **always** run:

```bash
anchored-spec verify
```

If it fails, fix the issues. Additionally:

- After any code change touching declared `semanticRefs` → run `anchored-spec drift`
- After any requirement status change → run `anchored-spec verify`
- After creating/editing JSON specs → run `anchored-spec verify` to catch schema errors
- After all changes → run `anchored-spec generate` if generated files exist

### Structured Verification (CI-friendly)

```bash
anchored-spec verify --json
```

Parse the output — `passed: true` means all checks passed. `findings` array contains any issues with `rule`, `message`, and `suggestion` fields.

---

## 11. Common Mistakes to Prevent

### ❌ Technical language in behavior statements

```
BAD:  "The system shall use PostgreSQL for persistence"
GOOD: "The system shall persist user data across sessions"
```

### ❌ Missing bidirectional links

If CHG-X references REQ-Y, then REQ-Y's `implementation.activeChanges` must include CHG-X. Always update both sides.

### ❌ Shipping without coverage

Never set `status: "shipped"` without setting `verification.coverageStatus` to `"partial"` or `"full"` and populating `testRefs`.

### ❌ Editing generated markdown

Files in `specs/generated/` are auto-generated. Edit the JSON source, then run `anchored-spec generate`.

### ❌ Skipping the change record

Every non-trivial code change needs a change record. Use `anchored-spec check --paths <files>` to see if your changed files are governed by the workflow policy.

### ❌ Empty semantic refs on active requirements

Active and shipped requirements must have at least one semantic ref (interface, route, or symbol) to anchor the spec to code. Without anchors, drift detection can't protect against silent breakage.

---

## 12. Integration Guide

### GitHub Copilot

Add to `.github/copilot-instructions.md`:

```markdown
Read and follow the rules in SKILL.md for all code changes in this repository.
```

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

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Generic / Other Agents

Any agent that reads project-root markdown files will pick up `SKILL.md` automatically. For agents that support custom instructions, point them to this file.

---

## 13. Enterprise Architecture (EA) — Spec-as-Source

> This section activates when the project's `.anchored-spec/config.json` contains `"ea": { "enabled": true }` or the project has an `ea/` directory with YAML/JSON artifact files.

### 13.1 EA Detection

Check for EA activation:

```
.anchored-spec/config.json  →  ea.enabled: true
ea/systems/                  →  EA systems artifacts
ea/delivery/                 →  EA delivery artifacts
ea/data/                     →  EA data artifacts
ea/information/              →  EA information artifacts
ea/business/                 →  EA business artifacts
ea/transitions/              →  EA transition artifacts
```

If EA is not enabled, do not suggest EA workflows. EA workflows coexist with, and eventually subsume, the REQ/CHG/ADR workflows in Sections 2-11.

### 13.2 EA Core Principles

**Spec-as-Source (DD-1):** EA artifacts are the generative authority for architecture. Generators produce derived files (OpenAPI stubs, K8s manifests, schemas) FROM EA artifacts. Where generation is not yet possible, EA artifacts are the authoritative reference against which reality is validated via drift detection.

**Bottom-Up Adoption (DD-2):** Start by modeling what already exists (services, APIs, deployments) and work up to strategic business capabilities. Use `ea discover` to bootstrap artifacts from running systems.

**Declared > Observed > Inferred (DD-5):** Artifacts with `confidence: "declared"` are human-reviewed truth. `"observed"` artifacts come from resolvers. `"inferred"` artifacts are discovery drafts. Never treat inferred artifacts as authoritative.

### 13.3 EA Artifact Structure

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
  interfaces:
    - symbol: OrderController
      file: src/controllers/order.controller.ts
  apis:
    - route: "POST /api/v2/orders"
      file: src/routes/orders.ts
  schemas:
    - name: orders
      file: prisma/schema.prisma
relations:
  - type: dependsOn
    target: APP-inventory-service
  - type: ownedBy
    target: CAP-order-management
```

**Key rules:**
- `id` uses the format `{KIND_PREFIX}-{kebab-slug}` (e.g., `APP-order-service`, `SVC-payment-api`, `STORE-orders-db`)
- `kind` must be a registered EA kind (see Section 13.5)
- `anchors` map the artifact to actual code/config locations (same concept as `semanticRefs` in REQ artifacts)
- `relations` are stored in the canonical direction only; inverses are computed virtually

### 13.4 EA Workflow — Create

When a user asks to create a new EA artifact:

1. **Determine the kind** — Ask which domain (systems, delivery, data, information, business, transitions, legacy) and kind the artifact represents
2. **Generate the ID** — Use the appropriate prefix from the kind taxonomy (e.g., `APP-` for application, `SVC-` for service, `API-` for api-contract)
3. **Fill the base shape** — Include all required fields: `apiVersion`, `kind`, `id`, `metadata` (name, summary, owners, confidence, status)
4. **Add anchors** — If the artifact maps to code, add `anchors` with at least one anchor type (interfaces, apis, schemas, configs)
5. **Add relations** — Link to related artifacts using canonical direction relation types
6. **Place the file** — Save to `ea/{domain}/{ID}.yaml`

```bash
# Verify the artifact is valid
npx anchored-spec ea validate
```

### 13.5 EA Kind Taxonomy

44 kinds across 7 domains:

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
| **delivery** | `technology-standard` | `TECH` | An approved technology standard |
| **data** | `logical-data-model` | `LDM` | Logical data model with entity attributes |
| **data** | `physical-schema` | `SCHEMA` | Physical database schema definition |
| **data** | `data-store` | `STORE` | A data storage system |
| **data** | `lineage` | `LINEAGE` | A data lineage path |
| **data** | `master-data-domain` | `MDM` | A master data domain |
| **data** | `data-quality-rule` | `DQR` | A data quality rule |
| **data** | `data-product` | `DPROD` | A data product with SLAs |
| **information** | `information-concept` | `IC` | A high-level information concept |
| **information** | `canonical-entity` | `CE` | A canonical data entity with typed attributes |
| **information** | `information-exchange` | `EXCH` | An information exchange between systems |
| **information** | `classification` | `CLASS` | A data classification level |
| **information** | `retention-policy` | `RET` | A data retention policy |
| **information** | `glossary-term` | `TERM` | A canonical glossary term |
| **business** | `mission` | `MISSION` | A strategic mission with key results |
| **business** | `capability` | `CAP` | A business capability |
| **business** | `value-stream` | `VS` | A value stream with stages |
| **business** | `process` | `PROC` | A business process |
| **business** | `org-unit` | `ORG` | An organizational unit |
| **business** | `policy-objective` | `POL` | A policy objective |
| **business** | `business-service` | `BSVC` | A business service |
| **business** | `control` | `CTRL` | A governance control |
| **transitions** | `baseline` | `BASELINE` | A point-in-time architecture snapshot |
| **transitions** | `target` | `TARGET` | A desired future architecture state |
| **transitions** | `transition-plan` | `PLAN` | A plan from baseline to target |
| **transitions** | `migration-wave` | `WAVE` | A batch of changes in a transition |
| **transitions** | `exception` | `EXCEPT` | An approved exception to policy |
| **legacy** | `requirement` | `REQ` | Migrated behavioral requirement |
| **legacy** | `change` | `CHG` | Migrated change record |
| **legacy** | `decision` | `ADR` | Migrated architecture decision |

### 13.6 EA Workflow — Validate

When making changes to EA artifacts, always validate:

```bash
npx anchored-spec ea validate                    # All artifacts
npx anchored-spec ea validate --domain systems   # One domain
```

Validation checks:
- Schema compliance (required fields, valid kind, valid status)
- ID format matches kind prefix
- Relation targets exist
- No duplicate IDs
- Owners are non-empty for active artifacts
- Anchors reference existing files (warning if file not found)

### 13.7 EA Workflow — Drift Detection

Run drift detection to compare declared architecture with reality:

```bash
npx anchored-spec ea drift                       # All domains
npx anchored-spec ea drift --domain systems      # One domain
npx anchored-spec ea drift --severity error      # Only errors
npx anchored-spec ea drift --from-snapshot snap1 # Compare against snapshot
```

42 drift rules across 6 categories. Representative examples:

| Category | Rule | What it catches |
|---|---|---|
| systems | `ea:systems/consumer-contract-version-mismatch` | Consumer references an outdated contract version |
| systems | `ea:systems/technology-standard-violation` | System uses a non-approved technology |
| data | `ea:data/lineage-stale` | Lineage path hasn't been verified recently |
| data | `ea:data/orphan-store` | Data store not referenced by any application |
| information | `ea:information/classification-not-propagated` | Classification not applied to downstream stores |
| information | `ea:information/exchange-missing-contract` | Information exchange has no backing API or event contract |
| business | `ea:business/orphan-capability` | Capability not linked to any value stream |
| business | `ea:business/control-missing-evidence` | Governance control has no evidence attached |
| transitions | `ea:transition/baseline-stale` | Baseline snapshot is outdated |
| transitions | `ea:transition/orphan-wave` | Migration wave not linked to a transition plan |
| exception | `ea:exception/expired` | Exception past its expiry date |
| exception | `ea:exception/missing-scope` | Exception lacks a defined scope |

> 42 rules total — run `ea drift --help` for the full list.

### 13.8 EA Workflow — Discovery

Use discovery to bootstrap EA artifacts from existing systems:

```bash
npx anchored-spec ea discover --resolver openapi --source ./openapi.yaml
npx anchored-spec ea discover --resolver kubernetes --source ~/.kube/config
npx anchored-spec ea discover --resolver terraform --source ./infrastructure/
npx anchored-spec ea discover --resolver sql-ddl --source ./migrations/
npx anchored-spec ea discover --resolver dbt --source ./dbt/models/
```

Discovery rules:
- Always creates artifacts with `confidence: "inferred"` or `"observed"`
- Never overwrites existing artifacts
- Produces a discovery report showing: new artifacts found, matches to existing artifacts, suggested relations
- Human must review and promote drafts to `confidence: "declared"` before they become authoritative

### 13.9 EA Workflow — Generation

Generate derived files from EA artifacts:

```bash
npx anchored-spec ea generate                    # All generators
npx anchored-spec ea generate --type openapi     # Specific generator
npx anchored-spec ea generate --check            # Dry run — check for divergence
```

Generation rules:
- Generated files are derived outputs, not sources
- Never manually edit generated files — edit the EA artifact instead
- `ea generate --check` in CI ensures generated files stay in sync
- Generator plugins implement the `EaGenerator` interface

### 13.10 EA Relation Types

27 relation types. Use only canonical (forward) directions when declaring relations. Inverses are computed automatically.

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

### 13.11 EA Quality Rules

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

### 13.12 EA Lifecycle Rules

Status transitions follow a defined lifecycle:

```
draft → active → deprecated → retired
                ↘ sunset ↗
```

- `draft`: Initial creation; may have incomplete metadata
- `active`: Production use; full metadata required
- `deprecated`: Still running but scheduled for removal
- `sunset`: Actively being decommissioned (transition plan required)
- `retired`: No longer in service; kept for history

**Rules:**
- Moving to `active` requires: owners, summary, and at least one anchor (for anchorable kinds)
- Moving to `deprecated` requires: a linked transition plan or exception
- Moving to `retired` requires: no active `dependsOn` relations pointing to this artifact
- `sunset` is optional — teams can go directly from `deprecated` to `retired`

### 13.13 EA and REQ/CHG/ADR Coexistence

EA subsumes the legacy REQ/CHG/ADR artifact types. The `ea migrate-legacy` command converts existing artifacts to EA kinds:

- **REQ artifacts** → EA `requirement` kind (legacy domain)
- **CHG artifacts** → EA `change` kind (legacy domain)
- **ADR artifacts** → EA `decision` kind (legacy domain)

```bash
npx anchored-spec ea migrate-legacy              # Convert all REQ/CHG/ADR to EA kinds
```

Migration behavior:
- Converted artifacts are placed in `ea/legacy/` with their original IDs preserved as prefixes (`REQ`, `CHG`, `ADR`)
- Original metadata is carried forward into the EA artifact structure
- Relations to other EA artifacts are created where mappings can be inferred
- Do not create duplicate artifacts — if a REQ already covers a behavior, reference it from the EA artifact's `metadata.legacyRefs`

### 13.14 EA Command Reference

| Command | Description |
|---|---|
| `ea init` | Initialize EA directory structure |
| `ea create` | Create a new EA artifact from template |
| `ea validate` | Validate all EA artifacts against schemas and rules |
| `ea drift` | Run drift detection (supports `--from-snapshot`, `--domain`, `--severity`) |
| `ea discover` | Discover artifacts from resolvers (openapi, kubernetes, terraform, sql-ddl, dbt) |
| `ea generate` | Generate derived files from EA artifacts (OpenAPI, JSON Schema) |
| `ea graph` | Export the relation graph (Mermaid, DOT, JSON; supports `--kind`, `--focus`, `--domain`) |
| `ea impact` | Analyze transitive impact of changes to an artifact |
| `ea report` | Generate reports (system-data-matrix, classification-coverage, capability-map, gap-analysis, exceptions, drift-heatmap; supports `--domain`) |
| `ea evidence` | Manage EA evidence collection |
| `ea migrate-legacy` | Convert REQ/CHG/ADR artifacts to EA kinds |

### 13.15 EA Anti-Patterns

### ❌ Modeling everything at once

Start with 5-10 critical services. Expand outward as the team builds confidence.

### ❌ Skipping discovery for brownfield

For existing systems, always start with `ea discover` to bootstrap artifacts. Manual creation from scratch is error-prone and slow.

### ❌ Leaving artifacts at `inferred` confidence

Inferred artifacts are drafts. They don't participate in drift detection. Review and promote them to `declared` within 30 days.

### ❌ Manually editing generated files

Generated files are derived outputs. Edit the source EA artifact, then regenerate. Manual edits will be overwritten.

### ❌ Creating bidirectional relations

Only declare the canonical direction. Inverses are computed automatically. Declaring both creates duplicate edges.

### ❌ Blanket exceptions

Scope exceptions to specific artifact IDs and specific rules. Never create an exception with empty scope.

### ❌ Ignoring the transition domain

Architecture is not static. Use baselines, targets, and transition plans to manage strategic change. Without them, the EA model becomes a snapshot that drifts from reality.
