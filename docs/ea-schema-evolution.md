# EA Schema Evolution & Migration Strategy

This document defines how the EA artifact schema evolves over time, how breaking vs additive changes are handled, and how teams migrate artifacts between schema versions.

Read [ea-design-overview.md](./ea-design-overview.md) for context, especially DD-1 (spec-as-source) and the unified artifact model in [ea-unified-artifact-model.md](./ea-unified-artifact-model.md).

---

## 1. Versioning Model

### API Version Format

```
anchored-spec/ea/v{major}
```

- **Major version** increments on breaking changes (field removals, type changes, semantic shifts)
- **Minor/patch** changes are additive and do not change the API version string
- The `apiVersion` field in every artifact declares which schema version it conforms to

### Schema Version vs API Version

| Concept | Scope | Example | Changes When |
|---|---|---|---|
| `apiVersion` | Global schema contract | `anchored-spec/ea/v1` | Breaking structural change to the base artifact shape |
| `schemaVersion` | Per-artifact metadata | `"1.2.0"` | The artifact's own content evolves (team-managed, informational) |

The framework manages `apiVersion`. Teams manage `schemaVersion` for their own tracking.

---

## 2. Change Classification

Every proposed schema change is classified before implementation:

### Additive (Non-Breaking)

These changes do **not** require an `apiVersion` bump:

| Change Type | Example | Migration |
|---|---|---|
| New optional field on base shape | Add `metadata.costCenter?: string` | None — old artifacts remain valid |
| New kind registered | Add `kind: "service-mesh"` | None — existing artifacts unaffected |
| New relation type | Add `authenticatesWith` relation | None — existing relations unaffected |
| New anchor type | Add `anchors.metrics` | None — existing anchors unaffected |
| New enum value on optional field | Add `"sunset"` to status enum | None — existing statuses still valid |
| New optional field on kind-specific `spec` | Add `spec.sla?: object` to `service` kind | None |

**Rule:** Additive changes ship in any release. No migration required.

### Breaking

These changes **require** an `apiVersion` bump (v1 → v2):

| Change Type | Example | Migration |
|---|---|---|
| Remove a required field | Remove `metadata.owners` | Codemod required |
| Rename a field | Rename `anchors` → `bindings` | Codemod required |
| Change a field's type | Change `metadata.tags: string[]` → `metadata.tags: Record<string, string>` | Codemod required |
| Change enum semantics | Redefine what `"active"` status means | Manual review required |
| Remove a kind | Remove `kind: "data-quality-rule"` | Manual migration to replacement kind |
| Change ID format | Change from `APP-slug` to `app/slug` | Codemod + relation update required |
| Change relation semantics | `dependsOn` now means compile-time only | Manual review required |

**Rule:** Breaking changes require a full migration cycle (see Section 4).

### Semantic (Judgment Call)

Some changes are structurally additive but semantically breaking:

| Change Type | Example | Classification |
|---|---|---|
| New required field with default | Add `metadata.confidence` (default: `"declared"`) | Additive if default is applied automatically |
| Tighten validation | Require `anchors` on active system artifacts | Breaking if existing artifacts fail validation |
| Change default behavior | `ea drift` now fails on warnings | Breaking for CI but not for schema |

**Rule:** Semantic changes are evaluated case-by-case. If existing valid artifacts would fail validation after the change, it's breaking.

---

## 3. Migration Strategies

### Strategy A: Lazy Upgrade (Preferred for Additive)

Artifacts are migrated on next edit, not all at once.

```
1. Ship new schema version
2. Loader accepts both old and new format
3. When an artifact is next edited, add the new fields
4. Validation warns (not errors) on missing optional fields
5. Over time, all artifacts converge to the latest shape
```

**Implementation:**

```typescript
interface SchemaLoader {
  /** Load an artifact, applying defaults for any missing optional fields */
  load(raw: unknown, apiVersion: string): EaArtifact;
  
  /** Check if an artifact uses the latest schema shape */
  isCurrentShape(artifact: EaArtifact): boolean;
  
  /** Apply defaults to bring an artifact up to current shape (non-destructive) */
  applyDefaults(artifact: EaArtifact): EaArtifact;
}
```

**When to use:** New optional fields, new enum values, new anchor types.

### Strategy B: Codemod (Required for Breaking)

Automated transformation of all artifacts in a single commit.

```
1. Write a codemod function: (oldArtifact) => newArtifact
2. Run: npx anchored-spec migrate --from v1 --to v2 --dry-run
3. Review the diff
4. Run: npx anchored-spec migrate --from v1 --to v2
5. Commit all changes in a single PR
6. Update apiVersion in all affected artifacts
```

**Implementation:**

```typescript
interface EaMigration {
  /** Source API version */
  from: string;
  /** Target API version */
  to: string;
  /** Human-readable description of the migration */
  description: string;
  /** Transform a single artifact from old shape to new shape */
  migrate(artifact: unknown): unknown;
  /** Validate that the migrated artifact is correct */
  validate(migrated: unknown): ValidationResult;
  /** Can this migration be reversed? */
  reversible: boolean;
  /** Reverse the migration (if reversible) */
  rollback?(artifact: unknown): unknown;
}
```

**Codemod registry:**

```typescript
// src/ea/migrations/index.ts
export const EA_MIGRATIONS: EaMigration[] = [
  // {
  //   from: 'anchored-spec/ea/v1',
  //   to: 'anchored-spec/ea/v2',
  //   description: 'Rename anchors to bindings, add required confidence field',
  //   migrate: (artifact) => { ... },
  //   validate: (migrated) => { ... },
  //   reversible: true,
  //   rollback: (artifact) => { ... },
  // },
];
```

**When to use:** Field renames, type changes, structural reorganization.

### Strategy C: Manual Review (For Semantic Changes)

Some changes require human judgment. The tool identifies affected artifacts but cannot auto-migrate.

```
1. Run: npx anchored-spec migrate --from v1 --to v2 --dry-run
2. Tool outputs list of artifacts needing manual review
3. For each artifact, tool explains what changed and why review is needed
4. Human updates each artifact
5. Run: npx anchored-spec validate to confirm all pass
```

**When to use:** Kind removal, relation semantic changes, validation tightening.

---

## 4. Migration Lifecycle

### Phase 1: Announce

- Document the upcoming change in a changelog or ADR
- Specify the timeline for deprecation (minimum 2 minor releases)
- Add deprecation warnings to `ea validate` output

### Phase 2: Dual Support

- The loader accepts both old and new shapes
- Old shape produces a deprecation warning
- New artifacts should use the new shape
- CI can be configured to warn or error on deprecated shapes

```typescript
interface DeprecationWarning {
  field: string;
  message: string;
  replacedBy?: string;
  removedIn: string; // API version where old shape is removed
}
```

### Phase 3: Migration Window

- Provide the `ea migrate` codemod
- Teams run the codemod in a single PR
- CI runs validation against both old and new schemas during the window

### Phase 4: Remove Old Support

- Remove the old shape from the loader
- Remove the dual-support code
- Artifacts still using the old shape now fail validation
- Bump the minimum `apiVersion` in config

---

## 5. The `ea migrate` Command

```bash
# Preview what would change
npx anchored-spec migrate --from v1 --to v2 --dry-run

# Run the migration
npx anchored-spec migrate --from v1 --to v2

# Migrate a specific domain only
npx anchored-spec migrate --from v1 --to v2 --domain systems

# Migrate a single artifact
npx anchored-spec migrate --from v1 --to v2 --artifact APP-order-service
```

**Output (dry-run):**

```
EA Schema Migration: v1 → v2 (DRY RUN)

Migration: Rename anchors to bindings, add required confidence field

Artifacts to migrate: 42
  systems:     12 artifacts
  delivery:     8 artifacts
  data:        14 artifacts
  information:  4 artifacts
  business:     4 artifacts

Changes per artifact:
  - Rename field 'anchors' → 'bindings'
  - Add field 'metadata.confidence' with default 'declared'

Artifacts requiring manual review: 3
  ⚠ STORE-legacy-db — has custom anchor format, needs manual check
  ⚠ APP-monolith — has inline comments in anchors block
  ⚠ IFACE-legacy-ftp — uses deprecated 'protocol' field format

Run without --dry-run to apply changes.
```

---

## 6. Version Compatibility Matrix

When the framework loads an artifact, it checks `apiVersion` against its supported versions:

```typescript
interface VersionSupport {
  /** Currently recommended version */
  current: string;
  /** All versions the loader can read */
  supported: string[];
  /** Versions that produce deprecation warnings */
  deprecated: string[];
  /** Versions that are rejected (loader throws) */
  unsupported: string[];
}

// Example at framework v3.0:
const VERSION_SUPPORT: VersionSupport = {
  current: 'anchored-spec/ea/v3',
  supported: ['anchored-spec/ea/v2', 'anchored-spec/ea/v3'],
  deprecated: ['anchored-spec/ea/v2'],
  unsupported: ['anchored-spec/ea/v1'],
};
```

**Behavior:**
- `current` → loads normally
- `supported` but `deprecated` → loads with warning
- `unsupported` → throws error with migration instructions

---

## 7. Config Schema Evolution

The EA config in `.anchored-spec/config.json` also evolves. The same additive/breaking classification applies:

```jsonc
{
  "ea": {
    // v1 config shape
    "enabled": true,
    "domains": ["systems", "delivery"],
    "artifactDir": "ea",
    
    // v1.1 additive: new optional fields
    "idPrefix": "acme",
    "validation": { "strictMode": false },
    
    // v2 breaking: renamed field
    // "artifactDirs" replaces "artifactDir" (now supports multiple)
  }
}
```

Config migrations follow the same codemod pattern but modify `.anchored-spec/config.json` instead of artifact files.

---

## 8. Relation Evolution

Relations need special care during schema evolution:

### Adding a Relation Type

Additive — no migration needed. New relation type is registered in the relation registry.

### Renaming a Relation Type

Breaking — requires codemod to update all `relations[].type` fields across all artifacts.

```typescript
// Example codemod for relation rename
const migrateRelation: EaMigration = {
  from: 'anchored-spec/ea/v1',
  to: 'anchored-spec/ea/v2',
  description: 'Rename "hostedOn" to "deployedTo"',
  migrate: (artifact: any) => ({
    ...artifact,
    relations: artifact.relations?.map((r: any) => ({
      ...r,
      type: r.type === 'hostedOn' ? 'deployedTo' : r.type,
    })),
  }),
  validate: (migrated: any) => {
    const hasOld = migrated.relations?.some((r: any) => r.type === 'hostedOn');
    return { valid: !hasOld, errors: hasOld ? ['Still uses deprecated "hostedOn" relation'] : [] };
  },
  reversible: true,
  rollback: (artifact: any) => ({
    ...artifact,
    relations: artifact.relations?.map((r: any) => ({
      ...r,
      type: r.type === 'deployedTo' ? 'hostedOn' : r.type,
    })),
  }),
};
```

### Removing a Relation Type

Breaking — requires manual review. Affected artifacts need their relations updated to use replacement types.

### Changing Relation Validation Rules

May be additive (relaxing) or breaking (tightening):
- Allowing new source/target kinds: additive
- Removing allowed source/target kinds: breaking (existing artifacts may fail validation)

---

## 9. Kind Evolution

### Adding a Kind

Additive — register the new kind in the taxonomy. No existing artifacts affected.

### Deprecating a Kind

Semantic — existing artifacts of that kind continue to work but produce warnings. Provide a migration path to the replacement kind.

```yaml
# Deprecation metadata in kind registry
- kind: data-quality-rule
  deprecated: true
  replacedBy: data-governance-policy
  deprecatedIn: anchored-spec/ea/v2
  removedIn: anchored-spec/ea/v3
```

### Removing a Kind

Breaking — all artifacts of that kind must be migrated to replacement kinds before the version bump.

### Changing Kind-Specific Fields

Follow the same additive/breaking classification as base fields, but scoped to the specific kind's `spec` block.

---

## 10. Testing Schema Changes

Before shipping any schema change:

1. **Backward compatibility test:** Load all example artifacts with the new schema. They must all pass.
2. **Forward compatibility test:** Create artifacts using the new fields. Load them with the old schema (should ignore unknown fields gracefully).
3. **Codemod round-trip test:** If a codemod is provided, apply it and then roll it back. The result must match the original.
4. **Validation test:** Run `ea validate` on migrated artifacts. Zero errors expected.
5. **Relation integrity test:** After migration, run `ea graph` and verify no broken edges.

```typescript
describe('EA Migration v1 → v2', () => {
  it('migrates all example artifacts without error', () => {
    const artifacts = loadExampleArtifacts('v1');
    const migrated = artifacts.map(a => migration.migrate(a));
    migrated.forEach(a => {
      expect(migration.validate(a).valid).toBe(true);
    });
  });

  it('round-trips correctly', () => {
    const original = loadExampleArtifacts('v1');
    const migrated = original.map(a => migration.migrate(a));
    const rolledBack = migrated.map(a => migration.rollback!(a));
    expect(rolledBack).toEqual(original);
  });

  it('preserves relation graph integrity', () => {
    const migrated = loadExampleArtifacts('v1').map(a => migration.migrate(a));
    const graph = buildRelationGraph(migrated);
    const brokenEdges = graph.edges.filter(e => !graph.hasNode(e.target));
    expect(brokenEdges).toEqual([]);
  });
});
```

---

## 11. Changelog Convention

Every schema change is documented in a structured changelog:

```markdown
## EA Schema Changelog

### v2 (unreleased)

#### Breaking
- Renamed `anchors` → `bindings` on all artifacts
  - Migration: `ea migrate --from v1 --to v2`
  - Codemod: `src/ea/migrations/v1-to-v2.ts`

#### Additive
- Added `metadata.costCenter?: string` to base shape
- Added `kind: "service-mesh"` to systems domain
- Added `authenticatesWith` relation type

#### Deprecated
- `metadata.team` is deprecated in favor of `metadata.owners` (removed in v3)

### v1 (current)
- Initial EA schema release
- 44 kinds across 7 domains
- 27 relation types
```
