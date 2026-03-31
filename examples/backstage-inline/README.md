# Backstage Inline Mode Example

This example shows anchored-spec with Backstage entity format in **inline mode** — entities are embedded as YAML frontmatter in markdown documentation files.

## Structure

```
.anchored-spec/config.json       # Config with entityMode: "inline"
docs/
  payment-service.md              # Component entity + documentation
  payments-api.md                 # API entity + endpoint docs
```

## Benefits of Inline Mode

- **Documentation lives with the entity** — no separate files to keep in sync
- **`@anchored-spec:` decorators** work naturally in the markdown body
- **Backstage-compatible** frontmatter can be read by Backstage's catalog

## Usage

```bash
cd examples/backstage-inline
npx anchored-spec validate
npx anchored-spec facts docs/
npx anchored-spec reconcile
```
