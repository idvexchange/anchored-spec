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
import {
  buildSystemDataMatrix,
  renderSystemDataMatrixMarkdown,
  buildClassificationCoverage,
  renderClassificationCoverageMarkdown,
} from "../index.js";
import { artifactToBackstage } from "../backstage/bridge.js";
import type { BackstageEntity } from "../backstage/types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeEntity(overrides: Record<string, unknown> & { id: string; kind: string }): BackstageEntity {
  const { id, kind, title, summary, owners, tags, confidence, status, schemaVersion, apiVersion, name, domain, owner, lastUpdated, relations, ...specFields } = overrides;
  const artifact = {
    id,
    kind,
    schemaVersion: (schemaVersion as string) ?? "1.0.0",
    title: (title as string) ?? id,
    summary: (summary as string) ?? "A well-described artifact for testing purposes.",
    owners: (owners as string[]) ?? ["team-test"],
    tags: (tags as string[]) ?? [],
    confidence: (confidence as string) ?? "declared",
    status: (status as string) ?? "active",
    relations: (relations as Array<{ type: string; target: string }>) ?? [],
    ...(Object.keys(specFields).length > 0 && { extensions: specFields }),
  } as import("../types.js").EaArtifactBase;
  return artifactToBackstage(artifact);
}

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
        id: "APP-orders",
        kind: "application",
        title: "Order Service",
        relations: [{ type: "uses", target: "STORE-orders-db" }],
      }),
      makeEntity({
        id: "STORE-orders-db",
        kind: "data-store",
        title: "Orders DB",
        technology: { engine: "postgresql", category: "relational" },
      }),
    ];

    const report = buildSystemDataMatrix(artifacts);
    expect(report.applications).toHaveLength(1);
    expect(report.dataStores).toHaveLength(1);
    expect(report.matrix).toHaveLength(1);
    expect(report.matrix[0].applicationId).toBe("component:orders");
    expect(report.matrix[0].dataStoreId).toBe("resource:orders-db");
    expect(report.summary.connectionCount).toBe(1);
  });

  it("includes logical models linked via stores relation", () => {
    const artifacts = [
      makeEntity({
        id: "APP-orders",
        kind: "application",
        relations: [{ type: "uses", target: "STORE-orders-db" }],
      }),
      makeEntity({
        id: "STORE-orders-db",
        kind: "data-store",
        relations: [{ type: "stores", target: "LDM-order" }],
      }),
      makeEntity({
        id: "LDM-order",
        kind: "logical-data-model",
        title: "Order Entity",
        attributes: [
          { name: "id", type: "uuid" },
          { name: "email", type: "string", classification: "PII" },
        ],
      }),
    ];

    const report = buildSystemDataMatrix(artifacts);
    expect(report.matrix[0].logicalModels).toHaveLength(1);
    expect(report.matrix[0].logicalModels[0].id).toBe("canonicalentity:order");
    expect(report.matrix[0].logicalModels[0].title).toBe("Order Entity");
    expect(report.matrix[0].logicalModels[0].classifications).toContain("PII");
  });

  it("collects classifications from LDM attributes", () => {
    const artifacts = [
      makeEntity({
        id: "APP-crm",
        kind: "application",
        relations: [{ type: "uses", target: "STORE-customer" }],
      }),
      makeEntity({
        id: "STORE-customer",
        kind: "data-store",
        relations: [{ type: "stores", target: "LDM-customer" }],
      }),
      makeEntity({
        id: "LDM-customer",
        kind: "logical-data-model",
        title: "Customer",
        attributes: [
          { name: "ssn", type: "string", classification: "PII" },
          { name: "salary", type: "decimal", classification: "financial" },
          { name: "name", type: "string", classification: "PII" },
        ],
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
        id: "APP-orders",
        kind: "application",
        relations: [{ type: "uses", target: "STORE-shared" }],
      }),
      makeEntity({
        id: "APP-billing",
        kind: "application",
        relations: [{ type: "uses", target: "STORE-shared" }],
      }),
      makeEntity({
        id: "STORE-shared",
        kind: "data-store",
      }),
    ];

    const report = buildSystemDataMatrix(artifacts);
    expect(report.matrix).toHaveLength(2);
    expect(report.summary.connectionCount).toBe(2);
  });

  it("handles app using multiple stores", () => {
    const artifacts = [
      makeEntity({
        id: "APP-monolith",
        kind: "application",
        relations: [
          { type: "uses", target: "STORE-pg" },
          { type: "uses", target: "STORE-redis" },
        ],
      }),
      makeEntity({ id: "STORE-pg", kind: "data-store" }),
      makeEntity({ id: "STORE-redis", kind: "data-store" }),
    ];

    const report = buildSystemDataMatrix(artifacts);
    expect(report.matrix).toHaveLength(2);
  });

  it("ignores non-uses relations", () => {
    const artifacts = [
      makeEntity({
        id: "APP-orders",
        kind: "application",
        relations: [{ type: "dependsOn", target: "STORE-orders-db" }],
      }),
      makeEntity({ id: "STORE-orders-db", kind: "data-store" }),
    ];

    const report = buildSystemDataMatrix(artifacts);
    expect(report.matrix).toHaveLength(0);
  });

  it("includes LDMs linked via implementedBy relation", () => {
    const artifacts = [
      makeEntity({
        id: "APP-orders",
        kind: "application",
        relations: [{ type: "uses", target: "STORE-orders-db" }],
      }),
      makeEntity({
        id: "STORE-orders-db",
        kind: "data-store",
      }),
      makeEntity({
        id: "LDM-order",
        kind: "logical-data-model",
        title: "Order Model",
        attributes: [{ name: "id", type: "uuid" }],
        relations: [{ type: "implementedBy", target: "STORE-orders-db" }],
      }),
    ];

    const report = buildSystemDataMatrix(artifacts);
    expect(report.matrix[0].logicalModels).toHaveLength(1);
    expect(report.matrix[0].logicalModels[0].id).toBe("canonicalentity:order");
  });

  it("extracts technology from data-store", () => {
    const artifacts = [
      makeEntity({
        id: "STORE-pg",
        kind: "data-store",
        title: "PG Store",
        technology: { engine: "postgresql", category: "relational" },
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
        id: "APP-orders",
        kind: "application",
        title: "Order Service",
        relations: [{ type: "uses", target: "STORE-pg" }],
      }),
      makeEntity({
        id: "STORE-pg",
        kind: "data-store",
        title: "Orders DB",
        technology: { engine: "postgresql", category: "relational" },
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
        id: "APP-crm",
        kind: "application",
        relations: [{ type: "uses", target: "STORE-cust" }],
      }),
      makeEntity({
        id: "STORE-cust",
        kind: "data-store",
        relations: [{ type: "stores", target: "LDM-cust" }],
      }),
      makeEntity({
        id: "LDM-cust",
        kind: "logical-data-model",
        title: "Customer",
        attributes: [{ name: "ssn", type: "string", classification: "PII" }],
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
        id: "CLASS-pii",
        kind: "classification",
        title: "PII",
        level: "restricted",
        requiredControls: [{ control: "encrypt", description: "encrypt" }],
      }),
      makeEntity({
        id: "CE-customer",
        kind: "canonical-entity",
        title: "Customer Entity",
        relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
      }),
    ];

    const report = buildClassificationCoverage(artifacts);
    expect(report.classifications).toHaveLength(1);
    expect(report.classifications[0].classificationId).toBe("control:pii");
    expect(report.classifications[0].coveredEntities).toHaveLength(1);
    expect(report.classifications[0].coveredEntities[0].entityId).toBe("canonicalentity:customer");
  });

  it("detects enforcement gap when store lacks classification", () => {
    const artifacts = [
      makeEntity({
        id: "CLASS-pii",
        kind: "classification",
        title: "PII",
        level: "restricted",
        requiredControls: [{ control: "encrypt", description: "encrypt" }],
      }),
      makeEntity({
        id: "CE-customer",
        kind: "canonical-entity",
        title: "Customer Entity",
        relations: [
          { type: "classifiedAs", target: "CLASS-pii" },
          { type: "implementedBy", target: "STORE-customers" },
        ],
      }),
      makeEntity({
        id: "STORE-customers",
        kind: "data-store",
        title: "Customers DB",
        // No classifiedAs relation — this is the gap
      }),
    ];

    const report = buildClassificationCoverage(artifacts);
    expect(report.classifications[0].stores).toHaveLength(1);
    expect(report.classifications[0].stores[0].enforced).toBe(false);
    expect(report.classifications[0].enforcementGaps).toContain("resource:customers");
    expect(report.summary.gapCount).toBe(1);
  });

  it("detects no gap when store carries same classification", () => {
    const artifacts = [
      makeEntity({
        id: "CLASS-pii",
        kind: "classification",
        title: "PII",
        level: "restricted",
        requiredControls: [{ control: "encrypt", description: "encrypt" }],
      }),
      makeEntity({
        id: "CE-customer",
        kind: "canonical-entity",
        title: "Customer Entity",
        relations: [
          { type: "classifiedAs", target: "CLASS-pii" },
          { type: "implementedBy", target: "STORE-customers" },
        ],
      }),
      makeEntity({
        id: "STORE-customers",
        kind: "data-store",
        title: "Customers DB",
        relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
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
        id: "CLASS-pii",
        kind: "classification",
        title: "PII",
        level: "restricted",
        requiredControls: [{ control: "encrypt", description: "encrypt" }],
      }),
      makeEntity({
        id: "CE-customer",
        kind: "canonical-entity",
        title: "Customer",
        relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
      }),
      makeEntity({
        id: "STORE-orders",
        kind: "data-store",
        title: "Orders DB",
        relations: [{ type: "stores", target: "CE-customer" }],
      }),
    ];

    const report = buildClassificationCoverage(artifacts);
    expect(report.classifications[0].stores).toHaveLength(1);
    expect(report.classifications[0].stores[0].storeId).toBe("resource:orders");
    expect(report.classifications[0].enforcementGaps).toContain("resource:orders");
  });

  it("detects exchange carrying classified entity without declaration", () => {
    const artifacts = [
      makeEntity({
        id: "CLASS-pii",
        kind: "classification",
        title: "PII",
        level: "restricted",
        requiredControls: [{ control: "encrypt", description: "encrypt" }],
      }),
      makeEntity({
        id: "CE-customer",
        kind: "canonical-entity",
        title: "Customer",
        relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
      }),
      makeEntity({
        id: "EXCH-onboarding",
        kind: "information-exchange",
        title: "Customer Onboarding",
        source: { artifactId: "APP-frontend" },
        destination: { artifactId: "APP-backend" },
        exchangedEntities: ["canonicalentity:customer"],
        purpose: "Onboarding flow",
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
        id: "CLASS-pii",
        kind: "classification",
        title: "PII",
        level: "restricted",
        requiredControls: [{ control: "encrypt", description: "encrypt" }],
      }),
      makeEntity({
        id: "CE-customer",
        kind: "canonical-entity",
        title: "Customer",
        relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
      }),
      makeEntity({
        id: "EXCH-onboarding",
        kind: "information-exchange",
        title: "Customer Onboarding",
        source: { artifactId: "APP-frontend" },
        destination: { artifactId: "APP-backend" },
        exchangedEntities: ["canonicalentity:customer"],
        purpose: "Onboarding flow",
        classificationLevel: "control:pii",
      }),
    ];

    const report = buildClassificationCoverage(artifacts);
    expect(report.classifications[0].exchanges[0].declaresClassification).toBe(true);
    expect(report.summary.exchangeGapCount).toBe(0);
  });

  it("handles multiple classifications with mixed enforcement", () => {
    const artifacts = [
      makeEntity({
        id: "CLASS-pii",
        kind: "classification",
        title: "PII",
        level: "restricted",
        requiredControls: [{ control: "encrypt", description: "encrypt" }],
      }),
      makeEntity({
        id: "CLASS-financial",
        kind: "classification",
        title: "Financial",
        level: "confidential",
        requiredControls: [{ control: "audit", description: "audit" }],
      }),
      makeEntity({
        id: "CE-customer",
        kind: "canonical-entity",
        title: "Customer",
        relations: [
          { type: "classifiedAs", target: "CLASS-pii" },
          { type: "implementedBy", target: "STORE-crm" },
        ],
      }),
      makeEntity({
        id: "CE-payment",
        kind: "canonical-entity",
        title: "Payment",
        relations: [
          { type: "classifiedAs", target: "CLASS-financial" },
          { type: "implementedBy", target: "STORE-billing" },
        ],
      }),
      makeEntity({
        id: "STORE-crm",
        kind: "data-store",
        title: "CRM DB",
        relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
      }),
      makeEntity({
        id: "STORE-billing",
        kind: "data-store",
        title: "Billing DB",
        // No classifiedAs — gap
      }),
    ];

    const report = buildClassificationCoverage(artifacts);
    expect(report.summary.classificationCount).toBe(2);
    
    const pii = report.classifications.find((c) => c.classificationId === "control:pii");
    expect(pii!.enforcementGaps).toHaveLength(0);

    const fin = report.classifications.find((c) => c.classificationId === "control:financial");
    expect(fin!.enforcementGaps).toContain("resource:billing");
    
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
        id: "CLASS-pii",
        kind: "classification",
        title: "PII Classification",
        level: "restricted",
        requiredControls: [{ control: "encrypt", description: "encrypt" }],
      }),
      makeEntity({
        id: "CE-customer",
        kind: "canonical-entity",
        title: "Customer Entity",
        relations: [
          { type: "classifiedAs", target: "CLASS-pii" },
          { type: "implementedBy", target: "STORE-customers" },
        ],
      }),
      makeEntity({
        id: "STORE-customers",
        kind: "data-store",
        title: "Customers DB",
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
    expect(md).toContain("resource:customers");
    expect(md).toContain("## Summary");
  });

  it("shows enforced stores with checkmarks", () => {
    const artifacts = [
      makeEntity({
        id: "CLASS-pii",
        kind: "classification",
        title: "PII",
        level: "restricted",
        requiredControls: [{ control: "encrypt", description: "encrypt" }],
      }),
      makeEntity({
        id: "CE-customer",
        kind: "canonical-entity",
        title: "Customer",
        relations: [
          { type: "classifiedAs", target: "CLASS-pii" },
          { type: "implementedBy", target: "STORE-customers" },
        ],
      }),
      makeEntity({
        id: "STORE-customers",
        kind: "data-store",
        title: "Customers DB",
        relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
      }),
    ];

    const report = buildClassificationCoverage(artifacts);
    const md = renderClassificationCoverageMarkdown(report);
    expect(md).toContain("✅");
    expect(md).not.toContain("Enforcement Gaps");
  });
});
