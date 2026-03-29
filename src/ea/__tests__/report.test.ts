/**
 * Tests for System-Data Matrix Report
 *
 * Covers:
 *  - buildSystemDataMatrix() logic
 *  - renderSystemDataMatrixMarkdown() output
 *  - CLI ea report --view system-data-matrix
 */

import { describe, it, expect } from "vitest";
import {
  buildSystemDataMatrix,
  renderSystemDataMatrixMarkdown,
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
      makeArtifact({
        id: "APP-orders",
        kind: "application",
        title: "Order Service",
        relations: [{ type: "uses", target: "STORE-orders-db" }],
      }),
      makeArtifact({
        id: "STORE-orders-db",
        kind: "data-store",
        title: "Orders DB",
        technology: { engine: "postgresql", category: "relational" },
      } as any),
    ];

    const report = buildSystemDataMatrix(artifacts);
    expect(report.applications).toHaveLength(1);
    expect(report.dataStores).toHaveLength(1);
    expect(report.matrix).toHaveLength(1);
    expect(report.matrix[0].applicationId).toBe("APP-orders");
    expect(report.matrix[0].dataStoreId).toBe("STORE-orders-db");
    expect(report.summary.connectionCount).toBe(1);
  });

  it("includes logical models linked via stores relation", () => {
    const artifacts = [
      makeArtifact({
        id: "APP-orders",
        kind: "application",
        relations: [{ type: "uses", target: "STORE-orders-db" }],
      }),
      makeArtifact({
        id: "STORE-orders-db",
        kind: "data-store",
        relations: [{ type: "stores", target: "LDM-order" }],
      } as any),
      makeArtifact({
        id: "LDM-order",
        kind: "logical-data-model",
        title: "Order Entity",
        attributes: [
          { name: "id", type: "uuid" },
          { name: "email", type: "string", classification: "PII" },
        ],
      } as any),
    ];

    const report = buildSystemDataMatrix(artifacts);
    expect(report.matrix[0].logicalModels).toHaveLength(1);
    expect(report.matrix[0].logicalModels[0].id).toBe("LDM-order");
    expect(report.matrix[0].logicalModels[0].title).toBe("Order Entity");
    expect(report.matrix[0].logicalModels[0].classifications).toContain("PII");
  });

  it("collects classifications from LDM attributes", () => {
    const artifacts = [
      makeArtifact({
        id: "APP-crm",
        kind: "application",
        relations: [{ type: "uses", target: "STORE-customer" }],
      }),
      makeArtifact({
        id: "STORE-customer",
        kind: "data-store",
        relations: [{ type: "stores", target: "LDM-customer" }],
      } as any),
      makeArtifact({
        id: "LDM-customer",
        kind: "logical-data-model",
        title: "Customer",
        attributes: [
          { name: "ssn", type: "string", classification: "PII" },
          { name: "salary", type: "decimal", classification: "financial" },
          { name: "name", type: "string", classification: "PII" },
        ],
      } as any),
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
      makeArtifact({
        id: "APP-orders",
        kind: "application",
        relations: [{ type: "uses", target: "STORE-shared" }],
      }),
      makeArtifact({
        id: "APP-billing",
        kind: "application",
        relations: [{ type: "uses", target: "STORE-shared" }],
      }),
      makeArtifact({
        id: "STORE-shared",
        kind: "data-store",
      } as any),
    ];

    const report = buildSystemDataMatrix(artifacts);
    expect(report.matrix).toHaveLength(2);
    expect(report.summary.connectionCount).toBe(2);
  });

  it("handles app using multiple stores", () => {
    const artifacts = [
      makeArtifact({
        id: "APP-monolith",
        kind: "application",
        relations: [
          { type: "uses", target: "STORE-pg" },
          { type: "uses", target: "STORE-redis" },
        ],
      }),
      makeArtifact({ id: "STORE-pg", kind: "data-store" } as any),
      makeArtifact({ id: "STORE-redis", kind: "data-store" } as any),
    ];

    const report = buildSystemDataMatrix(artifacts);
    expect(report.matrix).toHaveLength(2);
  });

  it("ignores non-uses relations", () => {
    const artifacts = [
      makeArtifact({
        id: "APP-orders",
        kind: "application",
        relations: [{ type: "dependsOn", target: "STORE-orders-db" }],
      }),
      makeArtifact({ id: "STORE-orders-db", kind: "data-store" } as any),
    ];

    const report = buildSystemDataMatrix(artifacts);
    expect(report.matrix).toHaveLength(0);
  });

  it("includes LDMs linked via implementedBy relation", () => {
    const artifacts = [
      makeArtifact({
        id: "APP-orders",
        kind: "application",
        relations: [{ type: "uses", target: "STORE-orders-db" }],
      }),
      makeArtifact({
        id: "STORE-orders-db",
        kind: "data-store",
      } as any),
      makeArtifact({
        id: "LDM-order",
        kind: "logical-data-model",
        title: "Order Model",
        attributes: [{ name: "id", type: "uuid" }],
        relations: [{ type: "implementedBy", target: "STORE-orders-db" }],
      } as any),
    ];

    const report = buildSystemDataMatrix(artifacts);
    expect(report.matrix[0].logicalModels).toHaveLength(1);
    expect(report.matrix[0].logicalModels[0].id).toBe("LDM-order");
  });

  it("extracts technology from data-store", () => {
    const artifacts = [
      makeArtifact({
        id: "STORE-pg",
        kind: "data-store",
        title: "PG Store",
        technology: { engine: "postgresql", category: "relational" },
      } as any),
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
      makeArtifact({
        id: "APP-orders",
        kind: "application",
        title: "Order Service",
        relations: [{ type: "uses", target: "STORE-pg" }],
      }),
      makeArtifact({
        id: "STORE-pg",
        kind: "data-store",
        title: "Orders DB",
        technology: { engine: "postgresql", category: "relational" },
      } as any),
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
      makeArtifact({
        id: "APP-crm",
        kind: "application",
        relations: [{ type: "uses", target: "STORE-cust" }],
      }),
      makeArtifact({
        id: "STORE-cust",
        kind: "data-store",
        relations: [{ type: "stores", target: "LDM-cust" }],
      } as any),
      makeArtifact({
        id: "LDM-cust",
        kind: "logical-data-model",
        title: "Customer",
        attributes: [{ name: "ssn", type: "string", classification: "PII" }],
      } as any),
    ];

    const report = buildSystemDataMatrix(artifacts);
    const md = renderSystemDataMatrixMarkdown(report);
    expect(md).toContain("## Data Classifications");
    expect(md).toContain("- PII");
  });
});
