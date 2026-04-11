# ADR-005: Flexible Document Structure Configuration

## Status

Proposed

## Context

The repository documentation set now uses an architecture-first structure under `docs/`:

- root framing documents such as `docs/README.md` and `docs/glossary.md`
- numbered architecture views such as `docs/01-business/` through `docs/10-testing/`
- support areas such as `docs/archive/adr/`, `docs/archive/req/`, `docs/workflows/`, and `docs/maintainers/`

That structure is now the repository standard, but the current Anchored Spec configuration model still treats `domains` as physical directory paths:

- `.anchored-spec/config.json`
- `src/ea/config.ts`
- `src/ea/schemas/config-v1.schema.json`

This creates the wrong abstraction boundary. The framework currently assumes that:

- logical EA domains are the same thing as physical folder locations
- document-aware commands should default to a legacy directory set instead of repo config
- `create-doc` should write to a raw directory path instead of a named documentation section

The runtime already supports nested documentation layouts better than the config model implies:

- `src/ea/docs/scanner.ts` scans directories recursively
- document-aware commands already accept `--doc-dirs`
- `create-doc` can already write to arbitrary subdirectories via `--dir`

The missing piece is configuration and command behavior that make a modern docs tree first-class.

## Decision

Anchored Spec will decouple semantic domains from physical document layout in configuration version `1.1`.

### 1. `schemaVersion` moves to `1.1`

New configuration that uses the flexible docs model must declare:

```json
{
  "schemaVersion": "1.1"
}
```

Version `1.0` remains supported for backward compatibility. Version `1.1` is the first version where document layout is explicitly modeled.

### 2. `domains` becomes a semantic list

In `1.1`, `domains` no longer stores paths. It becomes a simple list of semantic domain identifiers:

```json
{
  "domains": [
    "business",
    "systems",
    "delivery",
    "data",
    "information",
    "transitions"
  ]
}
```

Rules:

- values are unique strings
- values are semantic labels, not file paths
- values may be repository-specific
- the built-in six domains remain the default starter set

Implementation impact:

- `EaDomain` must no longer be a closed path-oriented union
- built-in defaults can remain exported as a constant list for scaffolding and validation hints
- any logic that needs a directory must stop reading it from `domains`

### 3. Add a new top-level `docs` section

The physical documentation structure moves into a dedicated config section:

```json
{
  "schemaVersion": "1.1",
  "rootDir": "docs",
  "generatedDir": "docs/generated",
  "domains": [
    "business",
    "systems",
    "delivery",
    "data",
    "information",
    "transitions"
  ],
  "docs": {
    "structure": "architecture-views",
    "scanDirs": ["docs"],
    "rootDocs": [
      "docs/README.md",
      "docs/glossary.md",
      "docs/start/adoption-overview.md",
      "docs/start/choose-your-path.md"
    ],
    "sections": [
      {
        "id": "business",
        "title": "Business",
        "path": "docs/01-business",
        "kind": "architecture",
        "domains": ["business"]
      },
      {
        "id": "system-context",
        "title": "System Context",
        "path": "docs/02-system-context",
        "kind": "architecture",
        "domains": ["systems"]
      },
      {
        "id": "container",
        "title": "Container",
        "path": "docs/03-container",
        "kind": "architecture",
        "domains": ["systems"]
      },
      {
        "id": "component",
        "title": "Component",
        "path": "docs/04-component",
        "kind": "architecture",
        "domains": ["systems"]
      },
      {
        "id": "domain",
        "title": "Domain",
        "path": "docs/05-domain",
        "kind": "architecture",
        "domains": ["business", "information"]
      },
      {
        "id": "api",
        "title": "API",
        "path": "docs/06-api",
        "kind": "architecture",
        "domains": ["systems", "transitions"]
      },
      {
        "id": "data",
        "title": "Data",
        "path": "docs/07-data",
        "kind": "architecture",
        "domains": ["data"]
      },
      {
        "id": "security",
        "title": "Security",
        "path": "docs/08-security",
        "kind": "architecture",
        "domains": ["systems"]
      },
      {
        "id": "infrastructure",
        "title": "Infrastructure",
        "path": "docs/09-infrastructure",
        "kind": "architecture",
        "domains": ["delivery", "systems"]
      },
      {
        "id": "testing",
        "title": "Testing",
        "path": "docs/10-testing",
        "kind": "architecture",
        "domains": ["delivery"]
      },
      {
        "id": "adr",
        "title": "Architecture Decision Records",
        "path": "docs/archive/adr",
        "kind": "decision-record"
      },
      {
        "id": "req",
        "title": "Requirements",
        "path": "docs/archive/req",
        "kind": "requirement"
      },
      {
        "id": "workflows",
        "title": "Workflows",
        "path": "docs/workflows",
        "kind": "guide"
      },
      {
        "id": "maintainers",
        "title": "Maintainers",
        "path": "docs/maintainers",
        "kind": "guide"
      }
    ],
    "templates": {
      "spec": "api",
      "architecture": "component",
      "guide": "workflows",
      "adr": "adr",
      "runbook": "maintainers"
    }
  }
}
```

Field semantics:

- `docs.structure`: named scaffold profile
- `docs.scanDirs`: directories that document-aware commands scan recursively
- `docs.rootDocs`: top-level framing documents for indexers, generators, and LLM-oriented exports
- `docs.sections`: named writing targets for human authors and CLI commands
- `docs.templates`: default section mapping for `create-doc` by document type

Validation rules:

- `docs.sections[*].id` must be unique
- `docs.sections[*].path` must be repository-relative
- `docs.sections[*].domains`, when present, must reference entries from `domains`
- `docs.templates[*]` values must reference a valid section id
- `docs.scanDirs` must be non-empty

### 4. Standardize built-in structure profiles

`init` will support three structure profiles:

- `legacy-domain`
- `architecture-views`
- `custom`

Behavior:

- `legacy-domain` scaffolds the existing folder-per-domain layout used by `1.0`
- `architecture-views` scaffolds the current gold-standard docs tree, including `start/`, `workflows/`, `maintainers/`, and `archive/`
- `custom` writes a minimal `docs` block and leaves section definition to the repository owner

For new repositories created on `1.1`, `architecture-views` becomes the default scaffold profile.

## Command Behavior Changes

### `anchored-spec init`

Add:

```text
--docs-structure <legacy-domain|architecture-views|custom>
```

Behavior:

1. writes `schemaVersion: "1.1"`
2. writes semantic `domains`
3. writes a `docs` section matching the selected profile
4. scaffolds the corresponding directories and seed files

If `--docs-structure` is omitted, default to `architecture-views`.

### `anchored-spec create-doc`

Add:

```text
--section <id>
--list-sections
```

Resolution order for the output directory:

1. if `--dir` is supplied, use it exactly
2. else if `--section` is supplied, resolve `docs.sections[id].path`
3. else if `docs.templates[--type]` exists, resolve that section path
4. else fail with an error requiring `--section` or `--dir`

Additional behavior:

- `--list-sections` prints configured section ids, titles, paths, and kinds
- the human-readable success output should include both the created file path and the resolved section id when a section is used
- template resolution must read config, not hard-coded defaults

This makes `create-doc` section-aware without removing the existing `--dir` escape hatch.

### `anchored-spec trace`

When `--doc-dirs` is not supplied:

1. use `config.docs.scanDirs` for `1.1`
2. otherwise preserve existing behavior for `1.0`

Scanning remains recursive. The change is where the defaults come from.

### `anchored-spec context`

When document scanning is needed:

1. use the explicit CLI override if present
2. otherwise use `config.docs.scanDirs` for `1.1`
3. otherwise preserve existing defaults

This avoids missing relevant docs that live under sectioned subdirectories.

### `anchored-spec link-docs`

When `--doc-dirs` is not supplied:

1. use `config.docs.scanDirs` for `1.1`
2. otherwise preserve existing behavior for `1.0`

Bidirectional linking behavior is unchanged. Only directory selection changes.

### Document-driven discovery and reconciliation

Any workflow that scans docs to derive entities or detect drift must use the same resolution order:

1. explicit CLI override
2. `config.docs.scanDirs`
3. legacy fallback

This includes `discover --from-docs` and any reconcile flow that depends on document scanning.

## Backward Compatibility

Version `1.0` config remains valid.

Compatibility rules:

- if `schemaVersion` is `1.0`, keep reading `domains` as path mappings
- if `schemaVersion` is `1.1`, read `domains` as semantic labels and `docs` as the physical layout source of truth
- commands must continue to honor explicit CLI path overrides in both versions

Migration strategy:

1. load `1.0` and `1.1` config through a version-aware resolver
2. keep legacy defaults untouched for `1.0`
3. implement `1.1` without forcing existing repositories to rewrite immediately

## Consequences

### Positive

- the framework matches the repository’s actual documentation standard
- physical layout becomes configurable without redefining semantic domains
- recursive subdirectory support becomes first-class instead of incidental
- `create-doc` becomes predictable for large structured doc sets
- new repositories can start from an architecture-view layout without custom patching

### Negative

- config loading and schema validation become more complex
- the type surface around domains becomes less closed and more user-defined
- several commands must be updated together to avoid mixed `1.0` and `1.1` behavior

## Implementation Notes

Primary code areas to change:

- `src/ea/config.ts`
- `src/ea/types.ts`
- `src/ea/schemas/config-v1.schema.json`
- `src/cli/commands/ea-create-doc.ts`
- `src/cli/commands/ea-context.ts`
- `src/cli/commands/ea-trace.ts`
- `src/cli/commands/ea-link-docs.ts`
- any `init` command implementation that scaffolds docs and config

Recommended implementation sequence:

1. add version-aware config types and schema support for `1.1`
2. add a shared helper that resolves effective doc scan directories and section paths from config
3. update document-aware commands to consume that helper
4. add `create-doc --section` and `--list-sections`
5. update `init` scaffolding for structure profiles

## Implementation References

- `.anchored-spec/config.json`
- `src/ea/config.ts`
- `src/ea/types.ts`
- `src/ea/docs/scanner.ts`
- `src/cli/commands/ea-create-doc.ts`
- `src/cli/commands/ea-context.ts`
- `src/cli/commands/ea-trace.ts`
- `src/cli/commands/ea-link-docs.ts`
