/**
 * Tests for Phase 2A: Relations, Quality Rules, and Drift Rules
 *
 * Covers:
 *  - 3 new relations (interfacesWith, standardizes, providedBy)
 *  - Extended relations (consumes → system-interface, boundedBy → cloud-resource/environment)
 *  - 5 kind-specific quality rules
 *  - 4 static-analysis drift rules
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

// ─── Phase 2A Relations ─────────────────────────────────────────────────────────

describe("Phase 2A: New Relations", () => {
  const registry = createDefaultRegistry();

  describe("interfacesWith", () => {
    it("is registered with correct source and target kinds", () => {
      const entry = registry.get("interfacesWith");
      expect(entry).toBeDefined();
      expect(entry!.inverse).toBe("interfacedBy");
      expect(entry!.validSourceKinds).toContain("application");
      expect(entry!.validSourceKinds).toContain("service");
      expect(entry!.validSourceKinds).toContain("integration");
      expect(entry!.validTargetKinds).toContain("system-interface");
    });

    it("validates successfully for valid source/target", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-order-service",
          kind: "application",
          relations: [{ type: "interfacesWith", target: "SIF-payment-gateway" }],
        }),
        makeArtifact({
          id: "SIF-payment-gateway",
          kind: "system-interface",
          direction: "outbound",
          ownership: "external",
        } as any),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects invalid source kind", () => {
      const artifacts = [
        makeArtifact({
          id: "ENV-dev",
          kind: "environment",
          tier: "development",
          isProduction: false,
          relations: [{ type: "interfacesWith", target: "SIF-payment-gateway" }],
        } as any),
        makeArtifact({
          id: "SIF-payment-gateway",
          kind: "system-interface",
          direction: "outbound",
          ownership: "external",
        } as any),
      ];
      const result = validateEaRelations(artifacts, registry);
      const sourceError = result.errors.find((e) => e.rule === "ea:relation:invalid-source");
      expect(sourceError).toBeDefined();
    });
  });

  describe("standardizes", () => {
    it("is registered with correct source and target kinds", () => {
      const entry = registry.get("standardizes");
      expect(entry).toBeDefined();
      expect(entry!.inverse).toBe("standardizedBy");
      expect(entry!.validSourceKinds).toContain("technology-standard");
      expect(entry!.validTargetKinds).toContain("application");
      expect(entry!.validTargetKinds).toContain("cloud-resource");
      expect(entry!.validTargetKinds).toContain("platform");
    });

    it("validates successfully for valid source/target", () => {
      const artifacts = [
        makeArtifact({
          id: "TECH-nodejs",
          kind: "technology-standard",
          category: "runtime",
          technology: "Node.js",
          relations: [{ type: "standardizes", target: "APP-order-service" }],
        } as any),
        makeArtifact({ id: "APP-order-service", kind: "application" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });

    it("allows explicit inverse (standardizedBy)", () => {
      const entry = registry.get("standardizes");
      expect(entry!.allowExplicitInverse).toBe(true);
    });
  });

  describe("providedBy", () => {
    it("is registered with correct source and target kinds", () => {
      const entry = registry.get("providedBy");
      expect(entry).toBeDefined();
      expect(entry!.inverse).toBe("provides");
      expect(entry!.validSourceKinds).toContain("cloud-resource");
      expect(entry!.validTargetKinds).toContain("platform");
    });

    it("validates successfully for valid source/target", () => {
      const artifacts = [
        makeArtifact({
          id: "CLOUD-rds-orders",
          kind: "cloud-resource",
          provider: "aws",
          resourceType: "rds",
          relations: [{ type: "providedBy", target: "PLAT-aws-prod" }],
        } as any),
        makeArtifact({ id: "PLAT-aws-prod", kind: "platform" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });
  });
});

describe("Phase 2A: Extended Relations", () => {
  const registry = createDefaultRegistry();

  it("consumes now accepts system-interface as target", () => {
    const artifacts = [
      makeArtifact({
        id: "APP-frontend",
        kind: "application",
        relations: [{ type: "consumes", target: "SIF-external-api" }],
      }),
      makeArtifact({
        id: "SIF-external-api",
        kind: "system-interface",
        direction: "inbound",
        ownership: "external",
      } as any),
    ];
    const result = validateEaRelations(artifacts, registry);
    const targetError = result.errors.find((e) => e.rule === "ea:relation:invalid-target");
    expect(targetError).toBeUndefined();
  });

  it("boundedBy now accepts cloud-resource as source", () => {
    const artifacts = [
      makeArtifact({
        id: "CLOUD-rds-main",
        kind: "cloud-resource",
        provider: "aws",
        resourceType: "rds",
        relations: [{ type: "boundedBy", target: "ZONE-private" }],
      } as any),
      makeArtifact({ id: "ZONE-private", kind: "network-zone" }),
    ];
    const result = validateEaRelations(artifacts, registry);
    const sourceError = result.errors.find((e) => e.rule === "ea:relation:invalid-source");
    expect(sourceError).toBeUndefined();
  });

  it("boundedBy now accepts environment as source", () => {
    const artifacts = [
      makeArtifact({
        id: "ENV-staging",
        kind: "environment",
        tier: "staging",
        isProduction: false,
        relations: [{ type: "boundedBy", target: "ZONE-dmz" }],
      } as any),
      makeArtifact({ id: "ZONE-dmz", kind: "network-zone" }),
    ];
    const result = validateEaRelations(artifacts, registry);
    const sourceError = result.errors.find((e) => e.rule === "ea:relation:invalid-source");
    expect(sourceError).toBeUndefined();
  });
});

// ─── Kind-Specific Quality Rules ────────────────────────────────────────────────

describe("Phase 2A: Quality Rules", () => {
  describe("ea:quality:system-interface-missing-direction", () => {
    it("fires when system-interface has no direction", () => {
      const artifacts = [
        makeArtifact({
          id: "SIF-missing-dir",
          kind: "system-interface",
          // No direction field
          ownership: "owned",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      const err = result.errors.find(
        (e) => e.rule === "ea:quality:system-interface-missing-direction",
      );
      expect(err).toBeDefined();
    });

    it("does not fire when direction is present", () => {
      const artifacts = [
        makeArtifact({
          id: "SIF-has-dir",
          kind: "system-interface",
          direction: "inbound",
          ownership: "owned",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      const err = result.errors.find(
        (e) => e.rule === "ea:quality:system-interface-missing-direction",
      );
      expect(err).toBeUndefined();
    });
  });

  describe("ea:quality:consumer-missing-contract", () => {
    it("fires when consumer has empty consumesContracts", () => {
      const artifacts = [
        makeArtifact({
          id: "CON-orphan",
          kind: "consumer",
          consumesContracts: [],
          consumerType: "internal",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:quality:consumer-missing-contract",
      );
      expect(warn).toBeDefined();
    });

    it("does not fire when consumesContracts has entries", () => {
      const artifacts = [
        makeArtifact({
          id: "CON-linked",
          kind: "consumer",
          consumesContracts: ["API-orders-v2"],
          consumerType: "external",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:quality:consumer-missing-contract",
      );
      expect(warn).toBeUndefined();
    });
  });

  describe("ea:quality:cloud-resource-missing-provider", () => {
    it("fires when cloud-resource has no provider", () => {
      const artifacts = [
        makeArtifact({
          id: "CLOUD-no-provider",
          kind: "cloud-resource",
          resourceType: "rds",
          // No provider
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      const err = result.errors.find(
        (e) => e.rule === "ea:quality:cloud-resource-missing-provider",
      );
      expect(err).toBeDefined();
    });

    it("does not fire when provider is present", () => {
      const artifacts = [
        makeArtifact({
          id: "CLOUD-with-provider",
          kind: "cloud-resource",
          provider: "aws",
          resourceType: "rds",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      const err = result.errors.find(
        (e) => e.rule === "ea:quality:cloud-resource-missing-provider",
      );
      expect(err).toBeUndefined();
    });
  });

  describe("ea:quality:environment-production-not-restricted", () => {
    it("fires when production environment has non-restricted access", () => {
      const artifacts = [
        makeArtifact({
          id: "ENV-prod",
          kind: "environment",
          tier: "production",
          isProduction: true,
          accessLevel: "team",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:quality:environment-production-not-restricted",
      );
      expect(warn).toBeDefined();
    });

    it("does not fire when production has restricted access", () => {
      const artifacts = [
        makeArtifact({
          id: "ENV-prod-restricted",
          kind: "environment",
          tier: "production",
          isProduction: true,
          accessLevel: "restricted",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:quality:environment-production-not-restricted",
      );
      expect(warn).toBeUndefined();
    });

    it("does not fire when accessLevel is not specified", () => {
      const artifacts = [
        makeArtifact({
          id: "ENV-prod-default",
          kind: "environment",
          tier: "production",
          isProduction: true,
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:quality:environment-production-not-restricted",
      );
      expect(warn).toBeUndefined();
    });
  });

  describe("ea:quality:technology-standard-expired-review", () => {
    it("fires when active standard has passed review date", () => {
      const artifacts = [
        makeArtifact({
          id: "TECH-old-standard",
          kind: "technology-standard",
          status: "active",
          category: "framework",
          technology: "Express",
          reviewBy: "2020-01-01",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:quality:technology-standard-expired-review",
      );
      expect(warn).toBeDefined();
    });

    it("does not fire for future review date", () => {
      const artifacts = [
        makeArtifact({
          id: "TECH-current",
          kind: "technology-standard",
          status: "active",
          category: "framework",
          technology: "Fastify",
          reviewBy: "2099-01-01",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:quality:technology-standard-expired-review",
      );
      expect(warn).toBeUndefined();
    });

    it("does not fire for draft/retired standards", () => {
      const artifacts = [
        makeArtifact({
          id: "TECH-retired",
          kind: "technology-standard",
          status: "retired",
          category: "database",
          technology: "MySQL",
          reviewBy: "2020-01-01",
        } as any),
      ];
      const result = validateEaArtifacts(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:quality:technology-standard-expired-review",
      );
      expect(warn).toBeUndefined();
    });
  });
});

// ─── Drift Rules ────────────────────────────────────────────────────────────────

describe("Phase 2A: Drift Rules", () => {
  describe("ea:drift:consumer-contract-version-mismatch", () => {
    it("fires when consumer contractVersion differs from contract schemaVersion", () => {
      const artifacts = [
        makeArtifact({
          id: "CON-portal",
          kind: "consumer",
          consumesContracts: ["API-orders-v2"],
          consumerType: "external",
          contractVersion: "1.0.0",
        } as any),
        makeArtifact({
          id: "API-orders-v2",
          kind: "api-contract",
          schemaVersion: "2.0.0",
        }),
      ];
      const result = evaluateEaDrift(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:drift:consumer-contract-version-mismatch",
      );
      expect(warn).toBeDefined();
      expect(warn!.message).toContain("1.0.0");
      expect(warn!.message).toContain("2.0.0");
    });

    it("does not fire when versions match", () => {
      const artifacts = [
        makeArtifact({
          id: "CON-portal",
          kind: "consumer",
          consumesContracts: ["API-orders-v2"],
          consumerType: "external",
          contractVersion: "1.0.0",
        } as any),
        makeArtifact({
          id: "API-orders-v2",
          kind: "api-contract",
          schemaVersion: "1.0.0",
        }),
      ];
      const result = evaluateEaDrift(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:drift:consumer-contract-version-mismatch",
      );
      expect(warn).toBeUndefined();
    });

    it("does not fire when consumer has no contractVersion", () => {
      const artifacts = [
        makeArtifact({
          id: "CON-no-version",
          kind: "consumer",
          consumesContracts: ["API-orders-v2"],
          consumerType: "internal",
        } as any),
        makeArtifact({
          id: "API-orders-v2",
          kind: "api-contract",
          schemaVersion: "2.0.0",
        }),
      ];
      const result = evaluateEaDrift(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:drift:consumer-contract-version-mismatch",
      );
      expect(warn).toBeUndefined();
    });
  });

  describe("ea:drift:technology-standard-violation", () => {
    it("fires when cloud resource uses unapproved technology", () => {
      const artifacts = [
        makeArtifact({
          id: "TECH-postgres",
          kind: "technology-standard",
          status: "active",
          category: "database",
          technology: "PostgreSQL",
        } as any),
        makeArtifact({
          id: "CLOUD-mysql-db",
          kind: "cloud-resource",
          provider: "aws",
          resourceType: "rds",
          technology: { engine: "MySQL", version: "8.0" },
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      const err = result.errors.find(
        (e) => e.rule === "ea:drift:technology-standard-violation",
      );
      expect(err).toBeDefined();
      expect(err!.message).toContain("MySQL");
    });

    it("does not fire when cloud resource matches standard", () => {
      const artifacts = [
        makeArtifact({
          id: "TECH-postgres",
          kind: "technology-standard",
          status: "active",
          category: "database",
          technology: "PostgreSQL",
        } as any),
        makeArtifact({
          id: "CLOUD-pg-db",
          kind: "cloud-resource",
          provider: "aws",
          resourceType: "rds",
          technology: { engine: "postgresql", version: "15" },
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      const err = result.errors.find(
        (e) => e.rule === "ea:drift:technology-standard-violation",
      );
      expect(err).toBeUndefined();
    });

    it("does not fire when no standards are active", () => {
      const artifacts = [
        makeArtifact({
          id: "TECH-retired-pg",
          kind: "technology-standard",
          status: "retired",
          category: "database",
          technology: "PostgreSQL",
        } as any),
        makeArtifact({
          id: "CLOUD-mysql-db",
          kind: "cloud-resource",
          provider: "aws",
          resourceType: "rds",
          technology: { engine: "MySQL", version: "8.0" },
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      const err = result.errors.find(
        (e) => e.rule === "ea:drift:technology-standard-violation",
      );
      expect(err).toBeUndefined();
    });
  });

  describe("ea:drift:deprecated-version-in-use", () => {
    it("fires when cloud resource uses deprecated version", () => {
      const artifacts = [
        makeArtifact({
          id: "TECH-postgres",
          kind: "technology-standard",
          status: "active",
          category: "database",
          technology: "PostgreSQL",
          deprecatedVersions: ["11", "12"],
          approvedVersions: ["15", "16"],
        } as any),
        makeArtifact({
          id: "CLOUD-old-pg",
          kind: "cloud-resource",
          provider: "aws",
          resourceType: "rds",
          technology: { engine: "PostgreSQL", version: "12" },
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:drift:deprecated-version-in-use",
      );
      expect(warn).toBeDefined();
      expect(warn!.message).toContain("12");
    });

    it("does not fire for approved version", () => {
      const artifacts = [
        makeArtifact({
          id: "TECH-postgres",
          kind: "technology-standard",
          status: "active",
          category: "database",
          technology: "PostgreSQL",
          deprecatedVersions: ["11", "12"],
          approvedVersions: ["15", "16"],
        } as any),
        makeArtifact({
          id: "CLOUD-new-pg",
          kind: "cloud-resource",
          provider: "aws",
          resourceType: "rds",
          technology: { engine: "PostgreSQL", version: "16" },
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:drift:deprecated-version-in-use",
      );
      expect(warn).toBeUndefined();
    });
  });

  describe("ea:drift:environment-promotion-gap", () => {
    it("fires when promotesFrom references non-existent environment", () => {
      const artifacts = [
        makeArtifact({
          id: "ENV-staging",
          kind: "environment",
          tier: "staging",
          isProduction: false,
          promotesFrom: "ENV-dev",
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:drift:environment-promotion-gap",
      );
      expect(warn).toBeDefined();
      expect(warn!.message).toContain("ENV-dev");
    });

    it("fires when promotesTo references non-existent environment", () => {
      const artifacts = [
        makeArtifact({
          id: "ENV-staging",
          kind: "environment",
          tier: "staging",
          isProduction: false,
          promotesTo: "ENV-production",
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:drift:environment-promotion-gap",
      );
      expect(warn).toBeDefined();
      expect(warn!.message).toContain("ENV-production");
    });

    it("does not fire when promotion chain is complete", () => {
      const artifacts = [
        makeArtifact({
          id: "ENV-dev",
          kind: "environment",
          tier: "development",
          isProduction: false,
          promotesTo: "ENV-staging",
        } as any),
        makeArtifact({
          id: "ENV-staging",
          kind: "environment",
          tier: "staging",
          isProduction: false,
          promotesFrom: "ENV-dev",
          promotesTo: "ENV-prod",
        } as any),
        makeArtifact({
          id: "ENV-prod",
          kind: "environment",
          tier: "production",
          isProduction: true,
          promotesFrom: "ENV-staging",
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      const warn = result.warnings.find(
        (e) => e.rule === "ea:drift:environment-promotion-gap",
      );
      expect(warn).toBeUndefined();
    });
  });

  describe("evaluateEaDrift options", () => {
    it("skips resolver-dependent rules by default", () => {
      const result = evaluateEaDrift([]);
      expect(result.rulesSkipped).toBe(2); // 2 resolver stubs
      expect(result.rulesEvaluated).toBe(4); // 4 static rules
    });

    it("includes resolver rules when requested", () => {
      const result = evaluateEaDrift([], { includeResolverRules: true });
      expect(result.rulesSkipped).toBe(0);
      expect(result.rulesEvaluated).toBe(6);
    });
  });
});
