/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { makeEntity } from "./helpers/make-entity.js";

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
        makeEntity({
          id: "STORE-orders-db",
          kind: "data-store",
          relations: [{ type: "stores", target: "LDM-order-entity" }],
        } as any),
        makeEntity({ id: "LDM-order-entity", kind: "logical-data-model" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const relErrors = result.errors.filter((e) => e.rule !== "ea:relation:target-missing");
      expect(relErrors).toHaveLength(0);
    });

    it("rejects invalid source kind", () => {
      const artifacts = [
        makeEntity({
          id: "APP-frontend",
          kind: "application",
          relations: [{ type: "stores", target: "LDM-order-entity" }],
        }),
        makeEntity({ id: "LDM-order-entity", kind: "logical-data-model" }),
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
        makeEntity({
          id: "STORE-orders-db",
          kind: "data-store",
          relations: [{ type: "hostedOn", target: "CLOUD-rds-orders" }],
        } as any),
        makeEntity({ id: "CLOUD-rds-orders", kind: "cloud-resource" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const relErrors = result.errors.filter((e) => e.rule !== "ea:relation:target-missing");
      expect(relErrors).toHaveLength(0);
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
        makeEntity({
          id: "LINEAGE-etl-orders",
          kind: "lineage",
          relations: [{ type: "lineageFrom", target: "STORE-raw-orders" }],
        } as any),
        makeEntity({ id: "STORE-raw-orders", kind: "data-store" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const relErrors = result.errors.filter((e) => e.rule !== "ea:relation:target-missing");
      expect(relErrors).toHaveLength(0);
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
        makeEntity({
          id: "LDM-order",
          kind: "logical-data-model",
          relations: [{ type: "implementedBy", target: "SCHEMA-orders-pg" }],
        } as any),
        makeEntity({ id: "SCHEMA-orders-pg", kind: "physical-schema" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      const relErrors = result.errors.filter((e) => e.rule !== "ea:relation:target-missing");
      expect(relErrors).toHaveLength(0);
    });
  });
});

describe("Phase 2B: Extended Relations", () => {
  const registry = createDefaultRegistry();

  it("uses now accepts data-product as target", () => {
    const artifacts = [
      makeEntity({
        id: "APP-analytics",
        kind: "application",
        relations: [{ type: "uses", target: "DPROD-customer-360" }],
      }),
      makeEntity({ id: "DPROD-customer-360", kind: "data-product" }),
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
        makeEntity({
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
        makeEntity({
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
        makeEntity({
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
        makeEntity({
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
        makeEntity({
          id: "STORE-no-tech",
          kind: "data-store",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:quality:data-store-missing-technology")).toBeDefined();
    });

    it("does not fire when technology present", () => {
      const artifacts = [
        makeEntity({
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
        makeEntity({
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
        makeEntity({
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
        makeEntity({
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
        makeEntity({
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
        makeEntity({
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
        makeEntity({
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
  describe("ea:data/lineage-stale", () => {
    it("fires when lineage source does not exist", () => {
      const artifacts = [
        makeEntity({
          id: "LINEAGE-broken",
          kind: "lineage",
          source: { artifactId: "resource:deleted" },
          destination: { artifactId: "resource:target" },
          mechanism: "etl",
        } as any),
        makeEntity({ id: "STORE-target", kind: "data-store" }),
      ];
      const result = evaluateEaDrift(artifacts);
      const warn = result.warnings.find((e) => e.rule === "ea:data/lineage-stale");
      expect(warn).toBeDefined();
      expect(warn!.message).toContain("resource:deleted");
      expect(warn!.message).toContain("does not exist");
    });

    it("fires when lineage destination is retired", () => {
      const artifacts = [
        makeEntity({
          id: "LINEAGE-old",
          kind: "lineage",
          source: { artifactId: "resource:src" },
          destination: { artifactId: "resource:retired" },
          mechanism: "etl",
        } as any),
        makeEntity({ id: "STORE-src", kind: "data-store" }),
        makeEntity({ id: "STORE-retired", kind: "data-store", status: "retired" }),
      ];
      const result = evaluateEaDrift(artifacts);
      const warn = result.warnings.find((e) => e.rule === "ea:data/lineage-stale");
      expect(warn).toBeDefined();
      expect(warn!.message).toContain("retired");
    });

    it("does not fire when both endpoints exist and are active", () => {
      const artifacts = [
        makeEntity({
          id: "LINEAGE-ok",
          kind: "lineage",
          source: { artifactId: "resource:src" },
          destination: { artifactId: "resource:dst" },
          mechanism: "etl",
        } as any),
        makeEntity({ id: "STORE-src", kind: "data-store" }),
        makeEntity({ id: "STORE-dst", kind: "data-store" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:data/lineage-stale")).toBeUndefined();
    });
  });

  describe("ea:data/orphan-store", () => {
    it("fires for disconnected data store", () => {
      const artifacts = [
        makeEntity({
          id: "STORE-lonely",
          kind: "data-store",
          technology: { engine: "pg", category: "relational" },
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:data/orphan-store")).toBeDefined();
    });

    it("does not fire when store has relations", () => {
      const artifacts = [
        makeEntity({
          id: "STORE-connected",
          kind: "data-store",
          technology: { engine: "pg", category: "relational" },
          relations: [{ type: "hostedOn", target: "PLAT-aws" }],
        } as any),
        makeEntity({ id: "PLAT-aws", kind: "platform" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:data/orphan-store")).toBeUndefined();
    });

    it("does not fire when store is a lineage endpoint", () => {
      const artifacts = [
        makeEntity({
          id: "STORE-in-lineage",
          kind: "data-store",
          technology: { engine: "pg", category: "relational" },
        } as any),
        makeEntity({
          id: "LINEAGE-flow",
          kind: "lineage",
          source: { artifactId: "resource:in-lineage" },
          destination: { artifactId: "resource:target" },
          mechanism: "etl",
        } as any),
        makeEntity({ id: "STORE-target", kind: "data-store" }),
      ];
      const result = evaluateEaDrift(artifacts);
      const orphanWarnings = result.warnings.filter((e) => e.rule === "ea:data/orphan-store");
      const storeInLineageOrphan = orphanWarnings.find((e) => e.path === "resource:in-lineage");
      expect(storeInLineageOrphan).toBeUndefined();
    });
  });

  describe("ea:data/shared-store-no-steward", () => {
    it("fires for shared store without MDM", () => {
      const artifacts = [
        makeEntity({
          id: "STORE-shared-db",
          kind: "data-store",
          technology: { engine: "pg", category: "relational" },
          isShared: true,
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:data/shared-store-no-steward")).toBeDefined();
    });

    it("does not fire when MDM references shared store", () => {
      const artifacts = [
        makeEntity({
          id: "STORE-shared-db",
          kind: "data-store",
          technology: { engine: "pg", category: "relational" },
          isShared: true,
        } as any),
        makeEntity({
          id: "MDM-customer",
          kind: "master-data-domain",
          entities: ["Customer"],
          steward: { team: "data-governance" },
          goldenSource: "resource:shared-db",
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:data/shared-store-no-steward")).toBeUndefined();
    });

    it("does not fire for non-shared stores", () => {
      const artifacts = [
        makeEntity({
          id: "STORE-private-db",
          kind: "data-store",
          technology: { engine: "pg", category: "relational" },
          isShared: false,
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:data/shared-store-no-steward")).toBeUndefined();
    });
  });

  describe("ea:data/product-missing-sla", () => {
    it("fires for active data product without SLA", () => {
      const artifacts = [
        makeEntity({
          id: "DPROD-no-sla",
          kind: "data-product",
          status: "active",
          domain: "analytics",
          outputPorts: [{ name: "out", type: "table" }],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:data/product-missing-sla")).toBeDefined();
    });

    it("does not fire when SLA present", () => {
      const artifacts = [
        makeEntity({
          id: "DPROD-with-sla",
          kind: "data-product",
          status: "active",
          domain: "analytics",
          outputPorts: [{ name: "out", type: "table" }],
          sla: { freshness: "daily", availability: "99.9%" },
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:data/product-missing-sla")).toBeUndefined();
    });

    it("does not fire for draft products", () => {
      const artifacts = [
        makeEntity({
          id: "DPROD-draft",
          kind: "data-product",
          status: "draft",
          domain: "analytics",
          outputPorts: [{ name: "out", type: "table" }],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:data/product-missing-sla")).toBeUndefined();
    });
  });

  describe("ea:data/product-missing-quality-rules", () => {
    it("fires for active data product without quality rules", () => {
      const artifacts = [
        makeEntity({
          id: "DPROD-no-rules",
          kind: "data-product",
          status: "active",
          domain: "analytics",
          outputPorts: [{ name: "out", type: "table" }],
          qualityRules: [],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:data/product-missing-quality-rules")).toBeDefined();
    });

    it("does not fire when quality rules present", () => {
      const artifacts = [
        makeEntity({
          id: "DPROD-with-rules",
          kind: "data-product",
          status: "active",
          domain: "analytics",
          outputPorts: [{ name: "out", type: "table" }],
          qualityRules: ["DQR-not-null-id"],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((e) => e.rule === "ea:data/product-missing-quality-rules")).toBeUndefined();
    });
  });
});
