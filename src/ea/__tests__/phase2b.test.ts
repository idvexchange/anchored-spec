/**
 * Tests for Phase 2B: Data Layer Relations, Quality Rules, and Drift Rules
 *
 * Covers:
 *  - 4 new relations (stores, hostedOn, lineageFrom, implementedBy)
 *  - Extended relation (uses → data-product)
 *  - 6 kind-specific quality rules
 *  - 5 static-analysis drift rules
 */

import { describe, it, expect } from "vitest";
import {
  createDefaultRegistry,
  validateEaArtifacts,
  validateEaRelations,
  evaluateEaDrift,
} from "../index.js";
import type { EaArtifactBase } from "../index.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<EaArtifactBase> & { id: string; kind: string }): EaArtifactBase {
  return {
    apiVersion: "anchored-spec/ea/v1",
    title: overrides.title ?? overrides.id,
    summary: "A well-described artifact for testing purposes.",
    owners: ["team-test"],
    tags: [],
    confidence: "declared",
    status: "active",
    schemaVersion: "1.0.0",
    relations: [],
    ...overrides,
  } as EaArtifactBase;
}

// ─── Phase 2B Relations ─────────────────────────────────────────────────────────

describe("Phase 2B: New Relations", () => {
  const registry = createDefaultRegistry();

  describe("stores", () => {
    it("is registered with correct source and target kinds", () => {
      const entry = registry.get("stores");
      expect(entry).toBeDefined();
      expect(entry!.inverse).toBe("storedIn");
      expect(entry!.validSourceKinds).toContain("data-store");
      expect(entry!.validTargetKinds).toContain("logical-data-model");
      expect(entry!.validTargetKinds).toContain("physical-schema");
    });

    it("validates successfully for valid source/target", () => {
      const artifacts = [
        makeArtifact({
          id: "STORE-orders-db",
          kind: "data-store",
          relations: [{ type: "stores", target: "LDM-order-entity" }],
        } as any),
        makeArtifact({ id: "LDM-order-entity", kind: "logical-data-model" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects invalid source kind", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-frontend",
          kind: "application",
          relations: [{ type: "stores", target: "LDM-order-entity" }],
        }),
        makeArtifact({ id: "LDM-order-entity", kind: "logical-data-model" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors.find((e) => e.rule === "ea:relation:invalid-source")).toBeDefined();
    });
  });

  describe("hostedOn", () => {
    it("is registered with correct source and target kinds", () => {
      const entry = registry.get("hostedOn");
      expect(entry).toBeDefined();
      expect(entry!.inverse).toBe("hostsData");
      expect(entry!.validSourceKinds).toContain("data-store");
      expect(entry!.validTargetKinds).toContain("platform");
      expect(entry!.validTargetKinds).toContain("cloud-resource");
    });

    it("validates successfully for data-store → cloud-resource", () => {
      const artifacts = [
        makeArtifact({
          id: "STORE-orders-db",
          kind: "data-store",
          relations: [{ type: "hostedOn", target: "CLOUD-rds-orders" }],
        } as any),
        makeArtifact({ id: "CLOUD-rds-orders", kind: "cloud-resource" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("lineageFrom", () => {
    it("is registered with correct source and target kinds", () => {
      const entry = registry.get("lineageFrom");
      expect(entry).toBeDefined();
      expect(entry!.inverse).toBe("lineageTo");
      expect(entry!.validSourceKinds).toContain("lineage");
      expect(entry!.validSourceKinds).toContain("data-product");
      expect(entry!.validTargetKinds).toContain("data-store");
      expect(entry!.validTargetKinds).toContain("data-product");
    });

    it("allows cycles", () => {
      const entry = registry.get("lineageFrom");
      expect(entry!.allowCycles).toBe(true);
    });

    it("validates for lineage → data-store", () => {
      const artifacts = [
        makeArtifact({
          id: "LINEAGE-etl-orders",
          kind: "lineage",
          relations: [{ type: "lineageFrom", target: "STORE-raw-orders" }],
        } as any),
        makeArtifact({ id: "STORE-raw-orders", kind: "data-store" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("implementedBy", () => {
    it("is registered with correct source and target kinds", () => {
      const entry = registry.get("implementedBy");
      expect(entry).toBeDefined();
      expect(entry!.inverse).toBe("implements");
      expect(entry!.validSourceKinds).toContain("logical-data-model");
      expect(entry!.validTargetKinds).toContain("physical-schema");
      expect(entry!.validTargetKinds).toContain("data-store");
      expect(entry!.validTargetKinds).toContain("application");
    });

    it("validates for LDM → physical-schema", () => {
      const artifacts = [
        makeArtifact({
          id: "LDM-order",
          kind: "logical-data-model",
          relations: [{ type: "implementedBy", target: "SCHEMA-orders-pg" }],
        } as any),
        makeArtifact({ id: "SCHEMA-orders-pg", kind: "physical-schema" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });
  });
});

describe("Phase 2B: Extended Relations", () => {
  const registry = createDefaultRegistry();

  it("uses now accepts data-product as target", () => {
    const artifacts = [
      makeArtifact({
        id: "APP-analytics",
        kind: "application",
        relations: [{ type: "uses", target: "DPROD-customer-360" }],
      }),
      makeArtifact({ id: "DPROD-customer-360", kind: "data-product" }),
    ];
    const result = validateEaRelations(artifacts, registry);
    const targetError = result.errors.find((e) => e.rule === "ea:relation:invalid-target");
    expect(targetError).toBeUndefined();
  });
});

// ─── Data Layer Quality Rules ───────────────────────────────────────────────────

describe("Phase 2B: Quality Rules", () => {
  describe("ea:quality:ldm-missing-attributes", () => {
    it("fires when LDM has no attributes", () => {
      const artifacts = [
        makeArtifact({
          id: "LDM-empty",
          kind: "logical-data-model",
          attributes: [],
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:quality:ldm-missing-attributes")).toBeDefined();
    });

    it("does not fire when attributes present", () => {
      const artifacts = [
        makeArtifact({
          id: "LDM-full",
          kind: "logical-data-model",
          attributes: [{ name: "id", type: "string" }],
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:quality:ldm-missing-attributes")).toBeUndefined();
    });
  });

  describe("ea:quality:physical-schema-missing-tables", () => {
    it("fires when schema has no tables", () => {
      const artifacts = [
        makeArtifact({
          id: "SCHEMA-empty",
          kind: "physical-schema",
          engine: "postgresql",
          tables: [],
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:quality:physical-schema-missing-tables")).toBeDefined();
    });

    it("does not fire when tables present", () => {
      const artifacts = [
        makeArtifact({
          id: "SCHEMA-orders",
          kind: "physical-schema",
          engine: "postgresql",
          tables: [{ name: "orders", columns: [{ name: "id", type: "uuid" }] }],
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:quality:physical-schema-missing-tables")).toBeUndefined();
    });
  });

  describe("ea:quality:data-store-missing-technology", () => {
    it("fires when data-store has no technology", () => {
      const artifacts = [
        makeArtifact({
          id: "STORE-no-tech",
          kind: "data-store",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:quality:data-store-missing-technology")).toBeDefined();
    });

    it("does not fire when technology present", () => {
      const artifacts = [
        makeArtifact({
          id: "STORE-pg",
          kind: "data-store",
          technology: { engine: "postgresql", category: "relational" },
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:quality:data-store-missing-technology")).toBeUndefined();
    });
  });

  describe("ea:quality:lineage-missing-source-destination", () => {
    it("fires when lineage has no source", () => {
      const artifacts = [
        makeArtifact({
          id: "LINEAGE-broken",
          kind: "lineage",
          destination: { artifactId: "STORE-target" },
          mechanism: "etl",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:quality:lineage-missing-source-destination")).toBeDefined();
    });

    it("does not fire when both present", () => {
      const artifacts = [
        makeArtifact({
          id: "LINEAGE-ok",
          kind: "lineage",
          source: { artifactId: "STORE-src" },
          destination: { artifactId: "STORE-dst" },
          mechanism: "etl",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:quality:lineage-missing-source-destination")).toBeUndefined();
    });
  });

  describe("ea:quality:dqr-missing-assertion", () => {
    it("fires when DQR has no assertion", () => {
      const artifacts = [
        makeArtifact({
          id: "DQR-empty",
          kind: "data-quality-rule",
          ruleType: "not-null",
          appliesTo: ["STORE-orders"],
          assertion: "",
          onFailure: "alert",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:quality:dqr-missing-assertion")).toBeDefined();
    });

    it("does not fire when assertion present", () => {
      const artifacts = [
        makeArtifact({
          id: "DQR-valid",
          kind: "data-quality-rule",
          ruleType: "not-null",
          appliesTo: ["STORE-orders"],
          assertion: "order_id must not be null",
          onFailure: "block",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:quality:dqr-missing-assertion")).toBeUndefined();
    });
  });

  describe("ea:quality:data-product-missing-output-ports", () => {
    it("fires when data product has no output ports", () => {
      const artifacts = [
        makeArtifact({
          id: "DPROD-empty",
          kind: "data-product",
          domain: "analytics",
          outputPorts: [],
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:quality:data-product-missing-output-ports")).toBeDefined();
    });

    it("does not fire when output ports present", () => {
      const artifacts = [
        makeArtifact({
          id: "DPROD-valid",
          kind: "data-product",
          domain: "analytics",
          outputPorts: [{ name: "orders-table", type: "table" }],
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:quality:data-product-missing-output-ports")).toBeUndefined();
    });
  });
});

// ─── Data Layer Drift Rules ─────────────────────────────────────────────────────

describe("Phase 2B: Drift Rules", () => {
  describe("ea:drift:lineage-stale", () => {
    it("fires when lineage source does not exist", () => {
      const artifacts = [
        makeArtifact({
          id: "LINEAGE-broken",
          kind: "lineage",
          source: { artifactId: "STORE-deleted" },
          destination: { artifactId: "STORE-target" },
          mechanism: "etl",
        } as any),
        makeArtifact({ id: "STORE-target", kind: "data-store" }),
      ];
      const result = evaluateEaDrift(artifacts);
      const warn = result.warnings.find((e) => e.rule === "ea:drift:lineage-stale");
      expect(warn).toBeDefined();
      expect(warn!.message).toContain("STORE-deleted");
      expect(warn!.message).toContain("does not exist");
    });

    it("fires when lineage destination is retired", () => {
      const artifacts = [
        makeArtifact({
          id: "LINEAGE-old",
          kind: "lineage",
          source: { artifactId: "STORE-src" },
          destination: { artifactId: "STORE-retired" },
          mechanism: "etl",
        } as any),
        makeArtifact({ id: "STORE-src", kind: "data-store" }),
        makeArtifact({ id: "STORE-retired", kind: "data-store", status: "retired" }),
      ];
      const result = evaluateEaDrift(artifacts);
      const warn = result.warnings.find((e) => e.rule === "ea:drift:lineage-stale");
      expect(warn).toBeDefined();
      expect(warn!.message).toContain("retired");
    });

    it("does not fire when both endpoints exist and are active", () => {
      const artifacts = [
        makeArtifact({
          id: "LINEAGE-ok",
          kind: "lineage",
          source: { artifactId: "STORE-src" },
          destination: { artifactId: "STORE-dst" },
          mechanism: "etl",
        } as any),
        makeArtifact({ id: "STORE-src", kind: "data-store" }),
        makeArtifact({ id: "STORE-dst", kind: "data-store" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:drift:lineage-stale")).toBeUndefined();
    });
  });

  describe("ea:drift:orphan-store", () => {
    it("fires for disconnected data store", () => {
      const artifacts = [
        makeArtifact({
          id: "STORE-lonely",
          kind: "data-store",
          technology: { engine: "pg", category: "relational" },
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:drift:orphan-store")).toBeDefined();
    });

    it("does not fire when store has relations", () => {
      const artifacts = [
        makeArtifact({
          id: "STORE-connected",
          kind: "data-store",
          technology: { engine: "pg", category: "relational" },
          relations: [{ type: "hostedOn", target: "PLAT-aws" }],
        } as any),
        makeArtifact({ id: "PLAT-aws", kind: "platform" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:drift:orphan-store")).toBeUndefined();
    });

    it("does not fire when store is a lineage endpoint", () => {
      const artifacts = [
        makeArtifact({
          id: "STORE-in-lineage",
          kind: "data-store",
          technology: { engine: "pg", category: "relational" },
        } as any),
        makeArtifact({
          id: "LINEAGE-flow",
          kind: "lineage",
          source: { artifactId: "STORE-in-lineage" },
          destination: { artifactId: "STORE-target" },
          mechanism: "etl",
        } as any),
        makeArtifact({ id: "STORE-target", kind: "data-store" }),
      ];
      const result = evaluateEaDrift(artifacts);
      const orphanWarnings = result.warnings.filter((e) => e.rule === "ea:drift:orphan-store");
      const storeInLineageOrphan = orphanWarnings.find((e) => e.path === "STORE-in-lineage");
      expect(storeInLineageOrphan).toBeUndefined();
    });
  });

  describe("ea:drift:shared-store-no-steward", () => {
    it("fires for shared store without MDM", () => {
      const artifacts = [
        makeArtifact({
          id: "STORE-shared-db",
          kind: "data-store",
          technology: { engine: "pg", category: "relational" },
          isShared: true,
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:drift:shared-store-no-steward")).toBeDefined();
    });

    it("does not fire when MDM references shared store", () => {
      const artifacts = [
        makeArtifact({
          id: "STORE-shared-db",
          kind: "data-store",
          technology: { engine: "pg", category: "relational" },
          isShared: true,
        } as any),
        makeArtifact({
          id: "MDM-customer",
          kind: "master-data-domain",
          entities: ["Customer"],
          steward: { team: "data-governance" },
          goldenSource: "STORE-shared-db",
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:drift:shared-store-no-steward")).toBeUndefined();
    });

    it("does not fire for non-shared stores", () => {
      const artifacts = [
        makeArtifact({
          id: "STORE-private-db",
          kind: "data-store",
          technology: { engine: "pg", category: "relational" },
          isShared: false,
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:drift:shared-store-no-steward")).toBeUndefined();
    });
  });

  describe("ea:drift:product-missing-sla", () => {
    it("fires for active data product without SLA", () => {
      const artifacts = [
        makeArtifact({
          id: "DPROD-no-sla",
          kind: "data-product",
          status: "active",
          domain: "analytics",
          outputPorts: [{ name: "out", type: "table" }],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:drift:product-missing-sla")).toBeDefined();
    });

    it("does not fire when SLA present", () => {
      const artifacts = [
        makeArtifact({
          id: "DPROD-with-sla",
          kind: "data-product",
          status: "active",
          domain: "analytics",
          outputPorts: [{ name: "out", type: "table" }],
          sla: { freshness: "daily", availability: "99.9%" },
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:drift:product-missing-sla")).toBeUndefined();
    });

    it("does not fire for draft products", () => {
      const artifacts = [
        makeArtifact({
          id: "DPROD-draft",
          kind: "data-product",
          status: "draft",
          domain: "analytics",
          outputPorts: [{ name: "out", type: "table" }],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:drift:product-missing-sla")).toBeUndefined();
    });
  });

  describe("ea:drift:product-missing-quality-rules", () => {
    it("fires for active data product without quality rules", () => {
      const artifacts = [
        makeArtifact({
          id: "DPROD-no-rules",
          kind: "data-product",
          status: "active",
          domain: "analytics",
          outputPorts: [{ name: "out", type: "table" }],
          qualityRules: [],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:drift:product-missing-quality-rules")).toBeDefined();
    });

    it("does not fire when quality rules present", () => {
      const artifacts = [
        makeArtifact({
          id: "DPROD-with-rules",
          kind: "data-product",
          status: "active",
          domain: "analytics",
          outputPorts: [{ name: "out", type: "table" }],
          qualityRules: ["DQR-not-null-id"],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:drift:product-missing-quality-rules")).toBeUndefined();
    });
  });
});
