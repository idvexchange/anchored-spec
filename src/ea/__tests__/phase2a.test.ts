/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for Phase 2A: Relations, Quality Rules, and Drift Rules
 *
 * Covers:
 *  - 3 new relations (interfacesWith, standardizes, providedBy)
 *  - Extended relations (consumes → system-interface, boundedBy → cloud-resource/environment)
 *  - 5 schema-specific quality rules
 *  - 4 static-analysis drift rules
 */
import { describe, it, expect } from "vitest";
import { createDefaultRegistry, validateEntities, validateEaRelations, evaluateEaDrift, } from "../index.js";
import { makeEntity } from "./helpers/make-entity.js";
// ─── Phase 2A Relations ─────────────────────────────────────────────────────────
describe("Phase 2A: New Relations", () => {
    const registry = createDefaultRegistry();
    describe("interfacesWith", () => {
        it("is registered with correct source and target kinds", () => {
            const entry = registry.get("interfacesWith");
            expect(entry).toBeDefined();
            expect(entry!.inverse).toBe("interfacedBy");
            expect(entry!.validSourceSchemas).toContain("application");
            expect(entry!.validSourceSchemas).toContain("service");
            expect(entry!.validSourceSchemas).toContain("integration");
            expect(entry!.validTargetSchemas).toContain("system-interface");
        });
        it("validates successfully for valid source/target", () => {
            const artifacts = [
                makeEntity({
                    ref: "component:order-service",
                    kind: "Component",
                    type: "website",
                    interfacesWith: ["systeminterface:payment-gateway"]
                }),
                makeEntity({
                    ref: "systeminterface:payment-gateway",
                    kind: "SystemInterface",
                    direction: "outbound",
                    ownership: "external"
                } as any),
            ];
            const result = validateEaRelations(artifacts, registry);
            const relErrors = result.errors.filter((e) => e.rule !== "ea:relation:target-missing");
            expect(relErrors).toHaveLength(0);
        });
        it("rejects invalid source kind", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:dev",
                    kind: "Resource",
                    type: "environment",
                    tier: "development",
                    isProduction: false,
                    interfacesWith: ["systeminterface:payment-gateway"]
                } as any),
                makeEntity({
                    ref: "systeminterface:payment-gateway",
                    kind: "SystemInterface",
                    direction: "outbound",
                    ownership: "external"
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
            expect(entry!.validSourceSchemas).toContain("technology-standard");
            expect(entry!.validTargetSchemas).toContain("application");
            expect(entry!.validTargetSchemas).toContain("cloud-resource");
            expect(entry!.validTargetSchemas).toContain("platform");
        });
        it("validates successfully for valid source/target", () => {
            const artifacts = [
                makeEntity({
                    ref: "technology:nodejs",
                    kind: "Technology",
                    category: "runtime",
                    technology: "Node.js",
                    standardizes: ["component:order-service"]
                } as any),
                makeEntity({ ref: "component:order-service", kind: "Component", type: "website" }),
            ];
            const result = validateEaRelations(artifacts, registry);
            const relErrors = result.errors.filter((e) => e.rule !== "ea:relation:target-missing");
            expect(relErrors).toHaveLength(0);
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
            expect(entry!.validSourceSchemas).toContain("cloud-resource");
            expect(entry!.validTargetSchemas).toContain("platform");
        });
        it("validates successfully for valid source/target", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:rds-orders",
                    kind: "Resource",
                    type: "cloud-resource",
                    provider: "aws",
                    resourceType: "rds",
                    providedBy: ["component:aws-prod"]
                } as any),
                makeEntity({
                    ref: "component:aws-prod",
                    kind: "Component",
                    type: "service",
                    platformType: "kubernetes"
                } as any),
            ];
            const result = validateEaRelations(artifacts, registry);
            const relErrors = result.errors.filter((e) => e.rule !== "ea:relation:target-missing");
            expect(relErrors).toHaveLength(0);
        });
    });
});
describe("Phase 2A: Extended Relations", () => {
    const registry = createDefaultRegistry();
    it("consumes now accepts system-interface as target", () => {
        const artifacts = [
            makeEntity({
                ref: "component:frontend",
                kind: "Component",
                type: "website",
                consumesApis: ["systeminterface:external-api"]
            }),
            makeEntity({
                ref: "systeminterface:external-api",
                kind: "SystemInterface",
                direction: "inbound",
                ownership: "external"
            } as any),
        ];
        const result = validateEaRelations(artifacts, registry);
        const targetError = result.errors.find((e) => e.rule === "ea:relation:invalid-target");
        expect(targetError).toBeUndefined();
    });
    it("boundedBy now accepts cloud-resource as source", () => {
        const artifacts = [
            makeEntity({
                ref: "resource:rds-main",
                kind: "Resource",
                type: "cloud-resource",
                provider: "aws",
                resourceType: "rds",
                boundedBy: ["resource:private"]
            } as any),
            makeEntity({ ref: "resource:private", kind: "Resource", type: "network-zone" }),
        ];
        const result = validateEaRelations(artifacts, registry);
        const sourceError = result.errors.find((e) => e.rule === "ea:relation:invalid-source");
        expect(sourceError).toBeUndefined();
    });
    it("boundedBy now accepts environment as source", () => {
        const artifacts = [
            makeEntity({
                ref: "resource:staging",
                kind: "Resource",
                type: "environment",
                tier: "staging",
                isProduction: false,
                boundedBy: ["resource:dmz"]
            } as any),
            makeEntity({ ref: "resource:dmz", kind: "Resource", type: "network-zone" }),
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
                makeEntity({
                    ref: "systeminterface:missing-dir",
                    kind: "SystemInterface",
                    // No direction field
                    ownership: "owned"
                } as any),
            ];
            const result = validateEntities(artifacts);
            const err = result.errors.find((e) => e.rule === "ea:quality:system-interface-missing-direction");
            expect(err).toBeDefined();
        });
        it("does not fire when direction is present", () => {
            const artifacts = [
                makeEntity({
                    ref: "systeminterface:has-dir",
                    kind: "SystemInterface",
                    direction: "inbound",
                    ownership: "owned"
                } as any),
            ];
            const result = validateEntities(artifacts);
            const err = result.errors.find((e) => e.rule === "ea:quality:system-interface-missing-direction");
            expect(err).toBeUndefined();
        });
    });
    describe("ea:quality:consumer-missing-contract", () => {
        it("fires when consumer has empty consumesContracts", () => {
            const artifacts = [
                makeEntity({
                    ref: "component:orphan",
                    kind: "Component",
                    type: "service",
                    consumesContracts: [],
                    consumerType: "internal"
                } as any),
            ];
            const result = validateEntities(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:quality:consumer-missing-contract");
            expect(warn).toBeDefined();
        });
        it("does not fire when consumesContracts has entries", () => {
            const artifacts = [
                makeEntity({
                    ref: "component:linked",
                    kind: "Component",
                    type: "service",
                    consumesContracts: ["api:orders-v2"],
                    consumerType: "external"
                } as any),
            ];
            const result = validateEntities(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:quality:consumer-missing-contract");
            expect(warn).toBeUndefined();
        });
    });
    describe("ea:quality:cloud-resource-missing-provider", () => {
        it("fires when cloud-resource has no provider", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:no-provider",
                    kind: "Resource",
                    type: "cloud-resource",
                    resourceType: "rds"
                } as any),
            ];
            const result = validateEntities(artifacts);
            const err = result.errors.find((e) => e.rule === "ea:quality:cloud-resource-missing-provider");
            expect(err).toBeDefined();
        });
        it("does not fire when provider is present", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:with-provider",
                    kind: "Resource",
                    type: "cloud-resource",
                    provider: "aws",
                    resourceType: "rds"
                } as any),
            ];
            const result = validateEntities(artifacts);
            const err = result.errors.find((e) => e.rule === "ea:quality:cloud-resource-missing-provider");
            expect(err).toBeUndefined();
        });
    });
    describe("ea:quality:environment-production-not-restricted", () => {
        it("fires when production environment has non-restricted access", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:prod",
                    kind: "Resource",
                    type: "environment",
                    tier: "production",
                    isProduction: true,
                    accessLevel: "team"
                } as any),
            ];
            const result = validateEntities(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:quality:environment-production-not-restricted");
            expect(warn).toBeDefined();
        });
        it("does not fire when production has restricted access", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:prod-restricted",
                    kind: "Resource",
                    type: "environment",
                    tier: "production",
                    isProduction: true,
                    accessLevel: "restricted"
                } as any),
            ];
            const result = validateEntities(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:quality:environment-production-not-restricted");
            expect(warn).toBeUndefined();
        });
        it("does not fire when accessLevel is not specified", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:prod-default",
                    kind: "Resource",
                    type: "environment",
                    tier: "production",
                    isProduction: true
                } as any),
            ];
            const result = validateEntities(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:quality:environment-production-not-restricted");
            expect(warn).toBeUndefined();
        });
    });
    describe("ea:quality:technology-standard-expired-review", () => {
        it("fires when active standard has passed review date", () => {
            const artifacts = [
                makeEntity({
                    ref: "technology:old-standard",
                    kind: "Technology",
                    status: "active",
                    category: "framework",
                    technology: "Express",
                    reviewBy: "2020-01-01"
                } as any),
            ];
            const result = validateEntities(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:quality:technology-standard-expired-review");
            expect(warn).toBeDefined();
        });
        it("does not fire for future review date", () => {
            const artifacts = [
                makeEntity({
                    ref: "technology:current",
                    kind: "Technology",
                    status: "active",
                    category: "framework",
                    technology: "Fastify",
                    reviewBy: "2099-01-01"
                } as any),
            ];
            const result = validateEntities(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:quality:technology-standard-expired-review");
            expect(warn).toBeUndefined();
        });
        it("does not fire for draft/retired standards", () => {
            const artifacts = [
                makeEntity({
                    ref: "technology:retired",
                    kind: "Technology",
                    status: "retired",
                    category: "database",
                    technology: "MySQL",
                    reviewBy: "2020-01-01"
                } as any),
            ];
            const result = validateEntities(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:quality:technology-standard-expired-review");
            expect(warn).toBeUndefined();
        });
    });
});
// ─── Drift Rules ────────────────────────────────────────────────────────────────
describe("Phase 2A: Drift Rules", () => {
    describe("ea:systems/consumer-contract-version-mismatch", () => {
        it("fires when consumer contractVersion differs from contract schemaVersion", () => {
            const artifacts = [
                makeEntity({
                    ref: "component:portal",
                    kind: "Component",
                    type: "service",
                    consumesContracts: ["api:orders-v2"],
                    consumerType: "external",
                    contractVersion: "1.0.0"
                } as any),
                makeEntity({
                    ref: "api:orders-v2",
                    kind: "API",
                    type: "openapi",
                    schemaVersion: "2.0.0"
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:systems/consumer-contract-version-mismatch");
            expect(warn).toBeDefined();
            expect(warn!.message).toContain("1.0.0");
            expect(warn!.message).toContain("2.0.0");
        });
        it("does not fire when versions match", () => {
            const artifacts = [
                makeEntity({
                    ref: "component:portal",
                    kind: "Component",
                    type: "service",
                    consumesContracts: ["api:orders-v2"],
                    consumerType: "external",
                    contractVersion: "1.0.0"
                } as any),
                makeEntity({
                    ref: "api:orders-v2",
                    kind: "API",
                    type: "openapi",
                    schemaVersion: "1.0.0"
                }),
            ];
            const result = evaluateEaDrift(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:systems/consumer-contract-version-mismatch");
            expect(warn).toBeUndefined();
        });
        it("does not fire when consumer has no contractVersion", () => {
            const artifacts = [
                makeEntity({
                    ref: "component:no-version",
                    kind: "Component",
                    type: "service",
                    consumesContracts: ["api:orders-v2"],
                    consumerType: "internal"
                } as any),
                makeEntity({
                    ref: "api:orders-v2",
                    kind: "API",
                    type: "openapi",
                    schemaVersion: "2.0.0"
                }),
            ];
            const result = evaluateEaDrift(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:systems/consumer-contract-version-mismatch");
            expect(warn).toBeUndefined();
        });
    });
    describe("ea:systems/technology-standard-violation", () => {
        it("fires when cloud resource uses unapproved technology", () => {
            const artifacts = [
                makeEntity({
                    ref: "technology:postgres",
                    kind: "Technology",
                    status: "active",
                    category: "database",
                    technology: "PostgreSQL"
                } as any),
                makeEntity({
                    ref: "resource:mysql-db",
                    kind: "Resource",
                    type: "cloud-resource",
                    provider: "aws",
                    resourceType: "rds",
                    technology: { engine: "MySQL", version: "8.0" }
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            const err = result.errors.find((e) => e.rule === "ea:systems/technology-standard-violation");
            expect(err).toBeDefined();
            expect(err!.message).toContain("MySQL");
        });
        it("does not fire when cloud resource matches standard", () => {
            const artifacts = [
                makeEntity({
                    ref: "technology:postgres",
                    kind: "Technology",
                    status: "active",
                    category: "database",
                    technology: "PostgreSQL"
                } as any),
                makeEntity({
                    ref: "resource:pg-db",
                    kind: "Resource",
                    type: "cloud-resource",
                    provider: "aws",
                    resourceType: "rds",
                    technology: { engine: "postgresql", version: "15" }
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            const err = result.errors.find((e) => e.rule === "ea:systems/technology-standard-violation");
            expect(err).toBeUndefined();
        });
        it("does not fire when no standards are active", () => {
            const artifacts = [
                makeEntity({
                    ref: "technology:retired-pg",
                    kind: "Technology",
                    status: "retired",
                    category: "database",
                    technology: "PostgreSQL"
                } as any),
                makeEntity({
                    ref: "resource:mysql-db",
                    kind: "Resource",
                    type: "cloud-resource",
                    provider: "aws",
                    resourceType: "rds",
                    technology: { engine: "MySQL", version: "8.0" }
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            const err = result.errors.find((e) => e.rule === "ea:systems/technology-standard-violation");
            expect(err).toBeUndefined();
        });
    });
    describe("ea:systems/deprecated-version-in-use", () => {
        it("fires when cloud resource uses deprecated version", () => {
            const artifacts = [
                makeEntity({
                    ref: "technology:postgres",
                    kind: "Technology",
                    status: "active",
                    category: "database",
                    technology: "PostgreSQL",
                    deprecatedVersions: ["11", "12"],
                    approvedVersions: ["15", "16"]
                } as any),
                makeEntity({
                    ref: "resource:old-pg",
                    kind: "Resource",
                    type: "cloud-resource",
                    provider: "aws",
                    resourceType: "rds",
                    technology: { engine: "PostgreSQL", version: "12" }
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:systems/deprecated-version-in-use");
            expect(warn).toBeDefined();
            expect(warn!.message).toContain("12");
        });
        it("does not fire for approved version", () => {
            const artifacts = [
                makeEntity({
                    ref: "technology:postgres",
                    kind: "Technology",
                    status: "active",
                    category: "database",
                    technology: "PostgreSQL",
                    deprecatedVersions: ["11", "12"],
                    approvedVersions: ["15", "16"]
                } as any),
                makeEntity({
                    ref: "resource:new-pg",
                    kind: "Resource",
                    type: "cloud-resource",
                    provider: "aws",
                    resourceType: "rds",
                    technology: { engine: "PostgreSQL", version: "16" }
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:systems/deprecated-version-in-use");
            expect(warn).toBeUndefined();
        });
    });
    describe("ea:systems/environment-promotion-gap", () => {
        it("fires when promotesFrom references non-existent environment", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:staging",
                    kind: "Resource",
                    type: "environment",
                    tier: "staging",
                    isProduction: false,
                    promotesFrom: "resource:dev"
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:systems/environment-promotion-gap");
            expect(warn).toBeDefined();
            expect(warn!.message).toContain("resource:default/dev");
        });
        it("fires when promotesTo references non-existent environment", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:staging",
                    kind: "Resource",
                    type: "environment",
                    tier: "staging",
                    isProduction: false,
                    promotesTo: "resource:production"
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:systems/environment-promotion-gap");
            expect(warn).toBeDefined();
            expect(warn!.message).toContain("resource:default/production");
        });
        it("does not fire when promotion chain is complete", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:dev",
                    kind: "Resource",
                    type: "environment",
                    tier: "development",
                    isProduction: false,
                    promotesTo: "resource:staging"
                } as any),
                makeEntity({
                    ref: "resource:staging",
                    kind: "Resource",
                    type: "environment",
                    tier: "staging",
                    isProduction: false,
                    promotesFrom: "resource:dev",
                    promotesTo: "resource:prod"
                } as any),
                makeEntity({
                    ref: "resource:prod",
                    kind: "Resource",
                    type: "environment",
                    tier: "production",
                    isProduction: true,
                    promotesFrom: "resource:staging"
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            const warn = result.warnings.find((e) => e.rule === "ea:systems/environment-promotion-gap");
            expect(warn).toBeUndefined();
        });
    });
    describe("evaluateEaDrift options", () => {
        it("skips resolver-dependent rules by default", () => {
            const result = evaluateEaDrift([]);
            expect(result.rulesSkipped).toBe(5); // 5 resolver stubs
            expect(result.rulesEvaluated).toBe(39); // 39 static rules
        });
        it("includes resolver rules when requested", () => {
            const result = evaluateEaDrift([], { includeResolverRules: true });
            expect(result.rulesSkipped).toBe(0);
            expect(result.rulesEvaluated).toBe(44);
        });
    });
});
