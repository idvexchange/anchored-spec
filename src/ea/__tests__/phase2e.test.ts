/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for Phase 2E: Transition Layer Schemas, Types, Quality Rules
 *
 * Covers:
 *  - 5 transition-layer kinds in EA_KIND_REGISTRY
 *  - Schema validation for all 5 kinds
 *  - 5 quality rules for transition-layer entities
 */
import { describe, it, expect } from "vitest";
import { createDefaultRegistry, validateEntities, validateEaRelations, validateEaSchema, getEaSchemaNames, evaluateEaDrift, buildGapAnalysis, renderGapAnalysisMarkdown, } from "../index.js";
import { ENTITY_DESCRIPTOR_REGISTRY, getSchemaDescriptor } from "../backstage/kind-mapping.js";
import { makeEntity } from "./helpers/make-entity.js";
// ─── Kind Registry ──────────────────────────────────────────────────────────────
describe("Phase 2E: Transition Layer Kinds", () => {
    const TRANSITION_KINDS = ["baseline", "target", "transition-plan", "migration-wave", "exception"];
    it("has 48 total kinds after Phase 2E", () => {
        expect(ENTITY_DESCRIPTOR_REGISTRY).toHaveLength(48);
    });
    it("has 7 kinds in transitions domain", () => {
        const kinds = ENTITY_DESCRIPTOR_REGISTRY.filter((entry) => entry.domain === "transitions");
        expect(kinds).toHaveLength(7);
        const kindNames = kinds.map((k) => k.schema);
        for (const k of TRANSITION_KINDS) {
            expect(kindNames).toContain(k);
        }
    });
    it.each([
        "baseline",
        "target",
        "transition-plan",
        "migration-wave",
        "exception",
    ])("registers %s in the transitions domain", (kind) => {
        const entry = getSchemaDescriptor(kind);
        expect(entry).toBeDefined();
        expect(entry!.domain).toBe("transitions");
    });
});
// ─── Schema Validation ──────────────────────────────────────────────────────────
describe("Phase 2E: Transition Schema Validation", () => {
    it("validates a valid baseline", () => {
        const data = {
            apiVersion: "anchored-spec/ea/v1",
            ref: "transitionplan:current",
            kind: "TransitionPlan",
            type: "baseline",
            title: "Current State Baseline",
            summary: "Q1 2026 baseline",
            owners: ["team-arch"],
            confidence: "observed",
            status: "active",
            schemaVersion: "1.0.0",
            scope: { description: "All systems domain entities", domains: ["systems"] },
            capturedAt: "2026-01-15",
            entityRefs: ["component:orders", "component:payments"]
        };
        const result = validateEaSchema(data, "baseline");
        expect(result.valid).toBe(true);
    });
    it("rejects baseline without required fields", () => {
        const data = {
            apiVersion: "anchored-spec/ea/v1",
            ref: "transitionplan:bad",
            kind: "TransitionPlan",
            type: "baseline",
            title: "Bad Baseline",
            summary: "Missing fields",
            owners: ["team-test"],
            confidence: "declared",
            status: "draft",
            schemaVersion: "1.0.0"
        };
        const result = validateEaSchema(data, "baseline");
        expect(result.valid).toBe(false);
    });
    it("validates a valid target", () => {
        const data = {
            apiVersion: "anchored-spec/ea/v1",
            ref: "transitionplan:cloud-native",
            kind: "TransitionPlan",
            type: "target",
            title: "Cloud-Native Architecture",
            summary: "Move to K8s",
            owners: ["team-arch"],
            confidence: "declared",
            status: "active",
            schemaVersion: "1.0.0",
            scope: { description: "Migrate all services to Kubernetes" },
            effectiveBy: "2026-12-31",
            entityRefs: ["component:orders-v2"],
            successMetrics: [{ ref: "m1", metric: "Service count on K8s", target: "100%" }]
        };
        const result = validateEaSchema(data, "target");
        expect(result.valid).toBe(true);
    });
    it("validates a valid transition-plan", () => {
        const data = {
            apiVersion: "anchored-spec/ea/v1",
            ref: "transitionplan:cloud-migration",
            kind: "TransitionPlan",
            title: "Cloud Migration Plan",
            summary: "Move from on-prem to cloud",
            owners: ["team-arch"],
            confidence: "declared",
            status: "active",
            schemaVersion: "1.0.0",
            baseline: "transitionplan:current",
            target: "transitionplan:cloud-native",
            milestones: [
                { ref: "m1", title: "Containerize services", deliverables: ["component:orders-v2"], status: "pending" },
                { ref: "m2", title: "Deploy to K8s", deliverables: ["resource:k8s-orders"], status: "pending" }
            ],
            riskRegister: [
                { ref: "r1", description: "Data loss during migration", likelihood: "low", impact: "critical", mitigation: "Full backup before each wave" }
            ]
        };
        const result = validateEaSchema(data, "transition-plan");
        expect(result.valid).toBe(true);
    });
    it("validates a valid migration-wave", () => {
        const data = {
            apiVersion: "anchored-spec/ea/v1",
            ref: "transitionplan:phase1",
            kind: "TransitionPlan",
            type: "migration-wave",
            title: "Phase 1 Wave",
            summary: "First batch of migrations",
            owners: ["team-ops"],
            confidence: "declared",
            status: "active",
            schemaVersion: "1.0.0",
            transitionPlan: "transitionplan:cloud-migration",
            milestones: ["m1"],
            sequenceOrder: 1,
            scope: { create: ["component:orders-v2"], modify: [], retire: ["component:orders-sunset"] },
            preconditions: ["component:orders"],
            rollbackStrategy: "Blue-green deployment with instant rollback"
        };
        const result = validateEaSchema(data, "migration-wave");
        expect(result.valid).toBe(true);
    });
    it("validates a valid exception", () => {
        const data = {
            apiVersion: "anchored-spec/ea/v1",
            ref: "exception:sunset-api",
            kind: "Exception",
            title: "Sunset API Exception",
            summary: "Allow non-standard API for sunset system",
            owners: ["team-arch"],
            confidence: "declared",
            status: "active",
            schemaVersion: "1.0.0",
            scope: { entityRefs: ["api:sunset-orders"], rules: ["ea:quality:api-missing-spec"] },
            approvedBy: "cto",
            approvedAt: "2026-01-15T00:00:00Z",
            expiresAt: "2026-06-15T00:00:00Z",
            reason: "Sunset system being retired in Q2",
            reviewSchedule: "monthly"
        };
        const result = validateEaSchema(data, "exception");
        expect(result.valid).toBe(true);
    });
    it("validates all schemas load correctly", () => {
        const names = getEaSchemaNames();
        expect(names).toHaveLength(55);
    });
});
// ─── Quality Rules ──────────────────────────────────────────────────────────────
describe("Phase 2E: Transition Quality Rules", () => {
    it("warns when baseline has no entity refs", () => {
        const entities = [
            makeEntity({
                ref: "transitionplan:empty",
                kind: "TransitionPlan",
                type: "baseline",
                scope: { description: "test" },
                capturedAt: "2026-01-15",
                entityRefs: []
            } as any),
        ];
        const result = validateEntities(entities);
        expect(result.warnings.find((w) => w.rule === "ea:quality:baseline-empty-refs")).toBeDefined();
    });
    it("does not warn when baseline has entity refs", () => {
        const entities = [
            makeEntity({
                ref: "transitionplan:good",
                kind: "TransitionPlan",
                type: "baseline",
                scope: { description: "test" },
                capturedAt: "2026-01-15",
                entityRefs: ["component:orders"]
            } as any),
        ];
        const result = validateEntities(entities);
        expect(result.warnings.find((w) => w.rule === "ea:quality:baseline-empty-refs")).toBeUndefined();
    });
    it("warns when target has no success metrics", () => {
        const entities = [
            makeEntity({
                ref: "transitionplan:no-metrics",
                kind: "TransitionPlan",
                type: "target",
                scope: { description: "test" },
                effectiveBy: "2026-12-31",
                entityRefs: ["component:orders"]
            } as any),
        ];
        const result = validateEntities(entities);
        expect(result.warnings.find((w) => w.rule === "ea:quality:target-missing-metrics")).toBeDefined();
    });
    it("warns when transition plan has no milestones", () => {
        const entities = [
            makeEntity({
                ref: "transitionplan:empty",
                kind: "TransitionPlan",
                baseline: "transitionplan:x",
                target: "transitionplan:x",
                milestones: []
            } as any),
        ];
        const result = validateEntities(entities);
        expect(result.warnings.find((w) => w.rule === "ea:quality:plan-empty-milestones")).toBeDefined();
    });
    it("errors when exception has empty scope", () => {
        const entities = [
            makeEntity({
                ref: "exception:wild",
                kind: "Exception",
                scope: {},
                approvedBy: "cto",
                approvedAt: "2026-01-15",
                expiresAt: "2026-06-15",
                reason: "Just because"
            } as any),
        ];
        const result = validateEntities(entities);
        expect(result.errors.find((e) => e.rule === "ea:quality:exception-empty-scope")).toBeDefined();
    });
    it("does not error when exception has scoped rules", () => {
        const entities = [
            makeEntity({
                ref: "exception:scoped",
                kind: "Exception",
                scope: { rules: ["ea:quality:some-rule"] },
                approvedBy: "cto",
                approvedAt: "2026-01-15",
                expiresAt: "2026-06-15",
                reason: "Valid exception"
            } as any),
        ];
        const result = validateEntities(entities);
        expect(result.errors.find((e) => e.rule === "ea:quality:exception-empty-scope")).toBeUndefined();
    });
    it("warns when migration wave has empty scope", () => {
        const entities = [
            makeEntity({
                ref: "transitionplan:empty",
                kind: "TransitionPlan",
                type: "migration-wave",
                transitionPlan: "transitionplan:x",
                milestones: ["m1"],
                sequenceOrder: 1,
                scope: {}
            } as any),
        ];
        const result = validateEntities(entities);
        expect(result.warnings.find((w) => w.rule === "ea:quality:wave-empty-scope")).toBeDefined();
    });
});
// ─── Phase 2E: New Relations ────────────────────────────────────────────────────
describe("Phase 2E: Transition Relations", () => {
    const registry = createDefaultRegistry();
    it("has 28 total relation types after Phase 2E", () => {
        expect(registry.allTypes()).toHaveLength(28);
    });
    describe("supersedes", () => {
        it("is registered with wildcard source and target", () => {
            const entry = registry.get("supersedes");
            expect(entry).toBeDefined();
            expect(entry!.inverse).toBe("supersededBy");
            expect(entry!.validSourceSchemas).toBe("*");
            expect(entry!.validTargetSchemas).toBe("*");
        });
        it("validates app → app via supersedes", () => {
            const entities = [
                makeEntity({
                    ref: "component:orders-v2",
                    kind: "Component",
                    type: "website",
                    supersedes: ["component:orders-v1"]
                }),
                makeEntity({ ref: "component:orders-v1", kind: "Component", type: "website", status: "retired" }),
            ];
            const result = validateEaRelations(entities, registry);
            const relErrors = result.errors.filter((e) => e.rule !== "ea:relation:target-missing");
            expect(relErrors).toHaveLength(0);
        });
    });
    describe("generates", () => {
        it("is registered with transition-plan/migration-wave source", () => {
            const entry = registry.get("generates");
            expect(entry).toBeDefined();
            expect(entry!.inverse).toBe("generatedBy");
            expect(entry!.validSourceSchemas).toContain("transition-plan");
            expect(entry!.validSourceSchemas).toContain("migration-wave");
        });
        it("validates plan → any via generates", () => {
            const entities = [
                makeEntity({
                    ref: "transitionplan:migration",
                    kind: "TransitionPlan",
                    baseline: "transitionplan:x",
                    target: "transitionplan:x",
                    milestones: [],
                    generates: ["component:orders-v2"]
                } as any),
                makeEntity({ ref: "component:orders-v2", kind: "Component", type: "website" }),
            ];
            const result = validateEaRelations(entities, registry);
            const relErrors = result.errors.filter((e) => e.rule !== "ea:relation:target-missing");
            expect(relErrors).toHaveLength(0);
        });
    });
    describe("mitigates", () => {
        it("is registered with exception source", () => {
            const entry = registry.get("mitigates");
            expect(entry).toBeDefined();
            expect(entry!.inverse).toBe("mitigatedBy");
            expect(entry!.validSourceSchemas).toEqual(["exception"]);
            expect(entry!.validTargetSchemas).toBe("*");
        });
        it("validates exception → any via mitigates", () => {
            const entities = [
                makeEntity({
                    ref: "exception:sunset",
                    kind: "Exception",
                    scope: { entityRefs: ["component:sunset"] },
                    approvedBy: "cto",
                    approvedAt: "2026-01-15",
                    expiresAt: "2027-01-15",
                    reason: "Sunset system",
                    mitigates: ["component:sunset"]
                } as any),
                makeEntity({ ref: "component:sunset", kind: "Component", type: "website" }),
            ];
            const result = validateEaRelations(entities, registry);
            const relErrors = result.errors.filter((e) => e.rule !== "ea:relation:target-missing");
            expect(relErrors).toHaveLength(0);
        });
        it("rejects non-exception as source for mitigates", () => {
            const entities = [
                makeEntity({
                    ref: "component:orders",
                    kind: "Component",
                    type: "website",
                    mitigates: ["component:sunset"]
                }),
                makeEntity({ ref: "component:sunset", kind: "Component", type: "website" }),
            ];
            const result = validateEaRelations(entities, registry);
            expect(result.errors.find((e) => e.rule === "ea:relation:invalid-source")).toBeDefined();
        });
    });
});
// ─── Phase 2E: Transition Drift Rules ───────────────────────────────────────────
describe("Phase 2E: Transition Drift Rules", () => {
    describe("ea:transition/baseline-missing-entities", () => {
        it("fires when baseline references non-existent entity", () => {
            const entities = [
                makeEntity({
                    ref: "transitionplan:q1",
                    kind: "TransitionPlan",
                    type: "baseline",
                    scope: { description: "test" },
                    capturedAt: new Date().toISOString(),
                    entityRefs: ["component:nonexistent"]
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:transition/baseline-missing-entities")).toBeDefined();
        });
        it("does not fire when all refs exist", () => {
            const entities = [
                makeEntity({
                    ref: "transitionplan:q1",
                    kind: "TransitionPlan",
                    type: "baseline",
                    scope: { description: "test" },
                    capturedAt: new Date().toISOString(),
                    entityRefs: ["component:orders"]
                } as any),
                makeEntity({ ref: "component:orders", kind: "Component", type: "website" }),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:transition/baseline-missing-entities")).toBeUndefined();
        });
    });
    describe("ea:transition/baseline-stale", () => {
        it("fires when baseline is older than 90 days", () => {
            const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
            const entities = [
                makeEntity({
                    ref: "transitionplan:old",
                    kind: "TransitionPlan",
                    type: "baseline",
                    scope: { description: "test" },
                    capturedAt: oldDate,
                    entityRefs: []
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:transition/baseline-stale")).toBeDefined();
        });
    });
    describe("ea:transition/invalid-target-reference", () => {
        it("fires when target references non-existent entity", () => {
            const entities = [
                makeEntity({
                    ref: "transitionplan:cloud",
                    kind: "TransitionPlan",
                    type: "target",
                    scope: { description: "test" },
                    effectiveBy: "2027-12-31",
                    entityRefs: ["component:nonexistent"]
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.errors.find((e) => e.rule === "ea:transition/invalid-target-reference")).toBeDefined();
        });
    });
    describe("ea:transition/expired-target", () => {
        it("fires when target effectiveBy is in the past", () => {
            const entities = [
                makeEntity({
                    ref: "transitionplan:old",
                    kind: "TransitionPlan",
                    type: "target",
                    scope: { description: "test" },
                    effectiveBy: "2020-01-01",
                    entityRefs: []
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:transition/expired-target")).toBeDefined();
        });
    });
    describe("ea:transition/missing-baseline", () => {
        it("fires when plan references non-existent baseline", () => {
            const entities = [
                makeEntity({
                    ref: "transitionplan:migration",
                    kind: "TransitionPlan",
                    baseline: "transitionplan:nonexistent",
                    target: "transitionplan:x",
                    milestones: []
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.errors.find((e) => e.rule === "ea:transition/missing-baseline")).toBeDefined();
        });
        it("does not fire when baseline exists", () => {
            const entities = [
                makeEntity({
                    ref: "transitionplan:migration",
                    kind: "TransitionPlan",
                    type: "baseline",
                    baseline: "transitionplan:q1",
                    scope: { description: "test" },
                    capturedAt: new Date().toISOString(),
                    entityRefs: []
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.errors.find((e) => e.rule === "ea:transition/missing-baseline")).toBeUndefined();
        });
    });
    describe("ea:transition/missing-target", () => {
        it("fires when plan references non-existent target", () => {
            const entities = [
                makeEntity({
                    ref: "transitionplan:migration",
                    kind: "TransitionPlan",
                    baseline: "transitionplan:x",
                    target: "transitionplan:nonexistent",
                    milestones: []
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.errors.find((e) => e.rule === "ea:transition/missing-target")).toBeDefined();
        });
    });
    describe("ea:transition/milestone-on-retired-entity", () => {
        it("fires when milestone delivers retired entity", () => {
            const entities = [
                makeEntity({
                    ref: "transitionplan:migration",
                    kind: "TransitionPlan",
                    baseline: "transitionplan:x",
                    target: "transitionplan:x",
                    milestones: [{ ref: "m1", title: "Test", deliverables: ["component:retired"] }]
                } as any),
                makeEntity({ ref: "component:retired", kind: "Component", type: "website", status: "retired" }),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.errors.find((e) => e.rule === "ea:transition/milestone-on-retired-entity")).toBeDefined();
        });
    });
    describe("ea:transition/orphan-wave", () => {
        it("fires when wave has no plan reference", () => {
            const entities = [
                makeEntity({
                    ref: "transitionplan:orphan",
                    kind: "TransitionPlan",
                    type: "migration-wave",
                    transitionPlan: "transitionplan:nonexistent",
                    milestones: [],
                    sequenceOrder: 1,
                    scope: {}
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:transition/orphan-wave")).toBeDefined();
        });
        it("does not fire when wave references existing plan", () => {
            const entities = [
                makeEntity({
                    ref: "transitionplan:good",
                    kind: "TransitionPlan",
                    type: "migration-wave",
                    transitionPlan: "transitionplan:migration",
                    milestones: []
                } as any),
                makeEntity({
                    ref: "transitionplan:migration",
                    kind: "TransitionPlan",
                    baseline: "transitionplan:q1",
                    target: "transitionplan:q4",
                    milestones: []
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:transition/orphan-wave")).toBeUndefined();
        });
    });
    describe("ea:exception/expired", () => {
        it("fires when exception is past expiry", () => {
            const entities = [
                makeEntity({
                    ref: "exception:old",
                    kind: "Exception",
                    scope: { rules: ["some-rule"] },
                    approvedBy: "cto",
                    approvedAt: "2020-01-01",
                    expiresAt: "2020-06-01",
                    reason: "test"
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:exception/expired")).toBeDefined();
        });
        it("does not fire when exception is still valid", () => {
            const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
            const entities = [
                makeEntity({
                    ref: "exception:valid",
                    kind: "Exception",
                    scope: { rules: ["some-rule"] },
                    approvedBy: "cto",
                    approvedAt: "2026-01-01",
                    expiresAt: future,
                    reason: "test"
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:exception/expired")).toBeUndefined();
        });
    });
    describe("ea:exception/missing-scope", () => {
        it("fires when exception has empty scope", () => {
            const entities = [
                makeEntity({
                    ref: "exception:wild",
                    kind: "Exception",
                    scope: {},
                    approvedBy: "cto",
                    approvedAt: "2026-01-01",
                    expiresAt: "2027-01-01",
                    reason: "test"
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.errors.find((e) => e.rule === "ea:exception/missing-scope")).toBeDefined();
        });
    });
    it("evaluates all 39 static drift rules", () => {
        const result = evaluateEaDrift([]);
        expect(result.rulesEvaluated).toBe(39);
        expect(result.rulesSkipped).toBe(5);
    });
});
// ─── Phase 2E: Gap Analysis Report ──────────────────────────────────────────────
describe("Phase 2E: Gap Analysis Report", () => {
    it("returns empty report when baseline not found", () => {
        const report = buildGapAnalysis([], { baselineId: "transitionplan:x", targetId: "transitionplan:y" });
        expect(report.summary.newWork).toBe(0);
        expect(report.summary.retirements).toBe(0);
    });
    it("classifies new work (in target but not baseline)", () => {
        const entities = [
            makeEntity({
                ref: "transitionplan:q1",
                kind: "TransitionPlan",
                type: "baseline",
                scope: { description: "test" },
                capturedAt: "2026-01-15",
                entityRefs: ["component:orders"]
            } as any),
            makeEntity({
                ref: "transitionplan:q4",
                kind: "TransitionPlan",
                type: "target",
                scope: { description: "test" },
                effectiveBy: "2026-12-31",
                entityRefs: ["component:orders", "component:payments"]
            } as any),
            makeEntity({ ref: "component:orders", kind: "Component", type: "website" }),
            makeEntity({ ref: "component:payments", kind: "Component", type: "website", status: "draft" }),
        ];
        const report = buildGapAnalysis(entities, { baselineId: "transitionplan:q1", targetId: "transitionplan:q4" });
        expect(report.summary.newWork).toBe(1);
        expect(report.summary.continuing).toBe(1);
        expect(report.summary.retirements).toBe(0);
        expect(report.newWork[0].entityRef).toBe("component:default/payments");
        expect(report.newWork[0].status).toBe("draft");
    });
    it("classifies retirements (in baseline but not target)", () => {
        const entities = [
            makeEntity({
                ref: "transitionplan:q1",
                kind: "TransitionPlan",
                type: "baseline",
                scope: { description: "test" },
                capturedAt: "2026-01-15",
                entityRefs: ["component:orders", "component:sunset"]
            } as any),
            makeEntity({
                ref: "transitionplan:q4",
                kind: "TransitionPlan",
                type: "target",
                scope: { description: "test" },
                effectiveBy: "2026-12-31",
                entityRefs: ["component:orders"]
            } as any),
            makeEntity({ ref: "component:orders", kind: "Component", type: "website" }),
            makeEntity({ ref: "component:sunset", kind: "Component", type: "website" }),
        ];
        const report = buildGapAnalysis(entities, { baselineId: "transitionplan:q1", targetId: "transitionplan:q4" });
        expect(report.summary.retirements).toBe(1);
        expect(report.retirements[0].entityRef).toBe("component:default/sunset");
        expect(report.retirements[0].blocked).toBe(false);
    });
    it("detects blocked retirements", () => {
        const entities = [
            makeEntity({
                ref: "transitionplan:q1",
                kind: "TransitionPlan",
                type: "baseline",
                scope: { description: "test" },
                capturedAt: "2026-01-15",
                entityRefs: ["component:orders", "exchange:sunset-bridge"]
            } as any),
            makeEntity({
                ref: "transitionplan:q4",
                kind: "TransitionPlan",
                type: "target",
                scope: { description: "test" },
                effectiveBy: "2026-12-31",
                entityRefs: ["component:orders"]
            } as any),
            makeEntity({
                ref: "component:orders",
                kind: "Component",
                type: "website",
                dependsOn: ["exchange:sunset-bridge"]
            }),
            makeEntity({ ref: "exchange:sunset-bridge", kind: "Exchange", type: "integration" }),
        ];
        const report = buildGapAnalysis(entities, { baselineId: "transitionplan:q1", targetId: "transitionplan:q4" });
        expect(report.summary.blockedRetirements).toBe(1);
        expect(report.retirements[0].blocked).toBe(true);
        expect(report.retirements[0].dependedOnBy).toContain("component:default/orders");
    });
    it("flags unplanned gaps (new work with no milestone or wave)", () => {
        const entities = [
            makeEntity({
                ref: "transitionplan:q1",
                kind: "TransitionPlan",
                type: "baseline",
                scope: { description: "test" },
                capturedAt: "2026-01-15",
                entityRefs: []
            } as any),
            makeEntity({
                ref: "transitionplan:q4",
                kind: "TransitionPlan",
                type: "target",
                scope: { description: "test" },
                effectiveBy: "2026-12-31",
                entityRefs: ["component:new-service"]
            } as any),
            makeEntity({ ref: "component:new-service", kind: "Component", type: "website", status: "draft" }),
        ];
        const report = buildGapAnalysis(entities, { baselineId: "transitionplan:q1", targetId: "transitionplan:q4" });
        expect(report.summary.unplannedGaps).toBe(1);
    });
    it("includes milestone status from transition plan", () => {
        const entities = [
            makeEntity({
                ref: "transitionplan:q1",
                kind: "TransitionPlan",
                type: "baseline",
                scope: { description: "test" },
                capturedAt: "2026-01-15",
                entityRefs: ["component:orders"]
            } as any),
            makeEntity({
                ref: "transitionplan:q4",
                kind: "TransitionPlan",
                type: "target",
                scope: { description: "test" },
                effectiveBy: "2026-12-31",
                entityRefs: ["component:orders", "component:payments"],
                successMetrics: [{ id: "sm1", metric: "Services on K8s", target: "100%", currentValue: "50%" }]
            } as any),
            makeEntity({
                ref: "transitionplan:migration",
                kind: "TransitionPlan",
                baseline: "transitionplan:q1",
                target: "transitionplan:q4",
                milestones: [
                    { id: "m1", title: "Deploy payments", deliverables: ["component:payments"], status: "pending" }
                ]
            } as any),
            makeEntity({ ref: "component:orders", kind: "Component", type: "website" }),
            makeEntity({ ref: "component:payments", kind: "Component", type: "website", status: "draft" }),
        ];
        const report = buildGapAnalysis(entities, {
            baselineId: "transitionplan:q1",
            targetId: "transitionplan:q4",
            planId: "transitionplan:migration"
        });
        expect(report.milestones).toHaveLength(1);
        expect(report.milestones[0].id).toBe("m1");
        expect(report.milestones[0].status).toBe("pending");
        expect(report.newWork[0].milestone).toBe("m1");
        expect(report.successMetrics).toHaveLength(1);
        expect(report.successMetrics[0].metric).toBe("Services on K8s");
        expect(report.successMetrics[0].currentValue).toBe("50%");
    });
    it("tracks wave assignments for new work", () => {
        const entities = [
            makeEntity({
                ref: "transitionplan:q1",
                kind: "TransitionPlan",
                type: "baseline",
                scope: { description: "test" },
                capturedAt: "2026-01-15",
                entityRefs: []
            } as any),
            makeEntity({
                ref: "transitionplan:q4",
                kind: "TransitionPlan",
                type: "target",
                scope: { description: "test" },
                effectiveBy: "2026-12-31",
                entityRefs: ["component:payments"]
            } as any),
            makeEntity({
                ref: "transitionplan:migration",
                kind: "TransitionPlan",
                baseline: "transitionplan:q1",
                target: "transitionplan:q4",
                milestones: [{ id: "m1", title: "Wave 1", deliverables: ["component:payments"] }]
            } as any),
            makeEntity({
                ref: "transitionplan:1",
                kind: "TransitionPlan",
                type: "migration-wave",
                transitionPlan: "transitionplan:migration",
                milestones: ["m1"],
                sequenceOrder: 1,
                scope: { create: ["component:payments"], modify: [], retire: [] }
            } as any),
            makeEntity({ ref: "component:payments", kind: "Component", type: "website", status: "draft" }),
        ];
        const report = buildGapAnalysis(entities, {
            baselineId: "transitionplan:q1",
            targetId: "transitionplan:q4",
            planId: "transitionplan:migration"
        });
        expect(report.newWork[0].wave).toBe("transitionplan:default/1");
        expect(report.newWork[0].milestone).toBe("m1");
        expect(report.summary.unplannedGaps).toBe(0);
    });
    describe("renderGapAnalysisMarkdown", () => {
        it("renders empty report", () => {
            const report = buildGapAnalysis([], { baselineId: "transitionplan:x", targetId: "transitionplan:y" });
            const md = renderGapAnalysisMarkdown(report);
            expect(md).toContain("# Target Gap Analysis");
            expect(md).toContain("transitionplan:x");
            expect(md).toContain("transitionplan:y");
        });
        it("renders full report with all sections", () => {
            const entities = [
                makeEntity({
                    ref: "transitionplan:q1",
                    kind: "TransitionPlan",
                    type: "baseline",
                    scope: { description: "test" },
                    capturedAt: "2026-01-15",
                    entityRefs: ["component:orders", "component:sunset"]
                } as any),
                makeEntity({
                    ref: "transitionplan:q4",
                    kind: "TransitionPlan",
                    type: "target",
                    scope: { description: "test" },
                    effectiveBy: "2026-12-31",
                    entityRefs: ["component:orders", "component:payments"],
                    successMetrics: [{ ref: "sm1", metric: "Uptime", target: "99.9%", currentValue: "99.5%" }]
                } as any),
                makeEntity({ ref: "component:orders", kind: "Component", type: "website" }),
                makeEntity({ ref: "component:sunset", kind: "Component", type: "website" }),
                makeEntity({ ref: "component:payments", kind: "Component", type: "website", status: "draft" }),
            ];
            const report = buildGapAnalysis(entities, { baselineId: "transitionplan:q1", targetId: "transitionplan:q4" });
            const md = renderGapAnalysisMarkdown(report);
            expect(md).toContain("## New Work");
            expect(md).toContain("component:default/payments");
            expect(md).toContain("## Retirements");
            expect(md).toContain("component:default/sunset");
            expect(md).toContain("## Success Metrics");
            expect(md).toContain("Uptime");
        });
    });
});
