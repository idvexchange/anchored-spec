/**
 * Tests for EA Relation Registry, Graph Builder, and Relation Validation.
 *
 * Covers:
 *   - RelationRegistry: register, get, validate source/target, inverses
 *   - createDefaultRegistry: all 10 Phase A relations
 *   - RelationGraph: build, traverse, impact, cycles, export
 *   - validateEaRelations: all 7 validation rules
 *   - Integration with examples/ea/ fixtures
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  RelationRegistry,
  createDefaultRegistry,
  TRAVERSAL_PROFILES,
  getTraversalProfile,
  type RelationRegistryEntry,
} from "../relation-registry.js";
import { RelationGraph, buildRelationGraph } from "../graph.js";
import { validateEaRelations } from "../validate.js";
import { EaRoot } from "../loader.js";
import { resolveConfigV1 } from "../config.js";
import type { BackstageEntity } from "../backstage/types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeEntity(
  overrides: Partial<BackstageEntity> & { kind: string; name: string },
): BackstageEntity {
  const { name, kind, ...rest } = overrides;
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind,
    metadata: {
      name,
      title: `Test ${kind}`,
      description: `A test entity for graph/registry testing.`,
      ...(rest.metadata ?? {}),
    },
    spec: {
      type: "service",
      lifecycle: "production",
      owner: "group:default/test-team",
      ...(rest.spec ?? {}),
    },
    ...("relations" in rest ? { relations: rest.relations } : {}),
  };
}



// ─── RelationRegistry ───────────────────────────────────────────────────────────

describe("RelationRegistry", () => {
  it("registers and retrieves a relation type", () => {
    const registry = new RelationRegistry();
    const entry: RelationRegistryEntry = {
      type: "testRel",
      inverse: "testRelInverse",
      validSourceSchemas: ["application"],
      validTargetSchemas: ["service"],
      allowCycles: false,
      allowExplicitInverse: false,
      description: "A test relation.",
    };
    registry.register(entry);

    expect(registry.get("testRel")).toEqual(entry);
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("returns the inverse type name", () => {
    const registry = new RelationRegistry();
    registry.register({
      type: "uses",
      inverse: "usedBy",
      validSourceSchemas: "*",
      validTargetSchemas: "*",
      allowCycles: false,
      allowExplicitInverse: false,
      description: "uses",
    });

    expect(registry.getInverse("uses")).toBe("usedBy");
    expect(registry.getInverse("unknown")).toBeUndefined();
  });

  it("validates source kinds", () => {
    const registry = new RelationRegistry();
    registry.register({
      type: "exposes",
      inverse: "exposedBy",
      validSourceSchemas: ["application", "service"],
      validTargetSchemas: ["api-contract"],
      allowCycles: false,
      allowExplicitInverse: false,
      description: "exposes",
    });

    expect(registry.isValidSourceSchema("exposes", "application")).toBe(true);
    expect(registry.isValidSourceSchema("exposes", "service")).toBe(true);
    expect(registry.isValidSourceSchema("exposes", "deployment")).toBe(false);
    expect(registry.isValidSourceSchema("unknown", "application")).toBe(false);
  });

  it("validates target kinds", () => {
    const registry = new RelationRegistry();
    registry.register({
      type: "exposes",
      inverse: "exposedBy",
      validSourceSchemas: ["application"],
      validTargetSchemas: ["api-contract", "event-contract"],
      allowCycles: false,
      allowExplicitInverse: false,
      description: "exposes",
    });

    expect(registry.isValidTargetSchema("exposes", "api-contract")).toBe(true);
    expect(registry.isValidTargetSchema("exposes", "event-contract")).toBe(true);
    expect(registry.isValidTargetSchema("exposes", "application")).toBe(false);
  });

  it("accepts wildcard source/target kinds", () => {
    const registry = new RelationRegistry();
    registry.register({
      type: "dependsOn",
      inverse: "dependedOnBy",
      validSourceSchemas: "*",
      validTargetSchemas: "*",
      allowCycles: false,
      allowExplicitInverse: false,
      description: "depends on",
    });

    expect(registry.isValidSourceSchema("dependsOn", "anything")).toBe(true);
    expect(registry.isValidTargetSchema("dependsOn", "anything")).toBe(true);
  });

  it("checks isRegistered for canonical and inverse names", () => {
    const registry = new RelationRegistry();
    registry.register({
      type: "uses",
      inverse: "usedBy",
      validSourceSchemas: "*",
      validTargetSchemas: "*",
      allowCycles: false,
      allowExplicitInverse: false,
      description: "uses",
    });

    expect(registry.isRegistered("uses")).toBe(true);
    expect(registry.isRegistered("usedBy")).toBe(true);
    expect(registry.isRegistered("unknown")).toBe(false);
  });

  it("lists all types and entries", () => {
    const registry = new RelationRegistry();
    registry.register({
      type: "a",
      inverse: "aInv",
      validSourceSchemas: "*",
      validTargetSchemas: "*",
      allowCycles: false,
      allowExplicitInverse: false,
      description: "a",
    });
    registry.register({
      type: "b",
      inverse: "bInv",
      validSourceSchemas: "*",
      validTargetSchemas: "*",
      allowCycles: false,
      allowExplicitInverse: false,
      description: "b",
    });

    expect(registry.allTypes()).toEqual(["a", "b"]);
    expect(registry.allEntries()).toHaveLength(2);
  });

  it("getCanonicalEntry finds entry from inverse name", () => {
    const registry = new RelationRegistry();
    const entry: RelationRegistryEntry = {
      type: "deploys",
      inverse: "deployedBy",
      validSourceSchemas: ["deployment"],
      validTargetSchemas: ["application"],
      allowCycles: false,
      allowExplicitInverse: true,
      description: "deploys",
    };
    registry.register(entry);

    expect(registry.getCanonicalEntry("deploys")).toEqual(entry);
    expect(registry.getCanonicalEntry("deployedBy")).toEqual(entry);
    expect(registry.getCanonicalEntry("unknown")).toBeUndefined();
  });
});

// ─── createDefaultRegistry ──────────────────────────────────────────────────────

describe("createDefaultRegistry", () => {
  it("contains 28 relation types (Phase A + Phase 2A + Phase 2B + Phase 2C + Phase 2D + Phase 2E)", () => {
    const registry = createDefaultRegistry();
    expect(registry.allTypes()).toHaveLength(28);
  });

  it("includes all expected canonical types", () => {
    const registry = createDefaultRegistry();
    const types = registry.allTypes();
    // Phase A
    expect(types).toContain("realizes");
    expect(types).toContain("uses");
    expect(types).toContain("exposes");
    expect(types).toContain("consumes");
    expect(types).toContain("dependsOn");
    expect(types).toContain("deploys");
    expect(types).toContain("runsOn");
    expect(types).toContain("boundedBy");
    expect(types).toContain("authenticatedBy");
    expect(types).toContain("deployedTo");
    // Phase 2A
    expect(types).toContain("interfacesWith");
    expect(types).toContain("standardizes");
    expect(types).toContain("providedBy");
    // Phase 2B
    expect(types).toContain("stores");
    expect(types).toContain("hostedOn");
    expect(types).toContain("lineageFrom");
    expect(types).toContain("implementedBy");
  });

  it("all entries have valid inverse names", () => {
    const registry = createDefaultRegistry();
    for (const entry of registry.allEntries()) {
      expect(entry.inverse).toBeTruthy();
      expect(entry.inverse).not.toBe(entry.type);
    }
  });

  it("dependsOn allows any source/target kind", () => {
    const registry = createDefaultRegistry();
    const entry = registry.get("dependsOn")!;
    expect(entry.validSourceSchemas).toBe("*");
    expect(entry.validTargetSchemas).toBe("*");
  });

  it("deploys allows explicit inverse", () => {
    const registry = createDefaultRegistry();
    expect(registry.get("deploys")!.allowExplicitInverse).toBe(true);
    expect(registry.get("deployedTo")!.allowExplicitInverse).toBe(true);
  });

  it("only lineageFrom allows cycles", () => {
    const registry = createDefaultRegistry();
    for (const entry of registry.allEntries()) {
      if (entry.type === "lineageFrom") {
        expect(entry.allowCycles).toBe(true);
      } else {
        expect(entry.allowCycles).toBe(false);
      }
    }
  });
});

// ─── RelationGraph ──────────────────────────────────────────────────────────────

describe("RelationGraph", () => {
  const registry = createDefaultRegistry();
  const componentRef = (name: string) => `component:default/${name}`;
  const apiRef = (name: string) => `api:default/${name}`;

  function buildTestGraph(): RelationGraph {
    const entities: BackstageEntity[] = [
      makeEntity({
        kind: "Component",
        name: "orders",
        spec: {
          type: "service",
          lifecycle: "production",
          owner: "group:default/test-team",
          dependsOn: ["component:payment"],
          providesApis: ["api:orders"],
        },
      }),
      makeEntity({ kind: "Component", name: "payment" }),
      makeEntity({
        kind: "API",
        name: "orders",
        spec: { type: "openapi", lifecycle: "production", owner: "group:default/test-team", definition: "openapi: 3.0" },
      }),
    ];
    return buildRelationGraph(entities, registry);
  }

  describe("build", () => {
    it("creates nodes for all entities", () => {
      const graph = buildTestGraph();
      expect(graph.nodes()).toHaveLength(3);
      expect(graph.node(componentRef("orders"))).toBeDefined();
      expect(graph.node(componentRef("payment"))).toBeDefined();
      expect(graph.node(apiRef("orders"))).toBeDefined();
    });

    it("creates forward edges from spec relation fields", () => {
      const graph = buildTestGraph();
      const out = graph.outgoing(componentRef("orders"));
      const forward = out.filter((e) => !e.isVirtual);
      expect(forward).toHaveLength(2);
      expect(forward.map((e) => e.type).sort()).toEqual(["dependsOn", "exposes"]);
    });

    it("creates virtual inverse edges", () => {
      const graph = buildTestGraph();
      const paymentOut = graph.outgoing(componentRef("payment"));
      const virtual = paymentOut.filter((e) => e.isVirtual);
      expect(virtual).toHaveLength(1);
      expect(virtual[0]!.type).toBe("dependedOnBy");
      expect(virtual[0]!.target).toBe(componentRef("orders"));
    });

    it("sets correct edge properties", () => {
      const graph = buildTestGraph();
      const forward = graph.outgoing(componentRef("orders")).find((e) => e.type === "dependsOn")!;
      expect(forward.isVirtual).toBe(false);
      expect(forward.source).toBe(componentRef("orders"));
      expect(forward.target).toBe(componentRef("payment"));
      expect(forward.criticality).toBe("medium");
      expect(forward.status).toBe("active");
    });
  });

  describe("queries", () => {
    it("outgoing returns forward + virtual edges from a node", () => {
      const graph = buildTestGraph();
      expect(graph.outgoing(componentRef("orders")).length).toBe(2);
      expect(graph.outgoing("nonexistent")).toEqual([]);
    });

    it("incoming returns all edges pointing to a node", () => {
      const graph = buildTestGraph();
      const incoming = graph.incoming(componentRef("payment"));
      expect(incoming).toHaveLength(1);
      expect(incoming[0]!.source).toBe(componentRef("orders"));
      expect(incoming[0]!.type).toBe("dependsOn");
    });

    it("edgesOfType filters by relation type", () => {
      const graph = buildTestGraph();
      const deps = graph.edgesOfType("dependsOn");
      expect(deps).toHaveLength(1);
      expect(deps[0]!.source).toBe(componentRef("orders"));
    });

    it("edges returns all edges including virtual", () => {
      const graph = buildTestGraph();
      const all = graph.edges();
      // 2 forward + 2 virtual inverses
      expect(all).toHaveLength(4);
    });
  });

  describe("traverse", () => {
    it("follows a relation type from a start node", () => {
      const entities: BackstageEntity[] = [
        makeEntity({
          kind: "Component",
          name: "a",
          spec: { type: "service", lifecycle: "production", owner: "t", dependsOn: ["component:b"] },
        }),
        makeEntity({
          kind: "Component",
          name: "b",
          spec: { type: "service", lifecycle: "production", owner: "t", dependsOn: ["component:c"] },
        }),
        makeEntity({ kind: "Component", name: "c" }),
      ];
      const graph = buildRelationGraph(entities, registry);
      const reachable = graph.traverse(componentRef("a"), "dependsOn");
      expect(reachable.map((n) => n.id)).toEqual([componentRef("b"), componentRef("c")]);
    });

    it("respects maxDepth", () => {
      const entities: BackstageEntity[] = [
        makeEntity({
          kind: "Component",
          name: "a",
          spec: { type: "service", lifecycle: "production", owner: "t", dependsOn: ["component:b"] },
        }),
        makeEntity({
          kind: "Component",
          name: "b",
          spec: { type: "service", lifecycle: "production", owner: "t", dependsOn: ["component:c"] },
        }),
        makeEntity({ kind: "Component", name: "c" }),
      ];
      const graph = buildRelationGraph(entities, registry);
      const reachable = graph.traverse(componentRef("a"), "dependsOn", 1);
      expect(reachable.map((n) => n.id)).toEqual([componentRef("b")]);
    });

    it("returns empty for no matching edges", () => {
      const graph = buildTestGraph();
      const reachable = graph.traverse(componentRef("orders"), "runsOn");
      expect(reachable).toEqual([]);
    });
  });

  describe("impactSet", () => {
    it("computes transitive impact via incoming edges", () => {
      const entities: BackstageEntity[] = [
        makeEntity({
          kind: "Component",
          name: "a",
          spec: { type: "service", lifecycle: "production", owner: "t", dependsOn: ["component:core"] },
        }),
        makeEntity({
          kind: "Component",
          name: "b",
          spec: { type: "service", lifecycle: "production", owner: "t", dependsOn: ["component:core"] },
        }),
        makeEntity({ kind: "Component", name: "core" }),
      ];
      const graph = buildRelationGraph(entities, registry);
      const impacted = graph.impactSet(componentRef("core"));
      expect(impacted.map((n) => n.id).sort()).toEqual([componentRef("a"), componentRef("b")]);
    });

    it("returns empty for leaf nodes with no incoming edges", () => {
      const entities: BackstageEntity[] = [
        makeEntity({ kind: "Component", name: "isolated" }),
      ];
      const graph = buildRelationGraph(entities, registry);
      const impacted = graph.impactSet(componentRef("isolated"));
      expect(impacted).toHaveLength(0);
    });
  });

  describe("detectCycles", () => {
    it("detects a simple cycle", () => {
      const entities: BackstageEntity[] = [
        makeEntity({
          kind: "Component",
          name: "a",
          spec: { type: "service", lifecycle: "production", owner: "t", dependsOn: ["component:b"] },
        }),
        makeEntity({
          kind: "Component",
          name: "b",
          spec: { type: "service", lifecycle: "production", owner: "t", dependsOn: ["component:a"] },
        }),
      ];
      const graph = buildRelationGraph(entities, registry);
      const cycles = graph.detectCycles("dependsOn");
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]!).toContain(componentRef("a"));
      expect(cycles[0]!).toContain(componentRef("b"));
    });

    it("returns empty when no cycles exist", () => {
      const graph = buildTestGraph();
      const cycles = graph.detectCycles("dependsOn");
      expect(cycles).toHaveLength(0);
    });

    it("detects cycles only in the specified relation type", () => {
      const entities: BackstageEntity[] = [
        makeEntity({
          kind: "Component",
          name: "a",
          spec: {
            type: "service", lifecycle: "production", owner: "t",
            dependsOn: ["component:b"],
            consumesApis: ["component:b"],
          },
        }),
        makeEntity({
          kind: "Component",
          name: "b",
          spec: { type: "service", lifecycle: "production", owner: "t", dependsOn: ["component:a"] },
        }),
      ];
      const graph = buildRelationGraph(entities, registry);
      expect(graph.detectCycles("dependsOn").length).toBeGreaterThan(0);
      expect(graph.detectCycles("uses")).toHaveLength(0);
    });
  });

  describe("export — toMermaid", () => {
    it("produces valid Mermaid output", () => {
      const graph = buildTestGraph();
      const mermaid = graph.toMermaid();
      expect(mermaid).toContain("graph LR");
      expect(mermaid).toContain("orders");
      expect(mermaid).toContain("-->|dependsOn|");
      expect(mermaid).toContain("-->|exposes|");
    });

    it("respects direction option", () => {
      const graph = buildTestGraph();
      const mermaid = graph.toMermaid({ direction: "TB" });
      expect(mermaid).toContain("graph TB");
    });

    it("applies filter", () => {
      const graph = buildTestGraph();
      const mermaid = graph.toMermaid({
        filter: (e) => e.type === "dependsOn",
      });
      expect(mermaid).toContain("-->|dependsOn|");
      expect(mermaid).not.toContain("-->|exposes|");
    });

    it("excludes virtual edges by default", () => {
      const graph = buildTestGraph();
      const mermaid = graph.toMermaid();
      expect(mermaid).not.toContain("dependedOnBy");
      expect(mermaid).not.toContain("exposedBy");
    });
  });

  describe("export — toDot", () => {
    it("produces valid DOT output", () => {
      const graph = buildTestGraph();
      const dot = graph.toDot();
      expect(dot).toContain("digraph EA {");
      expect(dot).toContain("rankdir=LR;");
      expect(dot).toContain("[label=");
      expect(dot).toContain('label="dependsOn"');
      expect(dot).toContain("}");
    });

    it("applies filter", () => {
      const graph = buildTestGraph();
      const dot = graph.toDot({ filter: (e) => e.type === "exposes" });
      expect(dot).toContain('label="exposes"');
      expect(dot).not.toContain('label="dependsOn"');
    });
  });

  describe("export — toAdjacencyJson", () => {
    it("returns adjacency list with virtual markers", () => {
      const graph = buildTestGraph();
      const adj = graph.toAdjacencyJson();

      expect(adj[componentRef("orders")]).toBeDefined();
      expect(adj[componentRef("orders")]).toHaveLength(2);

      // Virtual inverse on payment
      const paymentAdj = adj[componentRef("payment")];
      expect(paymentAdj).toBeDefined();
      expect(paymentAdj!.some((e) => e.virtual === true)).toBe(true);
    });
  });
});

// ─── validateEaRelations ────────────────────────────────────────────────────────────────

describe("validateEaRelations", () => {
  const registry = createDefaultRegistry();

  describe("ea:relation:self-reference", () => {
    it("errors on self-referencing relation", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-self", spec: { type: "website", lifecycle: "production", owner: undefined, dependsOn: ["component:app-self"] } }),
      ];
      const result = validateEaRelations(entities, registry);
      expect(result.errors.filter((e) => e.rule === "ea:relation:self-reference")).toHaveLength(1);
    });
  });

  describe("ea:relation:target-missing", () => {
    it("errors when target does not exist", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-src", spec: { type: "website", lifecycle: "production", owner: undefined, dependsOn: ["component:svc-nonexistent"] } }),
      ];
      const result = validateEaRelations(entities, registry);
      expect(result.errors.filter((e) => e.rule === "ea:relation:target-missing")).toHaveLength(1);
    });

    it("passes when target exists", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-src", spec: { type: "website", lifecycle: "production", owner: undefined, dependsOn: ["component:svc-tgt"] } }),
        makeEntity({ kind: "Component", name: "svc-tgt", spec: { owner: undefined } }),
      ];
      const result = validateEaRelations(entities, registry);
      expect(result.errors.filter((e) => e.rule === "ea:relation:target-missing")).toHaveLength(0);
    });
  });

  describe("ea:relation:unknown-type", () => {
    it("warns on unregistered relation type", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-src", spec: { type: "website", lifecycle: "production", owner: undefined,  }, relations: [{ type: "unknownRelType", targetRef: "component:svc-tgt" }] }),
        makeEntity({ kind: "Component", name: "svc-tgt", spec: { owner: undefined } }),
      ];
      const result = validateEaRelations(entities, registry);
      const warns = result.warnings.filter((e) => e.rule === "ea:relation:unknown-type");
      expect(warns).toHaveLength(1);
      expect(warns[0].message).toContain("unregistered relation type");
    });

    it("suggests canonical type when virtual inverse is used directly", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-src", spec: { type: "website", lifecycle: "production", owner: undefined,  }, relations: [{ type: "ownerOf", targetRef: "component:svc-tgt" }] }),
        makeEntity({ kind: "Component", name: "svc-tgt", spec: { owner: undefined } }),
      ];
      const result = validateEaRelations(entities, registry);
      const warns = result.warnings.filter((e) => e.rule === "ea:relation:unknown-type");
      expect(warns).toHaveLength(1);
      expect(warns[0].message).toContain("virtual inverse");
      expect(warns[0].message).toContain('"ownedBy"');
    });

    it("gives generic message for truly unknown types, not inverse hint", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-src", spec: { type: "website", lifecycle: "production", owner: undefined,  }, relations: [{ type: "totallyFakeType", targetRef: "component:svc-tgt" }] }),
        makeEntity({ kind: "Component", name: "svc-tgt", spec: { owner: undefined } }),
      ];
      const result = validateEaRelations(entities, registry);
      const warns = result.warnings.filter((e) => e.rule === "ea:relation:unknown-type");
      expect(warns).toHaveLength(1);
      expect(warns[0].message).toContain("unregistered relation type");
      expect(warns[0].message).not.toContain("virtual inverse");
    });
  });

  describe("ea:relation:invalid-source", () => {
    it("errors when source kind is not valid for the relation type", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-src", spec: { type: "website", lifecycle: "production", owner: undefined, deploys: ["component:svc-tgt"] } }),
        makeEntity({ kind: "Component", name: "svc-tgt", spec: { owner: undefined } }),
      ];
      const result = validateEaRelations(entities, registry);
      expect(result.errors.filter((e) => e.rule === "ea:relation:invalid-source")).toHaveLength(1);
    });

    it("passes for wildcard source kinds", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "plat-src", spec: { type: "service", lifecycle: "production", owner: undefined, dependsOn: ["component:plat-tgt"] } }),
        makeEntity({ kind: "Component", name: "plat-tgt", spec: { owner: undefined } }),
      ];
      const result = validateEaRelations(entities, registry);
      expect(result.errors.filter((e) => e.rule === "ea:relation:invalid-source")).toHaveLength(0);
    });

    it("treats spec.owner as canonical ownedBy relation", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-src", spec: { type: "service", lifecycle: "production", owner: "group:default/test-team" } }),
        makeEntity({
          kind: "Group",
          name: "test-team",
          spec: { type: "team", children: [] },
        }),
      ];
      const result = validateEaRelations(entities, registry);
      expect(result.errors.filter((e) => e.rule === "ea:relation:invalid-source")).toHaveLength(0);
      expect(result.errors.filter((e) => e.rule === "ea:relation:target-missing")).toHaveLength(0);
      expect(result.warnings.filter((e) => e.rule === "ea:relation:unknown-type")).toHaveLength(0);
    });
  });

  describe("ea:relation:invalid-target", () => {
    it("errors when target kind is not valid for the relation type", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-src", spec: { type: "website", lifecycle: "production", owner: undefined, providesApis: ["component:svc-tgt"] } }),
        makeEntity({ kind: "Component", name: "svc-tgt", spec: { owner: undefined } }),
      ];
      const result = validateEaRelations(entities, registry);
      expect(result.errors.filter((e) => e.rule === "ea:relation:invalid-target")).toHaveLength(1);
    });
  });

  describe("ea:relation:retired-target", () => {
    it("warns when targeting a retired entity", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-src", spec: { type: "website", lifecycle: "production", owner: undefined, dependsOn: ["component:svc-retired"] } }),
        makeEntity({ kind: "Component", name: "svc-retired", spec: { type: "service", lifecycle: "retired", owner: undefined,  } }),
      ];
      const result = validateEaRelations(entities, registry);
      expect(result.warnings.filter((e) => e.rule === "ea:relation:retired-target")).toHaveLength(1);
    });
  });

  describe("ea:relation:draft-target", () => {
    it("warns when active entity references draft target", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-active", spec: { type: "website", lifecycle: "production", owner: undefined, dependsOn: ["component:svc-draft"] } }),
        makeEntity({ kind: "Component", name: "svc-draft", spec: { type: "service", lifecycle: "experimental", owner: undefined,  } }),
      ];
      const result = validateEaRelations(entities, registry);
      expect(result.warnings.filter((e) => e.rule === "ea:relation:draft-target")).toHaveLength(1);
    });

    it("does not warn for draft-to-draft", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-draft", spec: { type: "website", lifecycle: "experimental", owner: undefined, dependsOn: ["component:svc-draft"] } }),
        makeEntity({ kind: "Component", name: "svc-draft", spec: { type: "service", lifecycle: "experimental", owner: undefined,  } }),
      ];
      const result = validateEaRelations(entities, registry);
      expect(result.warnings.filter((e) => e.rule === "ea:relation:draft-target")).toHaveLength(0);
    });
  });

  describe("ea:relation:duplicate", () => {
    it("warns on duplicate relations", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-src", spec: { type: "website", lifecycle: "production", owner: undefined, dependsOn: ["component:svc-tgt", "component:svc-tgt"] } }),
        makeEntity({ kind: "Component", name: "svc-tgt", spec: { owner: undefined } }),
      ];
      const result = validateEaRelations(entities, registry);
      expect(result.warnings.filter((e) => e.rule === "ea:relation:duplicate")).toHaveLength(1);
    });
  });

  describe("combined result", () => {
    it("valid is false when errors exist", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-src", spec: { type: "website", lifecycle: "production", owner: undefined, dependsOn: ["component:app-src"] } }),
      ];
      const result = validateEaRelations(entities, registry);
      expect(result.valid).toBe(false);
    });

    it("valid is true with only warnings", () => {
      const entities = [
        makeEntity({ kind: "Component", name: "app-src", spec: { type: "website", lifecycle: "production", owner: undefined,  }, relations: [{ type: "foobar", targetRef: "component:svc-tgt" }] }),
        makeEntity({ kind: "Component", name: "svc-tgt", spec: { owner: undefined } }),
      ];
      const result = validateEaRelations(entities, registry);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

// ─── Integration: build graph from manifest fixture ─────────────────────────────

describe("Integration: graph from manifest fixture", () => {
  const projectRoot = join(__dirname, "..", "..", "..");

  it("builds a graph from example entities", async () => {
    const root = new EaRoot(projectRoot, resolveConfigV1());

    const { entities } = await root.loadEntities();
    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(entities, registry);

    expect(graph.nodes().length).toBeGreaterThan(0);
    expect(graph.edges().length).toBeGreaterThan(0);
  });

  it("generates valid Mermaid output from examples", async () => {
    const root = new EaRoot(projectRoot, resolveConfigV1());

    const { entities } = await root.loadEntities();
    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(entities, registry);
    const mermaid = graph.toMermaid();

    expect(mermaid).toContain("graph LR");
    expect(mermaid.length).toBeGreaterThan(50);
  });

  it("generates valid DOT output from examples", async () => {
    const root = new EaRoot(projectRoot, resolveConfigV1());

    const { entities } = await root.loadEntities();
    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(entities, registry);
    const dot = graph.toDot();

    expect(dot).toContain("digraph EA {");
    expect(dot).toContain("}");
  });
});

// ─── traverseWithPaths ──────────────────────────────────────────────────────────

describe("traverseWithPaths", () => {
  function makeNode(id: string): import("../graph.js").GraphNode {
    return {
      id,
      kind: "Component",
      domain: "application" as const,
      status: "active" as const,
      title: id,
      confidence: "declared" as const,
    };
  }

  function makeEdge(
    source: string,
    target: string,
    type = "dependsOn",
  ): import("../graph.js").GraphEdge {
    return {
      source,
      target,
      type,
      isVirtual: false,
      criticality: "medium" as const,
      confidence: "declared" as const,
      status: "active" as const,
    };
  }

  it("records shortest paths for incoming traversal (3-node chain)", () => {
    // A --dependsOn--> B --dependsOn--> C
    // incoming from C: B (depth 1), A (depth 2)
    const graph = new RelationGraph();
    graph.addNode(makeNode("A"));
    graph.addNode(makeNode("B"));
    graph.addNode(makeNode("C"));
    graph.addEdge(makeEdge("A", "B", "dependsOn"));
    graph.addEdge(makeEdge("B", "C", "dependsOn"));

    const result = graph.traverseWithPaths("C", { direction: "incoming" });

    expect(result.size).toBe(2);

    const pathB = result.get("B")!;
    expect(pathB.depth).toBe(1);
    expect(pathB.path).toHaveLength(1);
    expect(pathB.path[0].source).toBe("B");
    expect(pathB.path[0].target).toBe("C");
    expect(pathB.evidence).toEqual(["B --[dependsOn]--> C"]);

    const pathA = result.get("A")!;
    expect(pathA.depth).toBe(2);
    expect(pathA.path).toHaveLength(2);
    expect(pathA.evidence).toEqual([
      "B --[dependsOn]--> C",
      "A --[dependsOn]--> B",
    ]);
  });

  it("records shortest paths for outgoing traversal", () => {
    const graph = new RelationGraph();
    graph.addNode(makeNode("A"));
    graph.addNode(makeNode("B"));
    graph.addNode(makeNode("C"));
    graph.addEdge(makeEdge("A", "B", "dependsOn"));
    graph.addEdge(makeEdge("B", "C", "dependsOn"));

    const result = graph.traverseWithPaths("A", { direction: "outgoing" });

    expect(result.size).toBe(2);
    expect(result.get("B")!.depth).toBe(1);
    expect(result.get("C")!.depth).toBe(2);
  });

  it("filters edges by type", () => {
    const graph = new RelationGraph();
    graph.addNode(makeNode("A"));
    graph.addNode(makeNode("B"));
    graph.addNode(makeNode("C"));
    graph.addEdge(makeEdge("A", "B", "dependsOn"));
    graph.addEdge(makeEdge("B", "C", "uses")); // different type

    const result = graph.traverseWithPaths("A", {
      direction: "outgoing",
      edgeTypeFilter: ["dependsOn"],
    });

    expect(result.size).toBe(1);
    expect(result.has("B")).toBe(true);
    expect(result.has("C")).toBe(false);
  });

  it("respects maxDepth", () => {
    const graph = new RelationGraph();
    graph.addNode(makeNode("A"));
    graph.addNode(makeNode("B"));
    graph.addNode(makeNode("C"));
    graph.addEdge(makeEdge("A", "B", "dependsOn"));
    graph.addEdge(makeEdge("B", "C", "dependsOn"));

    const result = graph.traverseWithPaths("A", {
      direction: "outgoing",
      maxDepth: 1,
    });

    expect(result.size).toBe(1);
    expect(result.has("B")).toBe(true);
    expect(result.has("C")).toBe(false);
  });

  it("supports bidirectional traversal", () => {
    // A --> B --> C, start from B, both directions
    const graph = new RelationGraph();
    graph.addNode(makeNode("A"));
    graph.addNode(makeNode("B"));
    graph.addNode(makeNode("C"));
    graph.addEdge(makeEdge("A", "B", "dependsOn"));
    graph.addEdge(makeEdge("B", "C", "dependsOn"));

    const result = graph.traverseWithPaths("B", { direction: "both" });

    expect(result.size).toBe(2);
    expect(result.has("A")).toBe(true);
    expect(result.has("C")).toBe(true);
  });

  it("returns empty map when start node is not in graph", () => {
    const graph = new RelationGraph();
    graph.addNode(makeNode("A"));

    const result = graph.traverseWithPaths("nonexistent");

    expect(result.size).toBe(0);
  });

  it("handles cycles without infinite loops", () => {
    // A --> B --> C --> A (cycle)
    const graph = new RelationGraph();
    graph.addNode(makeNode("A"));
    graph.addNode(makeNode("B"));
    graph.addNode(makeNode("C"));
    graph.addEdge(makeEdge("A", "B", "dependsOn"));
    graph.addEdge(makeEdge("B", "C", "dependsOn"));
    graph.addEdge(makeEdge("C", "A", "dependsOn"));

    const result = graph.traverseWithPaths("A", { direction: "outgoing" });

    // Should find B and C but not loop back to A
    expect(result.size).toBe(2);
    expect(result.has("B")).toBe(true);
    expect(result.has("C")).toBe(true);
    expect(result.has("A")).toBe(false);
  });
});

// ─── TRAVERSAL_PROFILES ─────────────────────────────────────────────────────────

describe("TRAVERSAL_PROFILES", () => {
  it("exposes all three profiles", () => {
    expect(TRAVERSAL_PROFILES).toHaveProperty("strict");
    expect(TRAVERSAL_PROFILES).toHaveProperty("broad");
    expect(TRAVERSAL_PROFILES).toHaveProperty("contract");
  });

  it("strict profile excludes driftStrategy=none relations", () => {
    const strict = getTraversalProfile("strict");
    expect(strict.edgeTypes).not.toContain("owns");
    expect(strict.edgeTypes).not.toContain("supersedes");
    expect(strict.edgeTypes).not.toContain("mitigates");
    expect(strict.edgeTypes.length).toBeGreaterThan(0);
  });

  it("broad profile has empty edgeTypes (no filter)", () => {
    const broad = getTraversalProfile("broad");
    expect(broad.edgeTypes).toEqual([]);
  });

  it("contract profile contains exactly the expected edge types", () => {
    const contract = getTraversalProfile("contract");
    expect(contract.edgeTypes).toEqual(
      expect.arrayContaining(["consumes", "exposes", "interfacesWith", "dependsOn", "realizes"]),
    );
    expect(contract.edgeTypes).toHaveLength(5);
  });
});
