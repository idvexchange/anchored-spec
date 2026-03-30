# EA Adoption Playbook

This is a practical guide for teams adopting the enterprise architecture extension in a brownfield monorepo. It assumes you have existing services running in production and want to start modeling them without stopping delivery.

## Before You Start

**You need:**
- `anchored-spec` installed as a dev dependency (all phases are fully implemented — all 44 kinds, drift detection, discovery, reporting, and transitions are available)
- A monorepo with at least a few services you want to model

**You do NOT need:**
- All NIST layers modeled before you get value
- Perfect knowledge of your architecture
- Everyone on the team trained upfront

## First 30 Minutes: Bootstrap

### Step 1: Initialize EA (2 min)

```bash
npx anchored-spec init --ide --ai all
```

This creates the EA directory structure, config, VS Code integration (autocomplete + snippets), and AI assistant configs (Copilot, Claude, Kiro).

### Step 2: Discover What You Have (10 min)

If you have OpenAPI specs, K8s manifests, or Terraform state:

```bash
# Discover from OpenAPI specs in the repo
npx anchored-spec discover --resolver openapi --dry-run

# Discover from Kubernetes manifests
npx anchored-spec discover --resolver kubernetes --dry-run

# Discover from Terraform state
npx anchored-spec discover --resolver terraform --from-snapshot terraform.tfstate.json --dry-run

# Discover from source code patterns (requires web-tree-sitter)
npx anchored-spec discover --resolver tree-sitter --dry-run
```

Or configure resolvers in `.anchored-spec/config.json` and run them all at once:

```json
{
  "resolvers": [
    { "name": "openapi" },
    { "name": "tree-sitter", "options": { "queryPacks": ["javascript"] } }
  ]
}
```

```bash
# Runs all configured resolvers
npx anchored-spec discover --dry-run
```

Review the dry-run output. If it looks reasonable:

```bash
npx anchored-spec discover
```

This creates draft artifacts in `specs/ea/`. They'll have `status: "draft"` and `confidence: "inferred"` or `"observed"`.

### Step 3: Pick Your First 3 Artifacts (15 min)

Don't try to model everything. Pick **one service you know well** and model:

1. The application itself
2. Its primary API
3. Its primary deployment

```bash
npx anchored-spec create application --title "Order Service"
npx anchored-spec create api-contract --title "Orders API"
npx anchored-spec create deployment --title "Order Service Prod"
```

Edit each JSON file to fill in:
- `summary` — one sentence describing what it is
- `owners` — your team name
- `status` — set to `active` (or leave as `draft` if unsure)
- `confidence` — set to `declared`
- `relations` — connect them:
  - Application `exposes` API contract
  - Deployment `deploys` application
- `anchors` — add at least one:
  - Application: `symbols: ["OrderService"]` or `catalogRefs: ["service:order-service"]`
  - API: `apis: ["POST /orders", "GET /orders/:id"]`
  - Deployment: `infra: ["kubernetes:deployment/order-service"]`

### Step 4: Validate (3 min)

```bash
npx anchored-spec validate
```

Fix any errors. Warnings are OK for now.

```bash
npx anchored-spec graph --format mermaid
```

You should see a small connected graph. Copy-paste the Mermaid output into a markdown file or Mermaid live editor to visualize.

**Congratulations — you have a governed architecture model.**

## First Week: Build Out Systems Layer

### Day 1-2: Model Your Core Services

For each service your team owns, create an `application` artifact and its primary `api-contract` or `event-contract`. Connect them with `exposes` relations.

A good target is 5-10 applications with their APIs. Don't model internal implementation details — model the system boundary.

### Day 3: Add Deployments and Platform

Model where things run:

```bash
npx anchored-spec create platform --title "Production Kubernetes"
npx anchored-spec create deployment --title "Order Service Prod"
```

Connect with `deployedTo` and `runsOn` relations.

### Day 4: Add Integrations

For every service-to-service call, create an `integration` artifact:

```bash
npx anchored-spec create integration --title "Order to Payment"
```

Or model it via `uses` relations between applications. Either pattern works — integrations are for cases where the connection itself has governance metadata (SLA, criticality, etc.).

### Day 5: Add to CI

Add validation to your CI pipeline (see [ea-ci-integration.md](./ea-ci-integration.md)):

```yaml
- run: npx anchored-spec validate --strict
```

This prevents invalid EA artifacts from being merged.

### End of Week 1 Checkpoint

You should have:
- [ ] 5-15 artifacts across `systems/` and `delivery/`
- [ ] Relations connecting them
- [ ] `ea validate` passing in CI
- [ ] A Mermaid graph you can share with your team

## First Month: Expand and Govern

### Week 2: Add Data Layer

Model your databases and data flows:

```bash
npx anchored-spec create data-store --title "Orders PostgreSQL"
npx anchored-spec create physical-schema --title "Orders Table"
```

Connect with `uses`, `stores`, `hostedOn` relations. This gives you the system-data matrix report:

```bash
npx anchored-spec report --view system-data-matrix
```

### Week 3: Add Drift Detection

Configure at least one resolver and run drift:

```bash
# Check if declared APIs exist in OpenAPI specs
npx anchored-spec drift --domain systems

# Check if declared deployments exist in K8s manifests
npx anchored-spec drift --domain delivery
```

Address the high-severity findings. Create `exception` artifacts for known gaps you can't fix immediately:

```bash
npx anchored-spec create exception --title "Legacy Billing API"
```

### Week 4: Share with the Team

Generate reports and share at your architecture review:

```bash
npx anchored-spec report --all
```

The system-data matrix and drift report are the most immediately useful views.

### End of Month 1 Checkpoint

You should have:
- [ ] 20-40 artifacts across systems, delivery, and data domains
- [ ] Drift detection running (at least advisory mode in CI)
- [ ] At least one report being generated
- [ ] Team awareness of the EA model

## Common Adoption Patterns

### Pattern: Service Team Self-Service

Each service team models their own applications. The platform team models shared infrastructure. Architecture team provides templates and reviews.

**Who creates what:**
- Service teams: `application`, `api-contract`, `event-contract`, `consumer`
- Platform team: `platform`, `deployment`, `network-zone`, `identity-boundary`, `cloud-resource`, `environment`
- Data team: `data-store`, `physical-schema`, `lineage`, `data-product`
- Architecture team: `capability`, `transition-plan`, `technology-standard`, `exception`

### Pattern: Discovery-First

Run `ea discover` on all available infrastructure sources first. Review and promote the best drafts to `active`. Delete the rest. Then fill in manually.

Best when: you have strong observability and consistent infrastructure-as-code.

### Pattern: Top-Down Meets Bottom-Up

Architecture team defines business capabilities and target state. Service teams model their systems. The capability map report shows where they connect and where there are gaps.

Best when: there's an active enterprise architecture practice.

### Pattern: Compliance-Driven

Start with `classification`, `retention-policy`, `control`, and `policy-objective` kinds. Map them to existing systems. Use drift detection to find compliance gaps.

Best when: there's an upcoming audit or compliance requirement.

## What NOT to Do

### ❌ Don't try to model everything at once

Start with systems + delivery for one product area. Expand later.

### ❌ Don't require all fields

Most fields are optional. A minimal artifact with `id`, `kind`, `title`, `status`, `summary`, `owners` is valid and useful.

### ❌ Don't model internal implementation details

EA artifacts model the system boundary — what something is, what it connects to, where it runs. Not how it's implemented internally.

### ❌ Don't block delivery on EA completeness

EA governance should be additive to existing delivery workflows. Don't make EA validation a merge blocker until the team is comfortable.

### ❌ Don't skip owners

Every artifact needs an owning team. Unowned artifacts become stale. The `owners` field is what makes EA governance sustainable.

## Measuring Progress

Use `ea report` and `ea validate` to track adoption metrics:

```bash
npx anchored-spec report --all
npx anchored-spec validate
```

Key metrics to track:
- **Coverage**: % of known services that have EA artifacts
- **Relation density**: average relations per artifact (target: > 2)
- **Anchor coverage**: % of active artifacts with at least one anchor
- **Drift health**: % of drift checks passing
- **Freshness**: average age of evidence records
