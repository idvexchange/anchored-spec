# Migration from v0.x (Spec-Anchored) to v1.0 (Spec-as-Source)

> This guide covers upgrading from anchored-spec v0.x (REQ/CHG/ADR workflow) to v1.0 (EA enterprise architecture).

## What Changed

v1.0 removes the legacy "spec-anchored" core entirely. The EA module—previously an extension—is now the sole implementation.

| v0.x | v1.0 |
| --- | --- |
| `src/core/` (loader, drift, verify, generate) | Removed |
| `anchored-spec create requirement` | `anchored-spec create --kind requirement` |
| `anchored-spec verify` | `anchored-spec validate` |
| `anchored-spec drift` | `anchored-spec drift` (EA engine) |
| `specs/requirements/*.json` | `ea/legacy/REQ-*.json` (EA artifact format) |
| `specs/changes/*.json` | `ea/legacy/CHG-*.json` (EA artifact format) |
| `specs/decisions/*.json` | `ea/legacy/ADR-*.json` (EA artifact format) |
| `.anchored-spec/config.json` (v0.x) | `.anchored-spec/config.json` (v1.0, `schemaVersion: "1.0"`) |
| `import { SpecRoot } from "anchored-spec"` | `import { EaRoot } from "anchored-spec"` |
| `import "anchored-spec/schemas/*"` | `import "anchored-spec/schemas/*"` (now EA schemas) |

## Migration Steps

### 1. Update Config File

**v0.x config** (`.anchored-spec/config.json`):
```json
{
  "specRoot": "specs",
  "schemasDir": ".anchored-spec/schemas",
  "requirementsDir": "specs/requirements",
  "changesDir": "specs/changes",
  "decisionsDir": "specs/decisions",
  "sourceRoots": ["src"],
  "ea": {
    "enabled": true,
    "rootDir": "ea"
  }
}
```

**v1.0 config**:
```json
{
  "schemaVersion": "1.0",
  "rootDir": "ea",
  "domains": ["systems", "delivery", "data", "information", "business", "transitions", "legacy"],
  "sourceRoots": ["src"]
}
```

Run `anchored-spec init --migrate` to auto-migrate your config.

### 2. Convert Legacy Artifacts

Legacy REQ/CHG/ADR artifacts should be converted to EA format. The `legacy` domain in EA subsumes all three:

| Legacy Kind | EA Kind | EA Domain |
| --- | --- | --- |
| Requirement | `requirement` | `legacy` |
| Change | `change` | `legacy` |
| Decision | `decision` | `legacy` |

**Before (v0.x requirement):**
```json
{
  "id": "REQ-auth",
  "title": "User Authentication",
  "status": "active",
  "category": "functional",
  "priority": "must",
  "summary": "Users must authenticate via OAuth2",
  "semanticRefs": { "interfaces": ["AuthService"], "routes": ["/api/auth"] }
}
```

**After (v1.0 EA artifact):**
```json
{
  "id": "REQ-auth",
  "schemaVersion": "1.0.0",
  "kind": "requirement",
  "title": "User Authentication",
  "status": "active",
  "summary": "Users must authenticate via OAuth2",
  "owners": ["platform-team"],
  "confidence": "declared",
  "anchors": { "symbols": ["AuthService"], "apis": ["/api/auth"] }
}
```

Place converted artifacts in `ea/legacy/`.

### 3. Update Programmatic Usage

```typescript
// v0.x
import { SpecRoot, detectDrift, verifyAll } from "anchored-spec";
const root = new SpecRoot(projectRoot, config);
const reqs = root.loadRequirements();

// v1.0
import { EaRoot } from "anchored-spec";
const root = await EaRoot.fromDirectory(projectRoot);
const { artifacts } = await root.loadArtifacts();
```

### 4. Update CI Pipelines

Replace legacy commands in your CI config:

```yaml
# v0.x
- run: npx anchored-spec verify
- run: npx anchored-spec drift

# v1.0
- run: npx anchored-spec validate
- run: npx anchored-spec drift
- run: npx anchored-spec evidence check
```

## Removed Features

The following v0.x features have no direct v1.0 equivalent:

- **Lifecycle hooks** (`hooks` config) — use EA plugins instead
- **Test linking** (`testMetadata` config) — use EA evidence adapters
- **Integrity checks** — replaced by EA schema validation
- **Custom change types** — EA uses a fixed kind taxonomy with 44 artifact kinds

## New Capabilities in v1.0

- **44 artifact kinds** across 7 architecture domains
- **27 typed relations** with graph visualization
- **5 resolvers** (OpenAPI, Kubernetes, Terraform, SQL DDL, dbt)
- **42 drift rules** with domain-specific detection
- **Transition planning** with baselines, targets, and migration waves
- **Evidence pipeline** with adapter framework
- **Impact analysis** across the full dependency graph
