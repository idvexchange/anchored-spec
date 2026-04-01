# Backstage Alignment

Anchored Spec uses the Backstage entity envelope as its authoring contract. That gives teams a familiar model, keeps architecture descriptors compatible with the broader ecosystem, and avoids inventing a second metadata format for the same repository.

## Core contract

Every authored entity uses the Backstage descriptor shape:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: payments-service
  title: Payments Service
  description: Handles charge creation, settlement, and refunds.
  annotations:
    anchored-spec.dev/confidence: declared
    anchored-spec.dev/source: src/payments/
spec:
  type: service
  lifecycle: production
  owner: group:default/payments-team
  system: billing-platform
  providesApis:
    - api:default/payments-api
  dependsOn:
    - resource:default/ledger-db
```

Anchored-spec adds analysis-specific semantics through:

- `anchored-spec.dev/*` annotations
- custom `anchored-spec.dev/v1alpha1` kinds
- derived relations and runtime status used by analysis commands

## Supported storage modes

### Manifest mode

Use a `catalog-info.yaml` manifest as the main source file.

```bash
npx anchored-spec init --mode manifest --with-examples
```

Manifest mode can also load additional entity YAML files from a configured `catalogDir`.

### Inline mode

Embed entities as YAML frontmatter in Markdown files.

```bash
npx anchored-spec init --mode inline --with-examples
```

Inline mode is ideal when architecture documentation and entity metadata should live in the same file.

## Canonical entity refs

Runtime and CLI workflows use Backstage-style entity refs.

Accepted shapes include:

- `orders-service`
- `component:orders-service`
- `default/orders-service`
- `component:default/orders-service`

Use the full form when you want documentation and automation to be explicit.

## Built-in and custom kinds

### Prefer built-in kinds

Use standard Backstage kinds whenever possible:

- `Component`
- `API`
- `Resource`
- `Group`
- `System`
- `Domain`

### Use custom kinds for EA-only concepts

Anchored Spec ships custom kinds for concepts that do not map cleanly to Backstage built-ins:

- `Requirement`
- `Decision`
- `CanonicalEntity`
- `Exchange`
- `Capability`
- `ValueStream`
- `Mission`
- `Technology`
- `SystemInterface`
- `Control`
- `TransitionPlan`
- `Exception`

## Authored fields vs derived output

Backstage-authored fields stay in the descriptor when Backstage already has a home for them.

Examples:

- `spec.owner`
- `spec.dependsOn`
- `spec.providesApis`
- `spec.consumesApis`
- `spec.system`
- `spec.domain`
- `spec.lifecycle`

Derived runtime `relations` are analysis output. Anchored Spec computes them for graphing, drift, diff, impact, and report workflows instead of requiring authors to persist a giant top-level relation array.

## Anchored-spec annotations

Common annotation keys:

| Annotation | Purpose |
|---|---|
| `anchored-spec.dev/source` | Source path used for anchor or trace workflows |
| `anchored-spec.dev/confidence` | Confidence level such as `declared`, `observed`, or `inferred` |
| `anchored-spec.dev/expect-anchors` | Expected anchor categories for validation |
| `anchored-spec.dev/compliance` | Compliance labels |
| `anchored-spec.dev/risk` | Risk metadata |
| `anchored-spec.dev/suppress` | Targeted rule suppressions |

## Descriptor substitutions

Anchored Spec supports local file substitutions in descriptor values:

- `$text`
- `$json`
- `$yaml`

Example:

```yaml
spec:
  definition:
    $text: ./specs/payments-openapi.yaml
```

Only local filesystem substitutions are supported by default.

## Markdown decorators

Inline docs and architecture docs can use anchored-spec fact decorators:

```html
<!-- @anchored-spec:endpoints payments-endpoints -->
| Method | Path | Description |
|---|---|---|
| POST | /payments | Create a payment |
<!-- @anchored-spec:end -->
```

These decorators feed doc-consistency and fact-extraction workflows.

## Why this alignment matters

Backstage alignment gives anchored-spec three practical advantages:

1. the descriptors are understandable outside this tool
2. a repo can graduate into a Backstage deployment later without rewriting its model
3. architecture metadata stays in one portable, inspectable format
