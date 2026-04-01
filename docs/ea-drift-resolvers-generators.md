# Drift, Resolvers, and Generators

Anchored Spec connects authored architecture to real repository signals through resolvers, then uses drift rules to compare the declared model to what those resolvers observe.

## Resolvers

Built-in resolver families include:

- OpenAPI
- Kubernetes
- Terraform
- SQL DDL
- dbt
- Anchors
- Markdown
- Tree-sitter

Use one explicitly:

```bash
npx anchored-spec discover --resolver openapi --source ./specs/orders-openapi.yaml
```

Or configure them in `.anchored-spec/config.json` and run `discover` with no explicit resolver.

## Discovery

Discovery creates or proposes draft entities from observed material.

Useful options include:

```bash
npx anchored-spec discover --dry-run
npx anchored-spec discover --from-docs
npx anchored-spec discover --resolver markdown --source docs/
```

Discovery is best used to bootstrap or refresh coverage. It should not replace deliberate authored review.

## Drift detection

Drift compares what the model declares to what the repository or environment reveals.

```bash
npx anchored-spec drift
npx anchored-spec drift --domain docs
```

Drift covers multiple architecture concerns, including:

- systems and API mismatches
- data and lineage issues
- information modeling gaps
- business and governance coverage gaps
- transition staleness
- exception expiry
- traceability issues
- documentation contradictions

## Doc consistency

The docs drift domain extracts facts from Markdown and checks them for consistency.

Supported fact sources include:

- tables
- fenced code blocks
- Mermaid diagrams
- heading/list patterns
- frontmatter

Decorator hints such as `@anchored-spec:endpoints` or `@anchored-spec:events` improve classification precision.

## Generators

Built-in generators currently target:

- OpenAPI
- JSON Schema

Generation can be run directly or as part of reconcile.

## Practical workflow

A strong maintenance loop is:

1. keep entities authored and validated
2. configure resolvers for the repository's major sources of truth
3. run discovery when bootstrapping or filling gaps
4. run drift regularly to catch divergence early
5. include doc consistency when architecture docs matter operationally
