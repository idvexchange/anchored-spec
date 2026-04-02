/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for Phase 2B: Data Layer Relations, Quality Rules, and Drift Rules
 *
 * Covers:
 *  - 4 new relations (stores, hostedOn, lineageFrom, implementedBy)
 *  - Extended relation (uses → data-product)
 *  - 6 schema-specific quality rules
 *  - 5 static-analysis drift rules
 */
import { describe, it, expect } from "vitest";
import { createDefaultRegistry, validateEaArtifacts, validateEaRelations, evaluateEaDrift, } from "../index.js";
import { makeEntity } from "./helpers/make-entity.js";
// ─── Phase 2B Relations ─────────────────────────────────────────────────────────
describe("Phase 2B: New Relations", () => {
    const registry = createDefaultRegistry();
    describe("stores", () => {
        it("is registered with correct source and target kinds", () => {
            const entry = registry.get("stores");
            expect(entry).toBeDefined();
            expect(entry!.inverse).toBe("storedIn");
            expect(entry!.validSourceSchemas).toContain("data-store");
            expect(entry!.validTargetSchemas).toContain("logical-data-model");
            expect(entry!.validTargetSchemas).toContain("physical-schema");
        });
        it("validates successfully for valid source/target", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:orders-db",
                    kind: "Resource",
                    type: "database",
                    stores: ["canonicalentity:order-entity"]
                } as any),
                makeEntity({ ref: "canonicalentity:order-entity", kind: "CanonicalEntity", type: "logical-data-model" }),
            ];
            const result = validateEaRelations(artifacts, registry);
            const relErrors = result.errors.filter((e) => e.rule !== "ea:relation:target-missing");
            expect(relErrors).toHaveLength(0);
        });
        it("rejects invalid source kind", () => {
            const artifacts = [
                makeEntity({
                    ref: "component:frontend",
                    kind: "Component",
                    type: "website",
                    stores: ["canonicalentity:order-entity"]
                }),
                makeEntity({ ref: "canonicalentity:order-entity", kind: "CanonicalEntity", type: "logical-data-model" }),
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
            expect(entry!.validSourceSchemas).toContain("data-store");
            expect(entry!.validTargetSchemas).toContain("platform");
            expect(entry!.validTargetSchemas).toContain("cloud-resource");
        });
        it("validates successfully for data-store → cloud-resource", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:orders-db",
                    kind: "Resource",
                    type: "database",
                    hostedOn: ["resource:rds-orders"]
                } as any),
                makeEntity({ ref: "resource:rds-orders", kind: "Resource", type: "cloud-resource" }),
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
            expect(entry!.validSourceSchemas).toContain("lineage");
            expect(entry!.validSourceSchemas).toContain("data-product");
            expect(entry!.validTargetSchemas).toContain("data-store");
            expect(entry!.validTargetSchemas).toContain("data-product");
        });
        it("allows cycles", () => {
            const entry = registry.get("lineageFrom");
            expect(entry!.allowCycles).toBe(true);
        });
        it("validates for lineage → data-store", () => {
            const artifacts = [
                makeEntity({
                    ref: "exchange:etl-orders",
                    kind: "Exchange",
                    type: "data-lineage",
                    lineageFrom: ["resource:raw-orders"]
                } as any),
                makeEntity({ ref: "resource:raw-orders", kind: "Resource", type: "database" }),
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
            expect(entry!.validSourceSchemas).toContain("logical-data-model");
            expect(entry!.validTargetSchemas).toContain("physical-schema");
            expect(entry!.validTargetSchemas).toContain("data-store");
            expect(entry!.validTargetSchemas).toContain("application");
        });
        it("validates for LDM → physical-schema", () => {
            const artifacts = [
                makeEntity({
                    ref: "canonicalentity:order",
                    kind: "CanonicalEntity",
                    type: "logical-data-model",
                    implementedBy: ["resource:orders-pg"]
                } as any),
                makeEntity({ ref: "resource:orders-pg", kind: "Resource", type: "database-table" }),
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
                ref: "component:analytics",
                kind: "Component",
                type: "website",
                uses: ["resource:customer-360"]
            }),
            makeEntity({ ref: "resource:customer-360", kind: "Resource", type: "data-product" }),
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
                    ref: "canonicalentity:empty",
                    kind: "CanonicalEntity",
                    type: "logical-data-model",
                    attributes: []
                } as any),
            ];
            const result = validateEaArtifacts(artifacts);
            expect(result.warnings.find((e) => e.rule === "ea:quality:ldm-missing-attributes")).toBeDefined();
        });
        it("does not fire when attributes present", () => {
            const artifacts = [
                makeEntity({
                    ref: "canonicalentity:full",
                    kind: "CanonicalEntity",
                    type: "logical-data-model",
                    attributes: [{ name: "id", type: "string" }]
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
                    ref: "resource:empty",
                    kind: "Resource",
                    type: "database-table",
                    engine: "postgresql",
                    tables: []
                } as any),
            ];
            const result = validateEaArtifacts(artifacts);
            expect(result.warnings.find((e) => e.rule === "ea:quality:physical-schema-missing-tables")).toBeDefined();
        });
        it("does not fire when tables present", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:orders",
                    kind: "Resource",
                    type: "database-table",
                    engine: "postgresql",
                    tables: [{ name: "orders", columns: [{ name: "id", type: "uuid" }] }]
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
                    ref: "resource:no-tech",
                    kind: "Resource",
                    type: "database"
                } as any),
            ];
            const result = validateEaArtifacts(artifacts);
            expect(result.errors.find((e) => e.rule === "ea:quality:data-store-missing-technology")).toBeDefined();
        });
        it("does not fire when technology present", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:pg",
                    kind: "Resource",
                    type: "database",
                    technology: { engine: "postgresql", category: "relational" }
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
                    ref: "exchange:broken",
                    kind: "Exchange",
                    type: "data-lineage",
                    destination: { artifactId: "resource:target" },
                    mechanism: "etl"
                } as any),
            ];
            const result = validateEaArtifacts(artifacts);
            expect(result.errors.find((e) => e.rule === "ea:quality:lineage-missing-source-destination")).toBeDefined();
        });
        it("does not fire when both present", () => {
            const artifacts = [
                makeEntity({
                    ref: "exchange:ok",
                    kind: "Exchange",
                    type: "data-lineage",
                    source: { artifactId: "resource:src" },
                    destination: { artifactId: "resource:dst" },
                    mechanism: "etl"
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
                    ref: "control:empty",
                    kind: "Control",
                    type: "data-quality-rule",
                    ruleType: "not-null",
                    appliesTo: ["resource:orders"],
                    assertion: "",
                    onFailure: "alert"
                } as any),
            ];
            const result = validateEaArtifacts(artifacts);
            expect(result.errors.find((e) => e.rule === "ea:quality:dqr-missing-assertion")).toBeDefined();
        });
        it("does not fire when assertion present", () => {
            const artifacts = [
                makeEntity({
                    ref: "control:valid",
                    kind: "Control",
                    type: "data-quality-rule",
                    ruleType: "not-null",
                    appliesTo: ["resource:orders"],
                    assertion: "order_id must not be null",
                    onFailure: "block"
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
                    ref: "resource:empty",
                    kind: "Resource",
                    type: "data-product",
                    domain: "analytics",
                    outputPorts: []
                } as any),
            ];
            const result = validateEaArtifacts(artifacts);
            expect(result.warnings.find((e) => e.rule === "ea:quality:data-product-missing-output-ports")).toBeDefined();
        });
        it("does not fire when output ports present", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:valid",
                    kind: "Resource",
                    type: "data-product",
                    domain: "analytics",
                    outputPorts: [{ name: "orders-table", type: "table" }]
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
                    ref: "exchange:broken",
                    kind: "Exchange",
                    type: "data-lineage",
                    source: { artifactId: "resource:deleted" },
                    destination: { artifactId: "resource:target" },
                    mechanism: "etl"
                } as any),
                makeEntity({ ref: "resource:target", kind: "Resource", type: "database" }),
            ];
            const result = evaluateEaDrift(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:data/lineage-stale");
            expect(warn).toBeDefined();
            expect(warn!.message).toContain("resource:default/deleted");
            expect(warn!.message).toContain("does not exist");
        });
        it("fires when lineage destination is retired", () => {
            const artifacts = [
                makeEntity({
                    ref: "exchange:old",
                    kind: "Exchange",
                    type: "data-lineage",
                    source: { artifactId: "resource:src" },
                    destination: { artifactId: "resource:retired" },
                    mechanism: "etl"
                } as any),
                makeEntity({ ref: "resource:src", kind: "Resource", type: "database" }),
                makeEntity({ ref: "resource:retired", kind: "Resource", type: "database", status: "retired" }),
            ];
            const result = evaluateEaDrift(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:data/lineage-stale");
            expect(warn).toBeDefined();
            expect(warn!.message).toContain("retired");
        });
        it("does not fire when both endpoints exist and are active", () => {
            const artifacts = [
                makeEntity({
                    ref: "exchange:ok",
                    kind: "Exchange",
                    type: "data-lineage",
                    source: { artifactId: "resource:src" },
                    destination: { artifactId: "resource:dst" },
                    mechanism: "etl"
                } as any),
                makeEntity({ ref: "resource:src", kind: "Resource", type: "database" }),
                makeEntity({ ref: "resource:dst", kind: "Resource", type: "database" }),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((e) => e.rule === "ea:data/lineage-stale")).toBeUndefined();
        });
    });
    describe("ea:data/orphan-store", () => {
        it("fires for disconnected data store", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:lonely",
                    kind: "Resource",
                    type: "database",
                    technology: { engine: "pg", category: "relational" }
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((e) => e.rule === "ea:data/orphan-store")).toBeDefined();
        });
        it("does not fire when store has relations", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:connected",
                    kind: "Resource",
                    type: "database",
                    technology: { engine: "pg", category: "relational" },
                    hostedOn: ["component:aws"]
                } as any),
                makeEntity({ ref: "component:aws", kind: "Component", type: "service" }),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((e) => e.rule === "ea:data/orphan-store")).toBeUndefined();
        });
        it("does not fire when store is a lineage endpoint", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:in-lineage",
                    kind: "Resource",
                    type: "database",
                    technology: { engine: "pg", category: "relational" }
                } as any),
                makeEntity({
                    ref: "exchange:flow",
                    kind: "Exchange",
                    type: "data-lineage",
                    source: { artifactId: "resource:in-lineage" },
                    destination: { artifactId: "resource:target" },
                    mechanism: "etl"
                } as any),
                makeEntity({ ref: "resource:target", kind: "Resource", type: "database" }),
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
                    ref: "resource:shared-db",
                    kind: "Resource",
                    type: "database",
                    technology: { engine: "pg", category: "relational" },
                    isShared: true
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((e) => e.rule === "ea:data/shared-store-no-steward")).toBeDefined();
        });
        it("does not fire when MDM references shared store", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:shared-db",
                    kind: "Resource",
                    type: "database",
                    technology: { engine: "pg", category: "relational" },
                    isShared: true
                } as any),
                makeEntity({
                    ref: "canonicalentity:customer",
                    kind: "CanonicalEntity",
                    type: "master-data-domain",
                    entities: ["Customer"],
                    steward: { team: "data-governance" },
                    goldenSource: "resource:shared-db"
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((e) => e.rule === "ea:data/shared-store-no-steward")).toBeUndefined();
        });
        it("does not fire for non-shared stores", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:private-db",
                    kind: "Resource",
                    type: "database",
                    technology: { engine: "pg", category: "relational" },
                    isShared: false
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
                    ref: "resource:no-sla",
                    kind: "Resource",
                    type: "data-product",
                    status: "active",
                    domain: "analytics",
                    outputPorts: [{ name: "out", type: "table" }]
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((e) => e.rule === "ea:data/product-missing-sla")).toBeDefined();
        });
        it("does not fire when SLA present", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:with-sla",
                    kind: "Resource",
                    type: "data-product",
                    status: "active",
                    domain: "analytics",
                    outputPorts: [{ name: "out", type: "table" }],
                    sla: { freshness: "daily", availability: "99.9%" }
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((e) => e.rule === "ea:data/product-missing-sla")).toBeUndefined();
        });
        it("does not fire for draft products", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:draft",
                    kind: "Resource",
                    type: "data-product",
                    status: "draft",
                    domain: "analytics",
                    outputPorts: [{ name: "out", type: "table" }]
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
                    ref: "resource:no-rules",
                    kind: "Resource",
                    type: "data-product",
                    status: "active",
                    domain: "analytics",
                    outputPorts: [{ name: "out", type: "table" }],
                    qualityRules: []
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((e) => e.rule === "ea:data/product-missing-quality-rules")).toBeDefined();
        });
        it("does not fire when quality rules present", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:with-rules",
                    kind: "Resource",
                    type: "data-product",
                    status: "active",
                    domain: "analytics",
                    outputPorts: [{ name: "out", type: "table" }],
                    qualityRules: ["control:not-null-id"]
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((e) => e.rule === "ea:data/product-missing-quality-rules")).toBeUndefined();
        });
    });
});
