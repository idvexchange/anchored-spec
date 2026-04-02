/**
 * Tests for EA Reports: System-Data Matrix + Classification Coverage
 *
 * Covers:
 *  - buildSystemDataMatrix() logic
 *  - renderSystemDataMatrixMarkdown() output
 *  - buildClassificationCoverage() logic
 *  - renderClassificationCoverageMarkdown() output
 */
import { describe, it, expect } from "vitest";
import { buildSystemDataMatrix, renderSystemDataMatrixMarkdown, buildClassificationCoverage, renderClassificationCoverageMarkdown, } from "../index.js";
import type { BackstageEntity } from "../backstage/types.js";
import { makeEntity as makeFixtureEntity } from "./helpers/make-entity.js";
// ─── Helpers ────────────────────────────────────────────────────────────────────
function makeEntity(overrides: Record<string, unknown> & {
    id: string;
    kind: string;
}): BackstageEntity {
    return makeFixtureEntity(overrides);
}
const componentRef = (name: string) => `component:default/${name}`;
const resourceRef = (name: string) => `resource:default/${name}`;
const controlRef = (name: string) => `control:default/${name}`;
const canonicalEntityRef = (name: string) => `canonicalentity:default/${name}`;
// ─── buildSystemDataMatrix ──────────────────────────────────────────────────────
describe("buildSystemDataMatrix", () => {
    it("returns empty matrix with no artifacts", () => {
        const report = buildSystemDataMatrix([]);
        expect(report.applications).toHaveLength(0);
        expect(report.dataStores).toHaveLength(0);
        expect(report.matrix).toHaveLength(0);
        expect(report.summary.connectionCount).toBe(0);
    });
    it("finds app → data-store connections via uses relation", () => {
        const artifacts = [
            makeEntity({
                ref: "component:orders",
                kind: "Component",
                type: "website",
                title: "Order Service",
                uses: ["resource:orders-db"]
            }),
            makeEntity({
                ref: "resource:orders-db",
                kind: "Resource",
                type: "database",
                title: "Orders DB",
                technology: { engine: "postgresql", category: "relational" }
            }),
        ];
        const report = buildSystemDataMatrix(artifacts);
        expect(report.applications).toHaveLength(1);
        expect(report.dataStores).toHaveLength(1);
        expect(report.matrix).toHaveLength(1);
        expect(report.matrix[0].applicationId).toBe(componentRef("orders"));
        expect(report.matrix[0].dataStoreId).toBe(resourceRef("orders-db"));
        expect(report.summary.connectionCount).toBe(1);
    });
    it("includes logical models linked via stores relation", () => {
        const artifacts = [
            makeEntity({
                ref: "component:orders",
                kind: "Component",
                type: "website",
                uses: ["resource:orders-db"]
            }),
            makeEntity({
                ref: "resource:orders-db",
                kind: "Resource",
                type: "database",
                stores: ["canonicalentity:order"]
            }),
            makeEntity({
                ref: "canonicalentity:order",
                kind: "CanonicalEntity",
                type: "logical-data-model",
                title: "Order Entity",
                attributes: [
                    { name: "id", type: "uuid" },
                    { name: "email", type: "string", classification: "PII" }
                ]
            }),
        ];
        const report = buildSystemDataMatrix(artifacts);
        expect(report.matrix[0].logicalModels).toHaveLength(1);
        expect(report.matrix[0].logicalModels[0].id).toBe(canonicalEntityRef("order"));
        expect(report.matrix[0].logicalModels[0].title).toBe("Order Entity");
        expect(report.matrix[0].logicalModels[0].classifications).toContain("PII");
    });
    it("collects classifications from LDM attributes", () => {
        const artifacts = [
            makeEntity({
                ref: "component:crm",
                kind: "Component",
                type: "website",
                uses: ["resource:customer"]
            }),
            makeEntity({
                ref: "resource:customer",
                kind: "Resource",
                type: "database",
                stores: ["canonicalentity:customer"]
            }),
            makeEntity({
                ref: "canonicalentity:customer",
                kind: "CanonicalEntity",
                type: "logical-data-model",
                title: "Customer",
                attributes: [
                    { name: "ssn", type: "string", classification: "PII" },
                    { name: "salary", type: "decimal", classification: "financial" },
                    { name: "name", type: "string", classification: "PII" }
                ]
            }),
        ];
        const report = buildSystemDataMatrix(artifacts);
        expect(report.classifications).toContain("PII");
        expect(report.classifications).toContain("financial");
        expect(report.summary.classificationCount).toBe(2);
        // LDM should dedupe PII
        expect(report.matrix[0].logicalModels[0].classifications).toEqual(["PII", "financial"]);
    });
    it("handles multiple apps using same store", () => {
        const artifacts = [
            makeEntity({
                ref: "component:orders",
                kind: "Component",
                type: "website",
                uses: ["resource:shared"]
            }),
            makeEntity({
                ref: "component:billing",
                kind: "Component",
                type: "website",
                uses: ["resource:shared"]
            }),
            makeEntity({
                ref: "resource:shared",
                kind: "Resource",
                type: "database"
            }),
        ];
        const report = buildSystemDataMatrix(artifacts);
        expect(report.matrix).toHaveLength(2);
        expect(report.summary.connectionCount).toBe(2);
    });
    it("handles app using multiple stores", () => {
        const artifacts = [
            makeEntity({
                ref: "component:monolith",
                kind: "Component",
                type: "website",
                uses: ["resource:pg", "resource:redis"]
            }),
            makeEntity({ ref: "resource:pg", kind: "Resource", type: "database" }),
            makeEntity({ ref: "resource:redis", kind: "Resource", type: "database" }),
        ];
        const report = buildSystemDataMatrix(artifacts);
        expect(report.matrix).toHaveLength(2);
    });
    it("ignores non-uses relations", () => {
        const artifacts = [
            makeEntity({
                ref: "component:orders",
                kind: "Component",
                type: "website",
                dependsOn: ["resource:orders-db"]
            }),
            makeEntity({ ref: "resource:orders-db", kind: "Resource", type: "database" }),
        ];
        const report = buildSystemDataMatrix(artifacts);
        expect(report.matrix).toHaveLength(0);
    });
    it("includes LDMs linked via implementedBy relation", () => {
        const artifacts = [
            makeEntity({
                ref: "component:orders",
                kind: "Component",
                type: "website",
                uses: ["resource:orders-db"]
            }),
            makeEntity({
                ref: "resource:orders-db",
                kind: "Resource",
                type: "database"
            }),
            makeEntity({
                ref: "canonicalentity:order",
                kind: "CanonicalEntity",
                type: "logical-data-model",
                title: "Order Model",
                attributes: [{ name: "id", type: "uuid" }],
                implementedBy: ["resource:orders-db"]
            }),
        ];
        const report = buildSystemDataMatrix(artifacts);
        expect(report.matrix[0].logicalModels).toHaveLength(1);
        expect(report.matrix[0].logicalModels[0].id).toBe(canonicalEntityRef("order"));
    });
    it("extracts technology from data-store", () => {
        const artifacts = [
            makeEntity({
                ref: "resource:pg",
                kind: "Resource",
                type: "database",
                title: "PG Store",
                technology: { engine: "postgresql", category: "relational" }
            }),
        ];
        const report = buildSystemDataMatrix(artifacts);
        expect(report.dataStores[0].technology).toBe("postgresql");
    });
});
// ─── renderSystemDataMatrixMarkdown ─────────────────────────────────────────────
describe("renderSystemDataMatrixMarkdown", () => {
    it("renders empty report", () => {
        const report = buildSystemDataMatrix([]);
        const md = renderSystemDataMatrixMarkdown(report);
        expect(md).toContain("# System-Data Matrix");
        expect(md).toContain("0 applications");
        expect(md).toContain("No application");
    });
    it("renders table with connections", () => {
        const artifacts = [
            makeEntity({
                ref: "component:orders",
                kind: "Component",
                type: "website",
                title: "Order Service",
                uses: ["resource:pg"]
            }),
            makeEntity({
                ref: "resource:pg",
                kind: "Resource",
                type: "database",
                title: "Orders DB",
                technology: { engine: "postgresql", category: "relational" }
            }),
        ];
        const report = buildSystemDataMatrix(artifacts);
        const md = renderSystemDataMatrixMarkdown(report);
        expect(md).toContain("| Application |");
        expect(md).toContain("Order Service");
        expect(md).toContain("Orders DB");
        expect(md).toContain("postgresql");
    });
    it("includes classifications section when present", () => {
        const artifacts = [
            makeEntity({
                ref: "component:crm",
                kind: "Component",
                type: "website",
                uses: ["resource:cust"]
            }),
            makeEntity({
                ref: "resource:cust",
                kind: "Resource",
                type: "database",
                stores: ["canonicalentity:cust"]
            }),
            makeEntity({
                ref: "canonicalentity:cust",
                kind: "CanonicalEntity",
                type: "logical-data-model",
                title: "Customer",
                attributes: [{ name: "ssn", type: "string", classification: "PII" }]
            }),
        ];
        const report = buildSystemDataMatrix(artifacts);
        const md = renderSystemDataMatrixMarkdown(report);
        expect(md).toContain("## Data Classifications");
        expect(md).toContain("- PII");
    });
});
// ─── buildClassificationCoverage ────────────────────────────────────────────────
describe("buildClassificationCoverage", () => {
    it("returns empty report with no artifacts", () => {
        const report = buildClassificationCoverage([]);
        expect(report.classifications).toHaveLength(0);
        expect(report.summary.classificationCount).toBe(0);
    });
    it("finds entities classified under a classification", () => {
        const artifacts = [
            makeEntity({
                ref: "control:pii",
                kind: "Control",
                type: "classification",
                title: "PII",
                level: "restricted",
                requiredControls: [{ control: "encrypt", description: "encrypt" }]
            }),
            makeEntity({
                ref: "canonicalentity:customer",
                kind: "CanonicalEntity",
                title: "Customer Entity",
                classifiedAs: ["control:pii"]
            }),
        ];
        const report = buildClassificationCoverage(artifacts);
        expect(report.classifications).toHaveLength(1);
        expect(report.classifications[0].classificationId).toBe(controlRef("pii"));
        expect(report.classifications[0].coveredEntities).toHaveLength(1);
        expect(report.classifications[0].coveredEntities[0].entityId).toBe(canonicalEntityRef("customer"));
    });
    it("detects enforcement gap when store lacks classification", () => {
        const artifacts = [
            makeEntity({
                ref: "control:pii",
                kind: "Control",
                type: "classification",
                title: "PII",
                level: "restricted",
                requiredControls: [{ control: "encrypt", description: "encrypt" }]
            }),
            makeEntity({
                ref: "canonicalentity:customer",
                kind: "CanonicalEntity",
                title: "Customer Entity",
                classifiedAs: ["control:pii"],
                implementedBy: ["resource:customers"]
            }),
            makeEntity({
                ref: "resource:customers",
                kind: "Resource",
                type: "database",
                title: "Customers DB"
            }),
        ];
        const report = buildClassificationCoverage(artifacts);
        expect(report.classifications[0].stores).toHaveLength(1);
        expect(report.classifications[0].stores[0].enforced).toBe(false);
        expect(report.classifications[0].enforcementGaps).toContain(resourceRef("customers"));
        expect(report.summary.gapCount).toBe(1);
    });
    it("detects no gap when store carries same classification", () => {
        const artifacts = [
            makeEntity({
                ref: "control:pii",
                kind: "Control",
                type: "classification",
                title: "PII",
                level: "restricted",
                requiredControls: [{ control: "encrypt", description: "encrypt" }]
            }),
            makeEntity({
                ref: "canonicalentity:customer",
                kind: "CanonicalEntity",
                title: "Customer Entity",
                classifiedAs: ["control:pii"],
                implementedBy: ["resource:customers"]
            }),
            makeEntity({
                ref: "resource:customers",
                kind: "Resource",
                type: "database",
                title: "Customers DB",
                classifiedAs: ["control:pii"]
            }),
        ];
        const report = buildClassificationCoverage(artifacts);
        expect(report.classifications[0].stores[0].enforced).toBe(true);
        expect(report.classifications[0].enforcementGaps).toHaveLength(0);
        expect(report.summary.gapCount).toBe(0);
    });
    it("finds stores via stores relation (reverse direction)", () => {
        const artifacts = [
            makeEntity({
                ref: "control:pii",
                kind: "Control",
                type: "classification",
                title: "PII",
                level: "restricted",
                requiredControls: [{ control: "encrypt", description: "encrypt" }]
            }),
            makeEntity({
                ref: "canonicalentity:customer",
                kind: "CanonicalEntity",
                title: "Customer",
                classifiedAs: ["control:pii"]
            }),
            makeEntity({
                ref: "resource:orders",
                kind: "Resource",
                type: "database",
                title: "Orders DB",
                stores: ["canonicalentity:customer"]
            }),
        ];
        const report = buildClassificationCoverage(artifacts);
        expect(report.classifications[0].stores).toHaveLength(1);
        expect(report.classifications[0].stores[0].storeId).toBe(resourceRef("orders"));
        expect(report.classifications[0].enforcementGaps).toContain(resourceRef("orders"));
    });
    it("detects exchange carrying classified entity without declaration", () => {
        const artifacts = [
            makeEntity({
                ref: "control:pii",
                kind: "Control",
                type: "classification",
                title: "PII",
                level: "restricted",
                requiredControls: [{ control: "encrypt", description: "encrypt" }]
            }),
            makeEntity({
                ref: "canonicalentity:customer",
                kind: "CanonicalEntity",
                title: "Customer",
                classifiedAs: ["control:pii"]
            }),
            makeEntity({
                ref: "exchange:onboarding",
                kind: "Exchange",
                title: "Customer Onboarding",
                source: { entityRef: "component:frontend" },
                destination: { entityRef: "component:backend" },
                exchangedEntities: [canonicalEntityRef("customer")],
                purpose: "Onboarding flow"
            }),
        ];
        const report = buildClassificationCoverage(artifacts);
        expect(report.classifications[0].exchanges).toHaveLength(1);
        expect(report.classifications[0].exchanges[0].declaresClassification).toBe(false);
        expect(report.summary.exchangeGapCount).toBe(1);
    });
    it("reports no exchange gap when classificationLevel matches", () => {
        const artifacts = [
            makeEntity({
                ref: "control:pii",
                kind: "Control",
                type: "classification",
                title: "PII",
                level: "restricted",
                requiredControls: [{ control: "encrypt", description: "encrypt" }]
            }),
            makeEntity({
                ref: "canonicalentity:customer",
                kind: "CanonicalEntity",
                title: "Customer",
                classifiedAs: ["control:pii"]
            }),
            makeEntity({
                ref: "exchange:onboarding",
                kind: "Exchange",
                title: "Customer Onboarding",
                source: { entityRef: "component:frontend" },
                destination: { entityRef: "component:backend" },
                exchangedEntities: [canonicalEntityRef("customer")],
                purpose: "Onboarding flow",
                classificationLevel: controlRef("pii")
            }),
        ];
        const report = buildClassificationCoverage(artifacts);
        expect(report.classifications[0].exchanges[0].declaresClassification).toBe(true);
        expect(report.summary.exchangeGapCount).toBe(0);
    });
    it("handles multiple classifications with mixed enforcement", () => {
        const artifacts = [
            makeEntity({
                ref: "control:pii",
                kind: "Control",
                type: "classification",
                title: "PII",
                level: "restricted",
                requiredControls: [{ control: "encrypt", description: "encrypt" }]
            }),
            makeEntity({
                ref: "control:financial",
                kind: "Control",
                type: "classification",
                title: "Financial",
                level: "confidential",
                requiredControls: [{ control: "audit", description: "audit" }]
            }),
            makeEntity({
                ref: "canonicalentity:customer",
                kind: "CanonicalEntity",
                title: "Customer",
                classifiedAs: ["control:pii"],
                implementedBy: ["resource:crm"]
            }),
            makeEntity({
                ref: "canonicalentity:payment",
                kind: "CanonicalEntity",
                title: "Payment",
                classifiedAs: ["control:financial"],
                implementedBy: ["resource:billing"]
            }),
            makeEntity({
                ref: "resource:crm",
                kind: "Resource",
                type: "database",
                title: "CRM DB",
                classifiedAs: ["control:pii"]
            }),
            makeEntity({
                ref: "resource:billing",
                kind: "Resource",
                type: "database",
                title: "Billing DB"
            }),
        ];
        const report = buildClassificationCoverage(artifacts);
        expect(report.summary.classificationCount).toBe(2);
        const pii = report.classifications.find((c) => c.classificationId === controlRef("pii"));
        expect(pii!.enforcementGaps).toHaveLength(0);
        const fin = report.classifications.find((c) => c.classificationId === controlRef("financial"));
        expect(fin!.enforcementGaps).toContain(resourceRef("billing"));
        expect(report.summary.gapCount).toBe(1);
        expect(report.summary.enforcedStoreCount).toBe(1);
    });
});
// ─── renderClassificationCoverageMarkdown ───────────────────────────────────────
describe("renderClassificationCoverageMarkdown", () => {
    it("renders empty report", () => {
        const report = buildClassificationCoverage([]);
        const md = renderClassificationCoverageMarkdown(report);
        expect(md).toContain("# Classification Coverage Report");
        expect(md).toContain("No classifications found");
    });
    it("renders classification with entities and gaps", () => {
        const artifacts = [
            makeEntity({
                ref: "control:pii",
                kind: "Control",
                type: "classification",
                title: "PII Classification",
                level: "restricted",
                requiredControls: [{ control: "encrypt", description: "encrypt" }]
            }),
            makeEntity({
                ref: "canonicalentity:customer",
                kind: "CanonicalEntity",
                title: "Customer Entity",
                classifiedAs: ["control:pii"],
                implementedBy: ["resource:customers"]
            }),
            makeEntity({
                ref: "resource:customers",
                kind: "Resource",
                type: "database",
                title: "Customers DB"
            }),
        ];
        const report = buildClassificationCoverage(artifacts);
        const md = renderClassificationCoverageMarkdown(report);
        expect(md).toContain("# Classification Coverage Report");
        expect(md).toContain("PII Classification");
        expect(md).toContain("**Level:** restricted");
        expect(md).toContain("Customer Entity");
        expect(md).toContain("Customers DB");
        expect(md).toContain("Enforcement Gaps");
        expect(md).toContain(resourceRef("customers"));
        expect(md).toContain("## Summary");
    });
    it("shows enforced stores with checkmarks", () => {
        const artifacts = [
            makeEntity({
                ref: "control:pii",
                kind: "Control",
                type: "classification",
                title: "PII",
                level: "restricted",
                requiredControls: [{ control: "encrypt", description: "encrypt" }]
            }),
            makeEntity({
                ref: "canonicalentity:customer",
                kind: "CanonicalEntity",
                title: "Customer",
                classifiedAs: ["control:pii"],
                implementedBy: ["resource:customers"]
            }),
            makeEntity({
                ref: "resource:customers",
                kind: "Resource",
                type: "database",
                title: "Customers DB",
                classifiedAs: ["control:pii"]
            }),
        ];
        const report = buildClassificationCoverage(artifacts);
        const md = renderClassificationCoverageMarkdown(report);
        expect(md).toContain("✅");
        expect(md).not.toContain("Enforcement Gaps");
    });
});
