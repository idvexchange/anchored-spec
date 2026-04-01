# Backstage Inline Example

This example shows the recommended inline authoring flow in anchored-spec.

## What this example demonstrates

- Backstage-aligned entities in Markdown frontmatter
- architecture prose and the entity definition in the same file
- fact decorators such as `@anchored-spec:events` and `@anchored-spec:endpoints`
- traceability-friendly docs that are ready for `trace`, `link-docs`, and docs drift checks

## Files

```text
examples/backstage-inline/
├── .anchored-spec/config.json
└── docs/
    ├── payment-service.md
    └── payments-api.md
```

## Try it

From the repository root:

```bash
npx anchored-spec --cwd examples/backstage-inline validate
npx anchored-spec --cwd examples/backstage-inline trace --summary
npx anchored-spec --cwd examples/backstage-inline drift --domain docs
npx anchored-spec --cwd examples/backstage-inline reconcile --include-trace --include-docs
```

## Why inline mode is useful

Inline mode is a strong fit when:

- the team already maintains architecture docs in Markdown
- entity metadata should live directly beside narrative docs
- doc facts should be checked for consistency
- AI or human readers need one file that contains both structure and explanation
