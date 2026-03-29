# EA Testing Guide

This document defines testing patterns for EA artifacts, the relation graph, drift detection, resolvers, generators, and CI validation. It enables teams to treat their EA model as a first-class tested asset.

Read [ea-design-overview.md](./ea-design-overview.md) for context.

---

## 1. Testing Philosophy

EA artifacts are code. They declare the architecture of your system. Like any code, they should be:

- **Validated** — schema-correct and internally consistent
- **Tested** — relations resolve, anchors exist, constraints hold
- **Protected** — CI prevents regressions

The testing pyramid for EA:

```
        ╱╲
       ╱  ╲        Integration Tests
      ╱    ╲       (drift detection, resolver round-trips)
     ╱──────╲
    ╱        ╲     Structural Tests
   ╱          ╲    (graph integrity, relation validation)
  ╱────────────╲
 ╱              ╲  Schema Tests
╱                ╲ (validation, ID format, required fields)
──────────────────
```

---

## 2. Schema Validation Tests

### What They Test

- Every artifact conforms to the EA JSON Schema
- Required fields are present
- Field types are correct
- Enum values are valid
- ID format matches the kind prefix

### Implementation Pattern

```typescript
import { describe, it, expect } from 'vitest';
import { loadEaArtifacts, validateArtifact } from 'anchored-spec/ea';
import { resolve } from 'path';

describe('EA Schema Validation', () => {
  const artifacts = loadEaArtifacts(resolve(__dirname, '../ea'));

  it('loads all artifacts without parse errors', () => {
    expect(artifacts.length).toBeGreaterThan(0);
    // loadEaArtifacts throws on parse errors, so reaching here means success
  });

  it.each(artifacts.map(a => [a.id, a]))(
    '%s passes schema validation',
    (_id, artifact) => {
      const result = validateArtifact(artifact);
      expect(result.errors).toEqual([]);
    }
  );

  it.each(artifacts.map(a => [a.id, a]))(
    '%s has correct ID prefix for its kind',
    (_id, artifact) => {
      const expectedPrefix = getKindPrefix(artifact.kind);
      expect(artifact.id).toMatch(new RegExp(`^${expectedPrefix}-`));
    }
  );

  it('has no duplicate IDs', () => {
    const ids = artifacts.map(a => a.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(duplicates).toEqual([]);
  });
});
```

### Fixture-Based Testing

Use the example project (`examples/ea/`) as test fixtures:

```typescript
describe('Example EA Fixtures', () => {
  const fixtures = loadEaArtifacts(resolve(__dirname, '../../examples/ea'));

  it('all 15 fixtures pass validation', () => {
    expect(fixtures.length).toBe(15);
    fixtures.forEach(f => {
      expect(validateArtifact(f).errors).toEqual([]);
    });
  });
});
```

---

## 3. Structural / Graph Integrity Tests

### What They Test

- All relation targets reference existing artifacts
- No self-referencing relations
- The relation graph has no broken edges
- Orphan detection (artifacts with zero relations)
- Cycle detection where cycles are disallowed

### Implementation Pattern

```typescript
import { describe, it, expect } from 'vitest';
import { loadEaArtifacts, buildRelationGraph } from 'anchored-spec/ea';

describe('EA Graph Integrity', () => {
  const artifacts = loadEaArtifacts(resolve(__dirname, '../ea'));
  const graph = buildRelationGraph(artifacts);

  it('has no broken edges (dangling targets)', () => {
    const broken = graph.edges.filter(e => !graph.hasNode(e.target));
    if (broken.length > 0) {
      const details = broken.map(e => `${e.source} --${e.type}--> ${e.target}`);
      expect.fail(`Broken edges:\n${details.join('\n')}`);
    }
  });

  it('has no self-referencing relations', () => {
    const selfRefs = graph.edges.filter(e => e.source === e.target);
    expect(selfRefs).toEqual([]);
  });

  it('has no orphan artifacts', () => {
    const orphans = graph.nodes.filter(n => graph.edgesOf(n.id).length === 0);
    // Allow some orphans in early adoption, but flag them
    if (orphans.length > 0) {
      console.warn(`Orphan artifacts: ${orphans.map(o => o.id).join(', ')}`);
    }
    // Strict mode: expect(orphans).toEqual([]);
  });

  it('has no cycles in deployment relations', () => {
    const deployEdges = graph.edges.filter(e => e.type === 'deployedAs');
    const hasCycle = detectCycles(graph, deployEdges);
    expect(hasCycle).toBe(false);
  });

  it('all active artifacts have at least one owner', () => {
    const unowned = artifacts.filter(
      a => a.metadata.status === 'active' && (!a.metadata.owners || a.metadata.owners.length === 0)
    );
    expect(unowned.map(a => a.id)).toEqual([]);
  });

  it('cross-domain connectivity exists', () => {
    const crossDomain = graph.edges.filter(e => {
      const sourceDomain = getDomain(graph.getNode(e.source));
      const targetDomain = getDomain(graph.getNode(e.target));
      return sourceDomain !== targetDomain;
    });
    expect(crossDomain.length).toBeGreaterThan(0);
  });
});
```

### Domain-Specific Graph Assertions

```typescript
describe('Systems Domain Graph', () => {
  it('every application has at least one deployment', () => {
    const apps = artifacts.filter(a => a.kind === 'application');
    apps.forEach(app => {
      const deployments = graph.edgesFrom(app.id).filter(e => e.type === 'deployedAs');
      expect(deployments.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('every api-contract has at least one implementor', () => {
    const apis = artifacts.filter(a => a.kind === 'api-contract');
    apis.forEach(api => {
      const implementors = graph.edgesTo(api.id).filter(e => e.type === 'implements');
      expect(implementors.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('every data-store is used by at least one application', () => {
    const stores = artifacts.filter(a => a.kind === 'data-store');
    stores.forEach(store => {
      const users = graph.edgesTo(store.id).filter(e => e.type === 'storesIn');
      expect(users.length).toBeGreaterThanOrEqual(1);
    });
  });
});
```

---

## 4. Anchor Existence Tests

### What They Test

- Anchored files actually exist on disk
- Anchored symbols exist in the referenced files
- Anchored routes match patterns in route files

### Implementation Pattern

```typescript
import { existsSync } from 'fs';

describe('EA Anchor Existence', () => {
  const artifacts = loadEaArtifacts(resolve(__dirname, '../ea'));
  const anchorable = artifacts.filter(a => a.anchors);

  it.each(anchorable.map(a => [a.id, a]))(
    '%s — all anchored files exist',
    (_id, artifact) => {
      const allFiles = collectAnchorFiles(artifact.anchors);
      const missing = allFiles.filter(f => !existsSync(resolve(projectRoot, f)));
      expect(missing).toEqual([]);
    }
  );
});

function collectAnchorFiles(anchors: EaAnchors): string[] {
  const files: string[] = [];
  if (anchors.interfaces) files.push(...anchors.interfaces.map(i => i.file));
  if (anchors.apis) files.push(...anchors.apis.map(a => a.file));
  if (anchors.schemas) files.push(...anchors.schemas.map(s => s.file));
  if (anchors.configs) files.push(...anchors.configs.map(c => c.path));
  return [...new Set(files)];
}
```

### Symbol-Level Anchor Tests (Advanced)

For deeper validation, use ts-morph (or similar AST tools) to verify symbols exist:

```typescript
describe('EA Symbol Anchors (AST)', () => {
  it('interface anchors reference exported symbols', () => {
    const artifacts = loadEaArtifacts(resolve(__dirname, '../ea'));
    const withInterfaces = artifacts.filter(a => a.anchors?.interfaces?.length);

    withInterfaces.forEach(artifact => {
      artifact.anchors!.interfaces!.forEach(anchor => {
        const filePath = resolve(projectRoot, anchor.file);
        const symbols = extractExportedSymbols(filePath);
        expect(symbols).toContain(anchor.symbol);
      });
    });
  });
});
```

---

## 5. Drift Detection Tests

### What They Test

- Drift detection runs without errors
- Known drifts are caught
- Exceptions properly suppress findings
- Resolver chain produces expected results

### Implementation Pattern

```typescript
describe('EA Drift Detection', () => {
  it('runs drift detection without errors', async () => {
    const report = await detectEaDrift({
      artifacts: loadEaArtifacts(eaDir),
      config: loadConfig(),
      resolvers: getConfiguredResolvers(),
    });
    expect(report.error).toBeUndefined();
  });

  it('produces zero errors on a clean model', async () => {
    const report = await detectEaDrift({ /* ... */ });
    const errors = report.findings.filter(f => f.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('respects exceptions', async () => {
    const report = await detectEaDrift({ /* ... */ });
    const suppressed = report.findings.filter(f => f.suppressed);
    const active = report.findings.filter(f => !f.suppressed);

    // Verify the legacy payment endpoint exception works
    const legacyFinding = active.find(
      f => f.rule === 'ea:systems/undocumented-api' && f.artifactId === 'SVC-payment-api'
    );
    expect(legacyFinding).toBeUndefined(); // Should be suppressed
  });
});
```

### Snapshot Testing for Drift Reports

```typescript
describe('Drift Report Snapshots', () => {
  it('drift report matches snapshot', async () => {
    const report = await detectEaDrift({ /* ... */ });
    // Exclude timestamps for stable snapshots
    const stable = {
      ...report,
      generatedAt: '<redacted>',
      findings: report.findings.map(f => ({ ...f, detectedAt: '<redacted>' })),
    };
    expect(stable).toMatchSnapshot();
  });
});
```

---

## 6. Resolver Tests

### Unit Testing a Resolver

```typescript
import { describe, it, expect } from 'vitest';
import { OpenApiResolver } from 'anchored-spec/ea/resolvers';

describe('OpenAPI Resolver', () => {
  const resolver = new OpenApiResolver();

  it('resolves API anchors from an OpenAPI spec', async () => {
    const result = await resolver.resolve({
      anchor: { route: 'POST /api/v2/orders', file: 'openapi/orders.yaml' },
      artifact: mockApiContract,
      projectRoot: fixtureDir,
    });

    expect(result.found).toBe(true);
    expect(result.observedState).toMatchObject({
      method: 'POST',
      path: '/api/v2/orders',
      operationId: 'createOrder',
    });
  });

  it('returns not-found for missing endpoints', async () => {
    const result = await resolver.resolve({
      anchor: { route: 'DELETE /api/v2/orders/:id', file: 'openapi/orders.yaml' },
      artifact: mockApiContract,
      projectRoot: fixtureDir,
    });

    expect(result.found).toBe(false);
  });

  it('discovers undocumented endpoints', async () => {
    const discovered = await resolver.discover({
      source: resolve(fixtureDir, 'openapi/orders.yaml'),
      existingArtifacts: [mockApiContract],
      projectRoot: fixtureDir,
    });

    expect(discovered.newArtifacts.length).toBeGreaterThan(0);
    discovered.newArtifacts.forEach(a => {
      expect(a.metadata.confidence).toBe('observed');
    });
  });
});
```

### Integration Testing the Resolver Chain

```typescript
describe('Resolver Chain', () => {
  it('first resolver wins', async () => {
    const chain = [mockResolverA, mockResolverB];

    mockResolverA.resolve.mockResolvedValue({ found: true, observedState: { source: 'A' } });
    mockResolverB.resolve.mockResolvedValue({ found: true, observedState: { source: 'B' } });

    const result = await resolveAnchor(chain, anchor, artifact, projectRoot);

    expect(result.observedState.source).toBe('A');
    expect(mockResolverB.resolve).not.toHaveBeenCalled();
  });

  it('falls through to next resolver on null', async () => {
    const chain = [mockResolverA, mockResolverB];

    mockResolverA.resolve.mockResolvedValue(null);
    mockResolverB.resolve.mockResolvedValue({ found: true, observedState: { source: 'B' } });

    const result = await resolveAnchor(chain, anchor, artifact, projectRoot);

    expect(result.observedState.source).toBe('B');
  });
});
```

---

## 7. Generator Tests

### Testing Generator Output

```typescript
describe('OpenAPI Generator', () => {
  it('generates valid OpenAPI from api-contract artifact', async () => {
    const artifact = loadFixture('API-orders-v2');
    const output = await generateOpenApi(artifact);

    // Structural checks
    expect(output.openapi).toBe('3.1.0');
    expect(output.paths['/api/v2/orders']).toBeDefined();
    expect(output.paths['/api/v2/orders'].post).toBeDefined();
  });

  it('generate --check detects divergence', async () => {
    const artifact = loadFixture('API-orders-v2');
    const existingFile = resolve(fixtureDir, 'generated/orders.openapi.yaml');

    // Modify the existing file to simulate manual edit
    const modified = await readFile(existingFile, 'utf-8');
    const tampered = modified.replace('createOrder', 'createOrderModified');

    const result = await generateCheck(artifact, tampered);
    expect(result.diverged).toBe(true);
    expect(result.differences).toContainEqual(
      expect.objectContaining({ path: 'paths./api/v2/orders.post.operationId' })
    );
  });

  it('regeneration is idempotent', async () => {
    const artifact = loadFixture('API-orders-v2');
    const output1 = await generateOpenApi(artifact);
    const output2 = await generateOpenApi(artifact);
    expect(output1).toEqual(output2);
  });
});
```

---

## 8. Transition & Baseline Tests

```typescript
describe('EA Transitions', () => {
  it('baseline references only existing artifacts', () => {
    const baseline = loadFixture('BASELINE-q1-2026');
    const allIds = new Set(artifacts.map(a => a.id));

    baseline.spec.artifactIds.forEach((id: string) => {
      expect(allIds.has(id)).toBe(true);
    });
  });

  it('target changes reference valid artifacts', () => {
    const target = loadFixture('TARGET-q3-2026');
    const allIds = new Set(artifacts.map(a => a.id));

    target.spec.changes.modified.forEach((change: any) => {
      expect(allIds.has(change.id)).toBe(true);
    });
  });

  it('transition plan waves are chronologically ordered', () => {
    const plan = loadFixture('TPLAN-payment-migration');
    const waves = plan.spec.waves;

    for (let i = 1; i < waves.length; i++) {
      const prev = new Date(waves[i - 1].endDate);
      const curr = new Date(waves[i].startDate);
      expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime());
    }
  });

  it('exception has not expired', () => {
    const exceptions = artifacts.filter(a => a.kind === 'exception');
    const now = new Date();

    exceptions.forEach(exc => {
      if (exc.spec.expiry) {
        const expiry = new Date(exc.spec.expiry);
        if (expiry < now) {
          console.warn(`Exception ${exc.id} has expired (${exc.spec.expiry})`);
        }
      }
    });
  });
});
```

---

## 9. CI Test Configuration

### Vitest Configuration

```typescript
// vitest.config.ea.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/ea/**/*.test.ts'],
    globals: true,
    testTimeout: 30_000, // Resolvers may be slow
  },
});
```

### Package.json Scripts

```json
{
  "scripts": {
    "test:ea": "vitest run --config vitest.config.ea.ts",
    "test:ea:schema": "vitest run --config vitest.config.ea.ts tests/ea/schema/",
    "test:ea:graph": "vitest run --config vitest.config.ea.ts tests/ea/graph/",
    "test:ea:drift": "vitest run --config vitest.config.ea.ts tests/ea/drift/",
    "test:ea:watch": "vitest --config vitest.config.ea.ts"
  }
}
```

### Recommended Test Directory Layout

```
tests/
  ea/
    schema/
      validation.test.ts       # Schema validation for all artifacts
      id-format.test.ts        # ID prefix validation
      fixtures.test.ts         # Example fixture validation
    graph/
      integrity.test.ts        # Broken edges, orphans, cycles
      domain-rules.test.ts     # Domain-specific graph assertions
      connectivity.test.ts     # Cross-domain connectivity
    anchors/
      file-existence.test.ts   # Anchor file existence checks
      symbol-anchors.test.ts   # AST-level symbol verification
    drift/
      detection.test.ts        # Drift detection end-to-end
      exceptions.test.ts       # Exception suppression
      snapshots.test.ts        # Drift report snapshots
    resolvers/
      openapi.test.ts          # OpenAPI resolver unit tests
      kubernetes.test.ts       # Kubernetes resolver unit tests
      chain.test.ts            # Resolver chain integration
    generators/
      openapi.test.ts          # OpenAPI generator output
      idempotency.test.ts      # Regeneration stability
      check.test.ts            # Generate --check divergence
    transitions/
      baseline.test.ts         # Baseline reference integrity
      target.test.ts           # Target change validation
      plan.test.ts             # Transition plan wave ordering
      exceptions.test.ts       # Exception lifecycle
    fixtures/
      *.yaml                   # Test-specific EA artifacts
```

---

## 10. Test Utilities

Common helpers for EA tests:

```typescript
// tests/ea/helpers.ts
import { resolve } from 'path';

export const EA_DIR = resolve(__dirname, '../../ea');
export const FIXTURES_DIR = resolve(__dirname, './fixtures');
export const EXAMPLES_DIR = resolve(__dirname, '../../examples/ea');

export function loadFixture(id: string): EaArtifact {
  return loadEaArtifactById(FIXTURES_DIR, id);
}

export function loadAllFixtures(): EaArtifact[] {
  return loadEaArtifacts(FIXTURES_DIR);
}

export function loadExamples(): EaArtifact[] {
  return loadEaArtifacts(EXAMPLES_DIR);
}

export function mockArtifact(overrides: Partial<EaArtifact> = {}): EaArtifact {
  return {
    apiVersion: 'anchored-spec/ea/v1',
    kind: 'application',
    id: 'APP-test',
    metadata: {
      name: 'Test App',
      summary: 'A test application',
      owners: ['test-team'],
      confidence: 'declared',
      status: 'active',
      ...overrides.metadata,
    },
    ...overrides,
  };
}

export function mockRelation(overrides: Partial<EaRelation> = {}): EaRelation {
  return {
    type: 'dependsOn',
    target: 'APP-other',
    ...overrides,
  };
}
```
