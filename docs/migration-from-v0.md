# Migration from v0.x

This guide explains how to move an older anchored-spec repository onto the current entity-native framework.

## What changed in the current framework

Current anchored-spec projects use:

- Backstage-aligned entities
- manifest or inline Markdown authoring
- canonical entity refs in CLI and runtime workflows
- current commands such as `validate`, `drift`, `diff`, `reconcile`, `trace`, and `context`

Older repositories may still contain:

- spec-anchored JSON layouts
- older artifact identifiers such as `REQ-*`, `CHG-*`, or `SVC-*`
- migration-era assumptions that are no longer part of the active CLI

## Migration goal

The goal is not to preserve the old storage contract forever. The goal is to land on the current framework cleanly.

A finished migration should result in:

- `.anchored-spec/config.json` with `schemaVersion: "1.0"`
- `entityMode: "manifest"` or `entityMode: "inline"`
- Backstage-style entities as the authored source of truth
- current command usage throughout docs, CI, and contributor workflows

## Recommended migration path

### 1. Upgrade the configuration

Create or replace `.anchored-spec/config.json` with a current v1 config.

### 2. Convert old architecture records into entities

Rewrite old records into Backstage-aligned entities.

Typical destination choices:

- services and applications → `Component`
- contracts and event surfaces → `API`
- stores and infrastructure → `Resource`
- teams → `Group`
- high-level landscape → `System` and `Domain`
- architecture governance concepts → anchored-spec custom kinds

### 3. Choose a storage mode

Pick one supported source layout:

- `catalog-info.yaml` manifest mode
- Markdown frontmatter inline mode

### 4. Update references

Replace old ID usage in automation and docs with canonical entity refs.

Examples:

- `SVC-auth` → `component:default/auth`
- `API-orders-v2` → `api:default/orders-v2`
- `REQ-mfa` → `requirement:default/req-mfa`

### 5. Update workflow commands

Move docs, scripts, and contributor guidance to the current CLI commands.

Common current workflows:

```bash
npx anchored-spec validate
npx anchored-spec drift
npx anchored-spec diff --base main --compat --policy
npx anchored-spec reconcile --include-trace --include-docs
```

### 6. Rebuild traceability

If older docs referenced legacy IDs directly, rebuild the trace graph around:

- entity refs
- `traceRefs`
- linked docs created or synced with `create-doc` and `link-docs`

### 7. Re-validate the whole repository

```bash
npx anchored-spec validate
npx anchored-spec drift
npx anchored-spec trace --summary
```

## What not to carry forward

Do not preserve migration-only assumptions in the finished repo.

Examples:

- old artifact IDs as the primary runtime identifier
- removed migration commands in contributor documentation
- old storage layouts as an equal alternative to manifest or inline entity authoring
- docs that still describe the framework as being mid-cutover

## Practical advice

If a v0.x repository is large, migrate in slices:

1. establish current config and storage mode
2. convert high-value runtime entities first
3. restore docs and traceability
4. reintroduce discovery, drift, and reconcile gates
5. clean up residual old terminology once the new model is in place
