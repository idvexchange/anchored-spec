import { afterEach, describe, expect, it } from "vitest";

import {
  applyCatalogPlan,
  buildCatalogPlan,
  loadProjectConfig,
  validateEaRelations,
  validateEntities,
  createDefaultRegistry,
} from "../index.js";
import type { AnchoredSpecConfigV1_2 } from "../config.js";
import {
  cleanupTestWorkspace,
  createTestWorkspace,
  readTextFile,
  writeManifestProject,
  writeTextFile,
} from "../../test-helpers/workspace.js";

const workspaces: string[] = [];

function makeWorkspace(prefix: string): string {
  const dir = createTestWorkspace(prefix);
  workspaces.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of workspaces.splice(0)) {
    cleanupTestWorkspace(dir);
  }
});

describe("catalog synthesis", () => {
  it("builds a curated manifest plan from package metadata and docs", async () => {
    const dir = makeWorkspace("catalog-plan");
    writeManifestProject(dir, [], {
      schemaVersion: "1.2",
      catalog: {
        bootstrap: {
          outputMode: "curated",
        },
      },
    } as Partial<AnchoredSpecConfigV1_2>);

    writeTextFile(dir, "package.json", JSON.stringify({
      name: "anchored-spec",
      version: "1.0.0",
      bin: { "anchored-spec": "./dist/cli/index.js" },
      exports: { ".": "./dist/index.js" },
    }, null, 2));

    writeTextFile(dir, "docs/01-business/business-architecture.md", `# Business Architecture

## Capability Stack

- explicit architecture authoring
- bootstrap from existing repository truth
- enforce semantic change governance
`);

    writeTextFile(dir, "docs/04-component/anchored-spec-cli.md", `# Anchored Spec CLI

Thin command-line surface for users and CI.

## Key Components

### Command router

Routes CLI invocations to runtime workflows.
`);

    writeTextFile(dir, "docs/04-component/anchored-spec-runtime.md", `# Anchored Spec Runtime

Reusable runtime and graph engine.

## Key Components

### Discovery engine

Discovers repository evidence.
`);

    writeTextFile(dir, "docs/06-api/cli-api.md", `# CLI API

The public shell-oriented interface.
`);

    writeTextFile(dir, "docs/06-api/node-api.md", `# Node API

The programmatic Node API.
`);

    writeTextFile(dir, "docs/req/REQ-001-entity-model-as-source-of-truth.md", `# REQ-001: Entity Model as Source of Truth

## Requirement

The framework shall treat the authored entity model as the primary architecture source of truth.
`);

    writeTextFile(dir, "docs/adr/ADR-001-backstage-aligned-entity-envelope.md", `# ADR-001: Backstage-Aligned Entity Envelope

## Status

Accepted

## Context

One stable entity envelope was needed.

## Decision

Use the Backstage entity envelope.

## Consequences

Easier interoperability.
`);

    const config = loadProjectConfig(dir);
    const plan = await buildCatalogPlan(dir, config);

    expect(plan.validation.errors).toEqual([]);
    expect(plan.actions.some((action) => action.entityRef === "group:default/anchored-spec-maintainers")).toBe(true);
    expect(plan.actions.some((action) => action.entityRef === "system:default/anchored-spec-framework")).toBe(true);
    expect(plan.actions.some((action) => action.entityRef === "component:default/anchored-spec-cli")).toBe(true);
    expect(plan.actions.some((action) => action.entityRef === "api:default/anchored-spec-cli-api")).toBe(true);
    expect(plan.actions.some((action) => action.entityRef === "requirement:default/req-001-entity-model-as-source-of-truth")).toBe(true);
    expect(plan.actions.some((action) => action.entityRef === "decision:default/adr-001-backstage-aligned-entity-envelope")).toBe(true);
    expect(plan.actions.some((action) => action.entityRef === "capability:default/explicit-architecture-authoring")).toBe(true);
  });

  it("applies a synthesized plan and writes a valid manifest", async () => {
    const dir = makeWorkspace("catalog-apply");
    writeManifestProject(dir, [], {
      schemaVersion: "1.2",
    } as Partial<AnchoredSpecConfigV1_2>);

    writeTextFile(dir, "package.json", JSON.stringify({
      name: "payments-platform",
      version: "1.0.0",
      bin: { payments: "./dist/cli/index.js" },
      exports: { ".": "./dist/index.js" },
    }, null, 2));

    writeTextFile(dir, "docs/04-component/payments-cli.md", `# Payments CLI

CLI for repository-local payment workflows.
`);
    writeTextFile(dir, "docs/06-api/cli-api.md", `# CLI API

The shell interface.
`);
    writeTextFile(dir, "docs/req/REQ-001-catalog-bootstrap.md", `# REQ-001: Catalog Bootstrap

## Requirement

The framework shall bootstrap a catalog.
`);
    writeTextFile(dir, "docs/adr/ADR-001-catalog-bootstrap.md", `# ADR-001: Catalog Bootstrap

## Status

Accepted

## Context

Manual catalog authoring is slow.

## Decision

Add catalog bootstrap.

## Consequences

Faster startup.
`);

    const config = loadProjectConfig(dir);
    const plan = await buildCatalogPlan(dir, config);
    const result = await applyCatalogPlan(plan, dir, config, { force: true });

    expect(result.entityCount).toBeGreaterThan(0);
    const manifest = readTextFile(dir, "catalog-info.yaml");
    expect(manifest).toContain("kind: Group");
    expect(manifest).toContain("kind: System");
    expect(manifest).toContain("kind: Component");

    const entities = plan.plannedEntities.map((entry) => entry.entity);
    const quality = validateEntities(entities, { quality: config.quality });
    const relations = validateEaRelations(entities, createDefaultRegistry(), { quality: config.quality });
    expect(quality.errors).toEqual([]);
    expect(relations.errors).toEqual([]);
  });
});
