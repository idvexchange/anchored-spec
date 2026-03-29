# EA Multi-Repo Federation

This document defines how EA artifacts work across multiple repositories, including cross-repo references, federated graph assembly, and conflict resolution in distributed architectures.

Read [ea-design-overview.md](./ea-design-overview.md) for context, especially DD-3 (monorepo deployment topology as starting point).

---

## 1. Federation Model

### Why Federate?

DD-3 establishes monorepo as the initial topology. However, real-world organizations often have:

- Multiple service repos (one repo per microservice)
- Platform/infra repos separate from application repos
- Shared library repos consumed by many services
- A central architecture repo for cross-cutting concerns

Federation allows each repo to own its EA artifacts while enabling a unified view across all repos.

### Federation Topology

```
┌─────────────────────────────────────────────────────┐
│                  Central EA Repo                     │
│  (optional — stores cross-cutting artifacts,         │
│   business capabilities, transition plans)           │
│                                                      │
│  ea/business/CAP-order-management.yaml               │
│  ea/transitions/BASELINE-q1-2026.yaml                │
│  ea/transitions/TARGET-q3-2026.yaml                  │
└───────────────┬─────────────────────┬────────────────┘
                │                     │
        references              references
                │                     │
┌───────────────▼──────┐ ┌───────────▼──────────────┐
│   order-service repo │ │   payment-service repo    │
│                      │ │                           │
│  ea/systems/         │ │  ea/systems/              │
│    APP-order-svc.yml │ │    SVC-payment-api.yml    │
│  ea/delivery/        │ │  ea/delivery/             │
│    DEP-order-k8s.yml │ │    DEP-payment-k8s.yml   │
│  ea/data/            │ │  ea/data/                 │
│    STORE-orders.yml  │ │    STORE-payments.yml     │
└──────────────────────┘ └───────────────────────────┘
```

---

## 2. Cross-Repo References

### Reference Syntax

When an artifact in one repo references an artifact in another repo, use the `@repo` prefix:

```yaml
# In order-service repo: ea/systems/APP-order-service.yaml
relations:
  - type: dependsOn
    target: "@payment-service/SVC-payment-api"
  - type: ownedBy
    target: "@central-ea/CAP-order-management"
```

### Reference Format

```
@{repo-name}/{artifact-id}
```

Where:
- `repo-name` matches a key in the federation config (see Section 3)
- `artifact-id` is the full artifact ID in the remote repo

### Local vs Remote References

| Reference | Type | Resolution |
|---|---|---|
| `SVC-payment-api` | Local | Resolved within the current repo |
| `@payment-service/SVC-payment-api` | Remote | Resolved via federation config |
| `@central-ea/CAP-order-management` | Remote | Resolved via federation config |

**Rule:** If an artifact ID exists locally, a bare reference resolves locally. If it doesn't exist locally, validation warns about a potentially missing `@repo` prefix.

---

## 3. Federation Configuration

### Per-Repo Config

Each repo's `.anchored-spec/config.json` declares its federation settings:

```jsonc
{
  "ea": {
    "enabled": true,
    "federation": {
      // This repo's identity in the federation
      "repoName": "order-service",
      
      // Remote repos this repo references
      "remotes": {
        "payment-service": {
          "type": "github",
          "owner": "acme",
          "repo": "payment-service",
          "branch": "main",
          "artifactDir": "ea"
        },
        "central-ea": {
          "type": "github",
          "owner": "acme",
          "repo": "enterprise-architecture",
          "branch": "main",
          "artifactDir": "ea"
        }
      },

      // How remote artifacts are fetched
      "cache": {
        "ttl": 3600,           // Cache remote artifacts for 1 hour
        "dir": ".anchored-spec/federation-cache"
      }
    }
  }
}
```

### Remote Source Types

```typescript
type FederationRemote =
  | { type: 'github'; owner: string; repo: string; branch: string; artifactDir: string }
  | { type: 'gitlab'; project: string; branch: string; artifactDir: string }
  | { type: 'local'; path: string; artifactDir: string }  // For monorepo sub-paths
  | { type: 'url'; baseUrl: string }  // For published EA manifests
  ;
```

The `local` type is useful in monorepos where sub-packages have their own EA artifacts but share a filesystem:

```jsonc
{
  "remotes": {
    "shared-libs": {
      "type": "local",
      "path": "../shared-libraries",
      "artifactDir": "ea"
    }
  }
}
```

---

## 4. Federated Graph Assembly

### The `ea graph --federated` Command

```bash
# Build graph from local artifacts only (default)
npx anchored-spec ea graph

# Build graph including remote artifacts
npx anchored-spec ea graph --federated

# Build graph from all repos in the federation
npx anchored-spec ea graph --federated --all-remotes

# Build graph focusing on a specific remote
npx anchored-spec ea graph --federated --remote payment-service
```

### Assembly Algorithm

```
1. Load all local EA artifacts
2. For each configured remote:
   a. Check federation cache (use cached if within TTL)
   b. If cache miss, fetch remote artifacts:
      - GitHub: Use GitHub API to read remote ea/ directory
      - Local: Read from filesystem path
      - URL: Fetch published manifest
   c. Store in federation cache
3. Build the unified relation graph:
   a. Add all local artifacts as nodes
   b. Add referenced remote artifacts as nodes (marked remote: true)
   c. Resolve all local relations (local targets)
   d. Resolve cross-repo relations (@repo/id → remote node)
   e. Add virtual inverse edges as usual
4. Return the federated graph
```

### Graph Node Metadata

```typescript
interface FederatedGraphNode extends GraphNode {
  /** Which repo this artifact comes from */
  sourceRepo: string;
  /** Is this a remote artifact? */
  remote: boolean;
  /** When was this remote artifact last fetched? */
  fetchedAt?: string;
}
```

---

## 5. Validation in Federated Mode

### Cross-Repo Relation Validation

```bash
# Validate including remote target existence
npx anchored-spec ea validate --federated
```

In federated mode, validation:
- Checks that `@repo/id` references resolve to actual artifacts in the remote repo
- Warns if a remote artifact has been deleted or renamed
- Warns if a remote artifact's status is `deprecated` or `retired`
- Reports stale cache entries

### Validation Levels

| Level | Behavior | Speed |
|---|---|---|
| `local` (default) | Validate local artifacts only; remote refs are assumed valid | Fast |
| `federated` | Fetch and validate remote refs | Slower (network) |
| `strict` | Federated + fail on any unresolvable remote ref | Slowest |

---

## 6. Drift Detection Across Repos

### Local Drift (Default)

Each repo runs drift detection on its own artifacts. Cross-repo relations are not drift-checked.

### Federated Drift

```bash
npx anchored-spec ea drift --federated
```

Federated drift additionally checks:
- Remote artifacts referenced by local relations still exist
- Remote artifact status hasn't changed to `deprecated`/`retired`
- Cross-repo interface contracts are consistent (e.g., local consumer expects v2, remote API is v3)

### Drift Findings for Remote Artifacts

```typescript
interface FederatedDriftFinding extends EaDriftFinding {
  /** The remote repo where the issue was found */
  remoteRepo?: string;
  /** Whether this finding requires action in the remote repo */
  remoteAction?: boolean;
}
```

---

## 7. Publishing EA Manifests

For repos that want to make their EA artifacts available without requiring git access, they can publish a manifest:

### Manifest Format

```json
{
  "manifestVersion": 1,
  "repoName": "payment-service",
  "generatedAt": "2026-03-29T00:00:00Z",
  "artifacts": [
    {
      "id": "SVC-payment-api",
      "kind": "service",
      "metadata": {
        "name": "Payment API",
        "status": "active",
        "confidence": "declared"
      },
      "relations": [
        { "type": "deployedAs", "target": "DEP-payment-api-k8s" }
      ]
    }
  ],
  "publicRelations": [
    {
      "artifactId": "SVC-payment-api",
      "type": "consumedBy",
      "externalTarget": true,
      "description": "Available for consumption by any service"
    }
  ]
}
```

### Publishing Command

```bash
# Generate manifest from local artifacts
npx anchored-spec ea manifest --output ea-manifest.json

# Publish to a URL (team-managed hosting)
npx anchored-spec ea manifest --output ea-manifest.json
# Then upload to S3, GitHub Pages, etc.
```

### Consuming a Published Manifest

```jsonc
{
  "remotes": {
    "payment-service": {
      "type": "url",
      "baseUrl": "https://ea-manifests.example.com/payment-service/ea-manifest.json"
    }
  }
}
```

---

## 8. Conflict Resolution in Federation

### ID Collisions

If two repos use the same artifact ID:
- Fully-qualified IDs (`@repo/id`) are always unambiguous
- Bare IDs are resolved locally first
- If a bare ID matches both a local and a remote artifact, validation warns:
  `"Ambiguous reference 'APP-auth-service' — exists locally and in @identity-service. Use @repo/ prefix."`

### Divergent Metadata

If a remote artifact's metadata contradicts local assumptions:
- **Status divergence:** Local relation targets a remote artifact that is now `retired` → drift warning
- **Schema divergence:** Remote artifact uses a newer `apiVersion` than local → compatibility warning
- **Relation divergence:** Remote artifact removed a relation that local depends on → drift error

### Stale Cache

The federation cache has a TTL. When cache is stale:
- `ea validate --federated` re-fetches
- `ea graph --federated` re-fetches
- If the remote is unreachable, uses stale cache with a warning

---

## 9. Migration Path: Monorepo → Federated

### Step 1: Extract Repo Identity

Add `federation.repoName` to each repo's config. No other changes needed.

### Step 2: Add Remote Configs

When a repo starts referencing artifacts in another repo, add the remote to its federation config.

### Step 3: Qualify Cross-Repo References

Update bare references to use `@repo/id` syntax for any artifact that lives in a different repo.

### Step 4: Optionally Publish Manifests

For repos that are frequently referenced, publish an EA manifest to reduce API calls.

### Step 5: Set Up Federated CI

Add `--federated` to CI validation for repos that depend on remote artifacts.

---

## 10. Limitations and Future Work

| Limitation | Status | Notes |
|---|---|---|
| Real-time cross-repo drift | Future | Currently batch-only via `--federated` flag |
| Transitive remote resolution | Future | `@a/X → @b/Y` chains are not followed |
| Write-back to remotes | Not planned | Federation is read-only; changes to remote artifacts require PRs in the remote repo |
| Automatic manifest publishing | Future | Currently manual; could be a CI step |
| Federation discovery | Future | `ea discover --federated` to find artifacts across repos |
