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
  type RelationRegistryEntry,
} from "../relation-registry.js";
import { RelationGraph, buildRelationGraph } from "../graph.js";
import { validateEaRelations } from "../validate.js";
import { EaRoot } from "../loader.js";
import type { EaArtifactBase } from "../types.js";
import type { AnchoredSpecConfig } from "../../core/types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeArtifact(
  overrides: Partial<EaArtifactBase> & { id: string; kind: string }
): EaArtifactBase {
  return {
    schemaVersion: "1.0.0",
    title: `Test ${overrides.kind}`,
    status: "active",
    summary: "A test artifact for graph/registry testing purposes.",
    owners: ["test-team"],
    confidence: "declared",
    ...overrides,
  } as EaArtifactBase;
}

// ─── RelationRegistry ───────────────────────────────────────────────────────────

describe("RelationRegistry", () => {
  it("registers and retrieves a relation type", () => {
    const registry = new RelationRegistry();
    const entry: RelationRegistryEntry = {
      type: "testRel",
      inverse: "testRelInverse",
      validSourceKinds: ["application"],
      validTargetKinds: ["service"],
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
      validSourceKinds: "*",
      validTargetKinds: "*",
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
      validSourceKinds: ["application", "service"],
      validTargetKinds: ["api-contract"],
      allowCycles: false,
      allowExplicitInverse: false,
      description: "exposes",
    });

    expect(registry.isValidSource("exposes", "application")).toBe(true);
    expect(registry.isValidSource("exposes", "service")).toBe(true);
    expect(registry.isValidSource("exposes", "deployment")).toBe(false);
    expect(registry.isValidSource("unknown", "application")).toBe(false);
  });

  it("validates target kinds", () => {
    const registry = new RelationRegistry();
    registry.register({
      type: "exposes",
      inverse: "exposedBy",
      validSourceKinds: ["application"],
      validTargetKinds: ["api-contract", "event-contract"],
      allowCycles: false,
      allowExplicitInverse: false,
      description: "exposes",
    });

    expect(registry.isValidTarget("exposes", "api-contract")).toBe(true);
    expect(registry.isValidTarget("exposes", "event-contract")).toBe(true);
    expect(registry.isValidTarget("exposes", "application")).toBe(false);
  });

  it("accepts wildcard source/target kinds", () => {
    const registry = new RelationRegistry();
    registry.register({
      type: "dependsOn",
      inverse: "dependedOnBy",
      validSourceKinds: "*",
      validTargetKinds: "*",
      allowCycles: false,
      allowExplicitInverse: false,
      description: "depends on",
    });

    expect(registry.isValidSource("dependsOn", "anything")).toBe(true);
    expect(registry.isValidTarget("dependsOn", "anything")).toBe(true);
  });

  it("checks isRegistered for canonical and inverse names", () => {
    const registry = new RelationRegistry();
    registry.register({
      type: "uses",
      inverse: "usedBy",
      validSourceKinds: "*",
      validTargetKinds: "*",
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
      validSourceKinds: "*",
      validTargetKinds: "*",
      allowCycles: false,
      allowExplicitInverse: false,
      description: "a",
    });
    registry.register({
      type: "b",
      inverse: "bInv",
      validSourceKinds: "*",
      validTargetKinds: "*",
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
      validSourceKinds: ["deployment"],
      validTargetKinds: ["application"],
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
  it("contains 13 relation types (Phase A + Phase 2A)", () => {
    const registry = createDefaultRegistry();
    expect(registry.allTypes()).toHaveLength(13);
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
    expect(entry.validSourceKinds).toBe("*");
    expect(entry.validTargetKinds).toBe("*");
  });

  it("deploys allows explicit inverse", () => {
    const registry = createDefaultRegistry();
    expect(registry.get("deploys")!.allowExplicitInverse).toBe(true);
    expect(registry.get("deployedTo")!.allowExplicitInverse).toBe(true);
  });

  it("no Phase A relations allow cycles", () => {
    const registry = createDefaultRegistry();
    for (const entry of registry.allEntries()) {
      expect(entry.allowCycles).toBe(false);
    }
  });
});

// ─── RelationGraph ──────────────────────────────────────────────────────────────

describe("RelationGraph", () => {
  const registry = createDefaultRegistry();

  function buildTestGraph(): RelationGraph {
    const artifacts: EaArtifactBase[] = [
      makeArtifact({
        id: "APP-orders",
        kind: "application",
        relations: [
          { type: "dependsOn", target: "SVC-payment" },
          { type: "exposes", target: "API-orders" },
        ],
      }),
      makeArtifact({ id: "SVC-payment", kind: "service" }),
      makeArtifact({ id: "API-orders", kind: "api-contract" }),
    ];
    return buildRelationGraph(artifacts, registry);
  }

  describe("build", () => {
    it("creates nodes for all artifacts", () => {
      const graph = buildTestGraph();
      expect(graph.nodes()).toHaveLength(3);
      expect(graph.node("APP-orders")).toBeDefined();
      expect(graph.node("SVC-payment")).toBeDefined();
      expect(graph.node("API-orders")).toBeDefined();
    });

    it("creates forward edges from relations", () => {
      const graph = buildTestGraph();
      const out = graph.outgoing("APP-orders");
      const forward = out.filter((e) => !e.isVirtual);
      expect(forward).toHaveLength(2);
      expect(forward.map((e) => e.type).sort()).toEqual(["dependsOn", "exposes"]);
    });

    it("creates virtual inverse edges", () => {
      const graph = buildTestGraph();
      const paymentOut = graph.outgoing("SVC-payment");
      const virtual = paymentOut.filter((e) => e.isVirtual);
      expect(virtual).toHaveLength(1);
      expect(virtual[0].type).toBe("dependedOnBy");
      expect(virtual[0].target).toBe("APP-orders");
    });

    it("sets correct edge properties", () => {
      const graph = buildTestGraph();
      const forward = graph.outgoing("APP-orders").find((e) => e.type === "dependsOn")!;
      expect(forward.isVirtual).toBe(false);
      expect(forward.source).toBe("APP-orders");
      expect(forward.target).toBe("SVC-payment");
      expect(forward.criticality).toBe("medium"); // default
      expect(forward.status).toBe("active"); // default
    });
  });

  describe("queries", () => {
    it("outgoing returns forward + virtual edges from a node", () => {
      const graph = buildTestGraph();
      expect(graph.outgoing("APP-orders").length).toBe(2);
      expect(graph.outgoing("nonexistent")).toEqual([]);
    });

    it("incoming returns all edges pointing to a node", () => {
      const graph = buildTestGraph();
      const incoming = graph.incoming("SVC-payment");
      expect(incoming).toHaveLength(1);
      expect(incoming[0].source).toBe("APP-orders");
      expect(incoming[0].type).toBe("dependsOn");
    });

    it("edgesOfType filters by relation type", () => {
      const graph = buildTestGraph();
      const deps = graph.edgesOfType("dependsOn");
      expect(deps).toHaveLength(1);
      expect(deps[0].source).toBe("APP-orders");
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
      const artifacts: EaArtifactBase[] = [
        makeArtifact({
          id: "APP-a",
          kind: "application",
          relations: [{ type: "dependsOn", target: "APP-b" }],
        }),
        makeArtifact({
          id: "APP-b",
          kind: "application",
          relations: [{ type: "dependsOn", target: "APP-c" }],
        }),
        makeArtifact({ id: "APP-c", kind: "application" }),
      ];
      const graph = buildRelationGraph(artifacts, registry);
      const reachable = graph.traverse("APP-a", "dependsOn");
      expect(reachable.map((n) => n.id)).toEqual(["APP-b", "APP-c"]);
    });

    it("respects maxDepth", () => {
      const artifacts: EaArtifactBase[] = [
        makeArtifact({
          id: "APP-a",
          kind: "application",
          relations: [{ type: "dependsOn", target: "APP-b" }],
        }),
        makeArtifact({
          id: "APP-b",
          kind: "application",
          relations: [{ type: "dependsOn", target: "APP-c" }],
        }),
        makeArtifact({ id: "APP-c", kind: "application" }),
      ];
      const graph = buildRelationGraph(artifacts, registry);
      const reachable = graph.traverse("APP-a", "dependsOn", 1);
      expect(reachable.map((n) => n.id)).toEqual(["APP-b"]);
    });

    it("returns empty for no matching edges", () => {
      const graph = buildTestGraph();
      const reachable = graph.traverse("APP-orders", "runsOn");
      expect(reachable).toEqual([]);
    });
  });

  describe("impactSet", () => {
    it("computes transitive impact via incoming edges", () => {
      const artifacts: EaArtifactBase[] = [
        makeArtifact({
          id: "APP-a",
          kind: "application",
          relations: [{ type: "dependsOn", target: "SVC-core" }],
        }),
        makeArtifact({
          id: "APP-b",
          kind: "application",
          relations: [{ type: "dependsOn", target: "SVC-core" }],
        }),
        makeArtifact({ id: "SVC-core", kind: "service" }),
      ];
      const graph = buildRelationGraph(artifacts, registry);
      const impacted = graph.impactSet("SVC-core");
      expect(impacted.map((n) => n.id).sort()).toEqual(["APP-a", "APP-b"]);
    });

    it("returns empty for leaf nodes with no incoming edges", () => {
      // In the test graph, APP-orders has outgoing edges but SVC-payment
      // and API-orders have virtual inverse edges pointing back to APP-orders,
      // so APP-orders actually has incoming edges. Test with an isolated node.
      const artifacts: EaArtifactBase[] = [
        makeArtifact({ id: "APP-isolated", kind: "application" }),
      ];
      const graph = buildRelationGraph(artifacts, registry);
      const impacted = graph.impactSet("APP-isolated");
      expect(impacted).toHaveLength(0);
    });
  });

  describe("detectCycles", () => {
    it("detects a simple cycle", () => {
      const artifacts: EaArtifactBase[] = [
        makeArtifact({
          id: "APP-a",
          kind: "application",
          relations: [{ type: "dependsOn", target: "APP-b" }],
        }),
        makeArtifact({
          id: "APP-b",
          kind: "application",
          relations: [{ type: "dependsOn", target: "APP-a" }],
        }),
      ];
      const graph = buildRelationGraph(artifacts, registry);
      const cycles = graph.detectCycles("dependsOn");
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain("APP-a");
      expect(cycles[0]).toContain("APP-b");
    });

    it("returns empty when no cycles exist", () => {
      const graph = buildTestGraph();
      const cycles = graph.detectCycles("dependsOn");
      expect(cycles).toHaveLength(0);
    });

    it("detects cycles only in the specified relation type", () => {
      const artifacts: EaArtifactBase[] = [
        makeArtifact({
          id: "APP-a",
          kind: "application",
          relations: [
            { type: "dependsOn", target: "APP-b" },
            { type: "uses", target: "APP-b" },
          ],
        }),
        makeArtifact({
          id: "APP-b",
          kind: "application",
          relations: [{ type: "dependsOn", target: "APP-a" }],
        }),
      ];
      const graph = buildRelationGraph(artifacts, registry);
      expect(graph.detectCycles("dependsOn").length).toBeGreaterThan(0);
      expect(graph.detectCycles("uses")).toHaveLength(0);
    });
  });

  describe("export — toMermaid", () => {
    it("produces valid Mermaid output", () => {
      const graph = buildTestGraph();
      const mermaid = graph.toMermaid();
      expect(mermaid).toContain("graph LR");
      expect(mermaid).toContain("APP-orders");
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

      expect(adj["APP-orders"]).toBeDefined();
      expect(adj["APP-orders"]).toHaveLength(2);

      // Virtual inverse on SVC-payment
      const paymentAdj = adj["SVC-payment"];
      expect(paymentAdj).toBeDefined();
      expect(paymentAdj.some((e) => e.virtual === true)).toBe(true);
    });
  });
});

// ─── validateEaRelations ────────────────────────────────────────────────────────

describe("validateEaRelations", () => {
  const registry = createDefaultRegistry();

  describe("ea:relation:self-reference", () => {
    it("errors on self-referencing relation", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-self",
          kind: "application",
          relations: [{ type: "dependsOn", target: "APP-self" }],
        }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const errs = result.errors.filter((e) => e.rule === "ea:relation:self-reference");
      expect(errs).toHaveLength(1);
    });
  });

  describe("ea:relation:target-missing", () => {
    it("errors when target does not exist", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-src",
          kind: "application",
          relations: [{ type: "dependsOn", target: "SVC-nonexistent" }],
        }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const errs = result.errors.filter((e) => e.rule === "ea:relation:target-missing");
      expect(errs).toHaveLength(1);
    });

    it("passes when target exists", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-src",
          kind: "application",
          relations: [{ type: "dependsOn", target: "SVC-tgt" }],
        }),
        makeArtifact({ id: "SVC-tgt", kind: "service" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const errs = result.errors.filter((e) => e.rule === "ea:relation:target-missing");
      expect(errs).toHaveLength(0);
    });
  });

  describe("ea:relation:unknown-type", () => {
    it("warns on unregistered relation type", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-src",
          kind: "application",
          relations: [{ type: "unknownRelType", target: "SVC-tgt" }],
        }),
        makeArtifact({ id: "SVC-tgt", kind: "service" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const warns = result.warnings.filter((e) => e.rule === "ea:relation:unknown-type");
      expect(warns).toHaveLength(1);
    });
  });

  describe("ea:relation:invalid-source", () => {
    it("errors when source kind is not valid for the relation type", () => {
      // "deploys" only valid from "deployment" kind
      const artifacts = [
        makeArtifact({
          id: "APP-src",
          kind: "application",
          relations: [{ type: "deploys", target: "SVC-tgt" }],
        }),
        makeArtifact({ id: "SVC-tgt", kind: "service" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const errs = result.errors.filter((e) => e.rule === "ea:relation:invalid-source");
      expect(errs).toHaveLength(1);
    });

    it("passes for wildcard source kinds", () => {
      const artifacts = [
        makeArtifact({
          id: "PLAT-src",
          kind: "platform",
          relations: [{ type: "dependsOn", target: "PLAT-tgt" }],
        }),
        makeArtifact({ id: "PLAT-tgt", kind: "platform" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const errs = result.errors.filter((e) => e.rule === "ea:relation:invalid-source");
      expect(errs).toHaveLength(0);
    });
  });

  describe("ea:relation:invalid-target", () => {
    it("errors when target kind is not valid for the relation type", () => {
      // "exposes" target must be api-contract or event-contract
      const artifacts = [
        makeArtifact({
          id: "APP-src",
          kind: "application",
          relations: [{ type: "exposes", target: "SVC-tgt" }],
        }),
        makeArtifact({ id: "SVC-tgt", kind: "service" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const errs = result.errors.filter((e) => e.rule === "ea:relation:invalid-target");
      expect(errs).toHaveLength(1);
    });
  });

  describe("ea:relation:retired-target", () => {
    it("warns when targeting a retired artifact", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-src",
          kind: "application",
          relations: [{ type: "dependsOn", target: "SVC-retired" }],
        }),
        makeArtifact({ id: "SVC-retired", kind: "service", status: "retired" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const warns = result.warnings.filter((e) => e.rule === "ea:relation:retired-target");
      expect(warns).toHaveLength(1);
    });
  });

  describe("ea:relation:draft-target", () => {
    it("warns when active artifact references draft target", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-active",
          kind: "application",
          status: "active",
          relations: [{ type: "dependsOn", target: "SVC-draft" }],
        }),
        makeArtifact({ id: "SVC-draft", kind: "service", status: "draft" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const warns = result.warnings.filter((e) => e.rule === "ea:relation:draft-target");
      expect(warns).toHaveLength(1);
    });

    it("does not warn for draft-to-draft", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-draft",
          kind: "application",
          status: "draft",
          relations: [{ type: "dependsOn", target: "SVC-draft" }],
        }),
        makeArtifact({ id: "SVC-draft", kind: "service", status: "draft" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const warns = result.warnings.filter((e) => e.rule === "ea:relation:draft-target");
      expect(warns).toHaveLength(0);
    });
  });

  describe("ea:relation:duplicate", () => {
    it("warns on duplicate relations", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-src",
          kind: "application",
          relations: [
            { type: "dependsOn", target: "SVC-tgt" },
            { type: "dependsOn", target: "SVC-tgt" },
          ],
        }),
        makeArtifact({ id: "SVC-tgt", kind: "service" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const warns = result.warnings.filter((e) => e.rule === "ea:relation:duplicate");
      expect(warns).toHaveLength(1);
    });
  });

  describe("combined result", () => {
    it("valid is false when errors exist", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-src",
          kind: "application",
          relations: [{ type: "dependsOn", target: "APP-src" }],
        }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.valid).toBe(false);
    });

    it("valid is true with only warnings", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-src",
          kind: "application",
          relations: [{ type: "foobar", target: "SVC-tgt" }],
        }),
        makeArtifact({ id: "SVC-tgt", kind: "service" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

// ─── Integration: build graph from examples/ea/ ─────────────────────────────────

describe("Integration: graph from examples/ea/", () => {
  const projectRoot = join(__dirname, "..", "..", "..");

  it("builds a graph from example artifacts", async () => {
    const root = new EaRoot(projectRoot, {
      specDir: "specs",
      outputDir: "output",
      ea: { enabled: true, rootDir: "examples/ea" },
    } as AnchoredSpecConfig);

    const { artifacts } = await root.loadArtifacts();
    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(artifacts, registry);

    expect(graph.nodes().length).toBeGreaterThan(0);
    expect(graph.edges().length).toBeGreaterThan(0);
  });

  it("generates valid Mermaid output from examples", async () => {
    const root = new EaRoot(projectRoot, {
      specDir: "specs",
      outputDir: "output",
      ea: { enabled: true, rootDir: "examples/ea" },
    } as AnchoredSpecConfig);

    const { artifacts } = await root.loadArtifacts();
    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(artifacts, registry);
    const mermaid = graph.toMermaid();

    expect(mermaid).toContain("graph LR");
    expect(mermaid.length).toBeGreaterThan(50);
  });

  it("generates valid DOT output from examples", async () => {
    const root = new EaRoot(projectRoot, {
      specDir: "specs",
      outputDir: "output",
      ea: { enabled: true, rootDir: "examples/ea" },
    } as AnchoredSpecConfig);

    const { artifacts } = await root.loadArtifacts();
    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(artifacts, registry);
    const dot = graph.toDot();

    expect(dot).toContain("digraph EA {");
    expect(dot).toContain("}");
  });
});
