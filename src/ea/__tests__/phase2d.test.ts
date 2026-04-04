/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for Phase 2D: Business Layer Schemas, Types, Quality Rules,
 * Relations, and Drift Rules
 *
 * Covers:
 *  - 10 business-layer kinds in the descriptor registry
 *  - Schema validation for all business-layer kinds covered in this phase
 *  - 7 quality rules for business-layer entities
 *  - realizes relation extension (business-service → capability/mission)
 *  - 4 new relations (supports, performedBy, governedBy, ownedBy)
 *  - 10 business drift rules including retired-system-dependency
 */
import { describe, it, expect } from "vitest";
import { createDefaultRegistry, validateEntities, validateEaRelations, validateEaSchema, evaluateEaDrift, } from "../index.js";
import { ENTITY_DESCRIPTOR_REGISTRY, getSchemaDescriptor } from "../backstage/kind-mapping.js";
import { makeEntity } from "./helpers/make-entity.js";
// ─── Kind Registry ──────────────────────────────────────────────────────────────
describe("Phase 2D: Business Layer Kinds", () => {
    const bizKinds = ENTITY_DESCRIPTOR_REGISTRY.filter((entry) => entry.domain === "business");
    it("registers 10 business-layer kinds", () => {
        expect(bizKinds).toHaveLength(10);
    });
    it.each([
        "mission",
        "capability",
        "value-stream",
        "process",
        "org-unit",
        "policy-objective",
        "business-service",
        "control",
    ])("registers %s in the business domain", (kind) => {
        const entry = getSchemaDescriptor(kind);
        expect(entry).toBeDefined();
        expect(entry!.domain).toBe("business");
    });
});
// ─── Schema Validation ──────────────────────────────────────────────────────────
describe("Phase 2D: Schema Validation", () => {
    describe("mission", () => {
        it("validates a valid mission", () => {
            const result = validateEaSchema({
                ref: "mission:digital-commerce",
                schemaVersion: "1.0.0",
                kind: "Mission",
                title: "Digital Commerce Excellence",
                status: "active",
                summary: "Drive digital commerce growth",
                owners: ["cto"],
                confidence: "declared",
                timeHorizon: "long-term",
                keyResults: [{ ref: "kr-1", description: "Increase online revenue by 50%", metric: "revenue", target: "150M" }],
                strategicThemes: ["digital-first", "customer-experience"],
                sponsor: "CEO"
            }, "mission");
            expect(result.valid).toBe(true);
        });
        it("validates minimal mission (no required schema-specific fields)", () => {
            const result = validateEaSchema({
                ref: "mission:basic",
                schemaVersion: "1.0.0",
                kind: "Mission",
                title: "Basic Mission",
                status: "draft",
                summary: "A basic mission",
                owners: ["team"],
                confidence: "declared"
            }, "mission");
            expect(result.valid).toBe(true);
        });
    });
    describe("capability", () => {
        it("validates a valid capability", () => {
            const result = validateEaSchema({
                ref: "capability:order-fulfillment",
                schemaVersion: "1.0.0",
                kind: "Capability",
                title: "Order Fulfillment",
                status: "active",
                summary: "Capability to fulfill customer orders",
                owners: ["team-ops"],
                confidence: "declared",
                level: 2,
                parentCapability: "capability:commerce",
                maturity: "managed",
                strategicImportance: "core",
                investmentProfile: "invest",
                heatMap: { businessValue: "high", technicalHealth: "fair", risk: "medium" }
            }, "capability");
            expect(result.valid).toBe(true);
        });
        it("rejects missing level", () => {
            const result = validateEaSchema({
                ref: "capability:bad",
                schemaVersion: "1.0.0",
                kind: "Capability",
                title: "Bad Cap",
                status: "active",
                summary: "Missing level",
                owners: ["team"],
                confidence: "declared"
            }, "capability");
            expect(result.valid).toBe(false);
        });
        it("rejects invalid maturity enum", () => {
            const result = validateEaSchema({
                ref: "capability:bad",
                schemaVersion: "1.0.0",
                kind: "Capability",
                title: "Bad",
                status: "active",
                summary: "Invalid maturity",
                owners: ["team"],
                confidence: "declared",
                level: 1,
                maturity: "invalid"
            }, "capability");
            expect(result.valid).toBe(false);
        });
    });
    describe("value-stream", () => {
        it("validates a valid value-stream", () => {
            const result = validateEaSchema({
                ref: "valuestream:customer-onboarding",
                schemaVersion: "1.0.0",
                kind: "ValueStream",
                title: "Customer Onboarding",
                status: "active",
                summary: "End-to-end customer onboarding",
                owners: ["team-growth"],
                confidence: "declared",
                stages: [
                    { ref: "s1", name: "Registration", supportingCapabilities: ["capability:identity"], duration: "5min" },
                    { ref: "s2", name: "Verification", supportingCapabilities: ["capability:kyc"], bottleneck: true }
                ],
                customer: "New customers",
                valueProposition: "Seamless onboarding experience",
                trigger: "Customer signup",
                outcome: "Active account"
            }, "value-stream");
            expect(result.valid).toBe(true);
        });
        it("rejects missing stages", () => {
            const result = validateEaSchema({
                ref: "valuestream:bad",
                schemaVersion: "1.0.0",
                kind: "ValueStream",
                title: "Bad VS",
                status: "active",
                summary: "Missing stages",
                owners: ["team"],
                confidence: "declared",
                customer: "test",
                valueProposition: "test"
            }, "value-stream");
            expect(result.valid).toBe(false);
        });
    });
    describe("process", () => {
        it("validates a valid process", () => {
            const result = validateEaSchema({
                ref: "valuestream:order-processing",
                schemaVersion: "1.0.0",
                kind: "ValueStream",
                type: "process",
                title: "Order Processing",
                status: "active",
                summary: "Process customer orders",
                owners: ["team-ops"],
                confidence: "declared",
                steps: [
                    { ref: "s1", name: "Receive Order", actor: "system", systemRef: "component:orders", automated: true },
                    { ref: "s2", name: "Validate Payment", actor: "payment-gateway" }
                ],
                processOwner: "operations-lead",
                regulated: false
            }, "process");
            expect(result.valid).toBe(true);
        });
    });
    describe("org-unit", () => {
        it("validates a valid org-unit", () => {
            const result = validateEaSchema({
                ref: "group:engineering",
                schemaVersion: "1.0.0",
                kind: "Group",
                type: "team",
                title: "Engineering",
                status: "active",
                summary: "Engineering department",
                owners: ["vp-eng"],
                confidence: "declared",
                unitType: "department",
                lead: "VP Engineering",
                size: 50,
                locations: ["SF", "NYC"],
                costCenter: "CC-100"
            }, "org-unit");
            expect(result.valid).toBe(true);
        });
        it("rejects missing unitType", () => {
            const result = validateEaSchema({
                ref: "group:bad",
                schemaVersion: "1.0.0",
                kind: "Group",
                type: "team",
                title: "Bad Org",
                status: "active",
                summary: "Missing type",
                owners: ["team"],
                confidence: "declared"
            }, "org-unit");
            expect(result.valid).toBe(false);
        });
        it("rejects invalid unitType enum", () => {
            const result = validateEaSchema({
                ref: "group:bad",
                schemaVersion: "1.0.0",
                kind: "Group",
                type: "team",
                title: "Bad Org",
                status: "active",
                summary: "Invalid type",
                owners: ["team"],
                confidence: "declared",
                unitType: "invalid"
            }, "org-unit");
            expect(result.valid).toBe(false);
        });
    });
    describe("policy-objective", () => {
        it("validates a valid policy-objective", () => {
            const result = validateEaSchema({
                ref: "mission:order-sla",
                schemaVersion: "1.0.0",
                kind: "Mission",
                type: "policy-objective",
                title: "Order SLA",
                status: "active",
                summary: "Order processing SLA",
                owners: ["team-ops"],
                confidence: "declared",
                category: "sla",
                objective: "Orders must be processed within 2 hours",
                target: { metric: "processing_time_p99", threshold: "2h", currentValue: "1.5h" },
                enforcedBy: ["control:order-latency"]
            }, "policy-objective");
            expect(result.valid).toBe(true);
        });
        it("rejects missing objective", () => {
            const result = validateEaSchema({
                ref: "mission:bad",
                schemaVersion: "1.0.0",
                kind: "Mission",
                type: "policy-objective",
                title: "Bad Policy",
                status: "active",
                summary: "Missing objective",
                owners: ["team"],
                confidence: "declared",
                category: "sla"
            }, "policy-objective");
            expect(result.valid).toBe(false);
        });
    });
    describe("business-service", () => {
        it("validates a valid business-service", () => {
            const result = validateEaSchema({
                ref: "capability:online-store",
                schemaVersion: "1.0.0",
                kind: "Capability",
                type: "business-service",
                title: "Online Store",
                status: "active",
                summary: "Customer-facing online store",
                owners: ["team-commerce"],
                confidence: "declared",
                serviceType: "customer-facing",
                channels: ["web", "mobile"],
                revenueImpact: "direct",
                serviceLevel: "99.9% availability"
            }, "business-service");
            expect(result.valid).toBe(true);
        });
        it("rejects missing serviceType", () => {
            const result = validateEaSchema({
                ref: "capability:bad",
                schemaVersion: "1.0.0",
                kind: "Capability",
                type: "business-service",
                title: "Bad Service",
                status: "active",
                summary: "Missing type",
                owners: ["team"],
                confidence: "declared"
            }, "business-service");
            expect(result.valid).toBe(false);
        });
    });
    describe("control", () => {
        it("validates a valid control", () => {
            const result = validateEaSchema({
                ref: "control:order-latency",
                schemaVersion: "1.0.0",
                kind: "Control",
                title: "Order Latency Monitoring",
                status: "active",
                summary: "Monitors order processing latency",
                owners: ["team-sre"],
                confidence: "declared",
                controlType: "detective",
                implementation: "automated",
                assertion: "P99 order processing latency < 2 hours",
                mechanism: "Prometheus alert rule",
                frequency: "continuous",
                onViolation: { action: "alert", target: "ops-channel", description: "Alert on-call" },
                frameworks: ["SOC2"]
            }, "control");
            expect(result.valid).toBe(true);
        });
        it("rejects missing assertion", () => {
            const result = validateEaSchema({
                ref: "control:bad",
                schemaVersion: "1.0.0",
                kind: "Control",
                title: "Bad Control",
                status: "active",
                summary: "Missing assertion",
                owners: ["team"],
                confidence: "declared",
                controlType: "detective",
                implementation: "automated"
            }, "control");
            expect(result.valid).toBe(false);
        });
        it("rejects invalid controlType", () => {
            const result = validateEaSchema({
                ref: "control:bad",
                schemaVersion: "1.0.0",
                kind: "Control",
                title: "Bad",
                status: "active",
                summary: "Invalid type",
                owners: ["team"],
                confidence: "declared",
                controlType: "invalid",
                implementation: "automated",
                assertion: "test"
            }, "control");
            expect(result.valid).toBe(false);
        });
    });
});
// ─── Quality Rules ──────────────────────────────────────────────────────────────
describe("Phase 2D: Quality Rules", () => {
    it("ea:quality:capability-missing-level — fires on missing level", () => {
        const entities = [makeEntity({ ref: "capability:no-level", kind: "Capability" } as any)];
        const result = validateEntities(entities);
        expect(result.errors.find((e) => e.rule === "ea:quality:capability-missing-level")).toBeDefined();
    });
    it("ea:quality:process-missing-steps — fires on empty steps", () => {
        const entities = [makeEntity({ ref: "valuestream:no-steps", kind: "ValueStream", type: "process", steps: [] } as any)];
        const result = validateEntities(entities);
        expect(result.warnings.find((w) => w.rule === "ea:quality:process-missing-steps")).toBeDefined();
    });
    it("ea:quality:value-stream-missing-stages — fires on missing stages", () => {
        const entities = [makeEntity({ ref: "valuestream:no-stages", kind: "ValueStream", stages: [] } as any)];
        const result = validateEntities(entities);
        expect(result.errors.find((e) => e.rule === "ea:quality:value-stream-missing-stages")).toBeDefined();
    });
    it("ea:quality:control-missing-assertion — fires on empty assertion", () => {
        const entities = [makeEntity({
                ref: "control:no-assert",
                kind: "Control",
                controlType: "detective",
                implementation: "automated",
                assertion: ""
            } as any)];
        const result = validateEntities(entities);
        expect(result.errors.find((e) => e.rule === "ea:quality:control-missing-assertion")).toBeDefined();
    });
    it("ea:quality:org-unit-missing-type — fires on missing unitType", () => {
        const entities = [makeEntity({ ref: "group:no-type", kind: "Group", type: "team", unitType: "" } as any)];
        const result = validateEntities(entities);
        expect(result.errors.find((e) => e.rule === "ea:quality:org-unit-missing-type")).toBeDefined();
    });
    it("ea:quality:policy-missing-objective — fires on empty objective", () => {
        const entities = [makeEntity({
                ref: "mission:no-obj",
                kind: "Mission",
                type: "policy-objective",
                category: "sla",
                objective: ""
            } as any)];
        const result = validateEntities(entities);
        expect(result.errors.find((e) => e.rule === "ea:quality:policy-missing-objective")).toBeDefined();
    });
    it("ea:quality:mission-missing-key-results — fires as info on missing KRs", () => {
        const entities = [makeEntity({ ref: "mission:no-kr", kind: "Mission" } as any)];
        const result = validateEntities(entities);
        // info severity maps to warnings
        expect(result.warnings.find((w) => w.rule === "ea:quality:mission-missing-key-results")).toBeDefined();
    });
});
// ─── Relation Extension: realizes ───────────────────────────────────────────────
describe("Phase 2D: realizes Extension", () => {
    const registry = createDefaultRegistry();
    it("accepts business-service as valid source for realizes", () => {
        expect(registry.isValidSourceSchema("realizes", "business-service")).toBe(true);
    });
    it("accepts capability as valid target for realizes", () => {
        expect(registry.isValidTargetSchema("realizes", "capability")).toBe(true);
    });
    it("accepts mission as valid target for realizes", () => {
        expect(registry.isValidTargetSchema("realizes", "mission")).toBe(true);
    });
    it("validates application → capability via realizes", () => {
        const entities = [
            makeEntity({
                ref: "component:orders",
                kind: "Component",
                type: "website",
                realizes: ["capability:fulfillment"]
            }),
            makeEntity({ ref: "capability:fulfillment", kind: "Capability" }),
        ];
        const result = validateEaRelations(entities, registry);
        expect(result.errors).toHaveLength(0);
    });
});
// ─── Phase 2D: New Relations ────────────────────────────────────────────────────
describe("Phase 2D: New Relations", () => {
    const registry = createDefaultRegistry();
    describe("supports", () => {
        it("is registered with correct source and target kinds", () => {
            const entry = registry.get("supports");
            expect(entry).toBeDefined();
            expect(entry!.inverse).toBe("supportedBy");
            expect(entry!.validSourceSchemas).toContain("application");
            expect(entry!.validSourceSchemas).toContain("capability");
            expect(entry!.validTargetSchemas).toContain("capability");
            expect(entry!.validTargetSchemas).toContain("mission");
            expect(entry!.validTargetSchemas).toContain("value-stream");
        });
        it("validates app → capability via supports", () => {
            const entities = [
                makeEntity({
                    ref: "component:orders",
                    kind: "Component",
                    type: "website",
                    supports: ["capability:fulfillment"]
                }),
                makeEntity({ ref: "capability:fulfillment", kind: "Capability" }),
            ];
            const result = validateEaRelations(entities, registry);
            expect(result.errors).toHaveLength(0);
        });
    });
    describe("performedBy", () => {
        it("is registered with correct source and target kinds", () => {
            const entry = registry.get("performedBy");
            expect(entry).toBeDefined();
            expect(entry!.inverse).toBe("performs");
            expect(entry!.validSourceSchemas).toContain("capability");
            expect(entry!.validSourceSchemas).toContain("process");
            expect(entry!.validTargetSchemas).toContain("org-unit");
        });
        it("validates process → org-unit via performedBy", () => {
            const entities = [
                makeEntity({
                    ref: "valuestream:order-processing",
                    kind: "ValueStream",
                    type: "process",
                    performedBy: ["group:ops"]
                }),
                makeEntity({ ref: "group:ops", kind: "Group", type: "team" }),
            ];
            const result = validateEaRelations(entities, registry);
            expect(result.errors).toHaveLength(0);
        });
    });
    describe("governedBy", () => {
        it("accepts any source kind (wildcard)", () => {
            const entry = registry.get("governedBy");
            expect(entry).toBeDefined();
            expect(entry!.validSourceSchemas).toBe("*");
        });
        it("validates app → policy-objective via governedBy", () => {
            const entities = [
                makeEntity({
                    ref: "component:orders",
                    kind: "Component",
                    type: "website",
                    governedBy: ["mission:order-sla"]
                }),
                makeEntity({ ref: "mission:order-sla", kind: "Mission", type: "policy-objective" }),
            ];
            const result = validateEaRelations(entities, registry);
            expect(result.errors).toHaveLength(0);
        });
    });
    describe("ownedBy", () => {
        it("is registered with wildcard source and org-unit/user target", () => {
            const entry = registry.get("ownedBy");
            expect(entry).toBeDefined();
            expect(entry!.validSourceSchemas).toBe("*");
            expect(entry!.validTargetSchemas).toEqual(["org-unit", "user"]);
        });
        it("validates application → org-unit via ownedBy", () => {
            const entities = [
                makeEntity({
                    ref: "component:orders",
                    kind: "Component",
                    type: "website",
                    owner: "group:eng"
                }),
                makeEntity({ ref: "group:eng", kind: "Group", type: "team" }),
            ];
            const result = validateEaRelations(entities, registry);
            expect(result.errors).toHaveLength(0);
        });
        it("rejects non-owner target for ownedBy", () => {
            const entities = [
                makeEntity({
                    ref: "component:orders",
                    kind: "Component",
                    type: "website",
                    owner: "component:billing"
                }),
                makeEntity({ ref: "component:billing", kind: "Component", type: "website" }),
            ];
            const result = validateEaRelations(entities, registry);
            expect(result.errors.find((e) => e.rule === "ea:relation:invalid-target")).toBeDefined();
        });
    });
});
// ─── Phase 2D: Drift Rules ─────────────────────────────────────────────────────
describe("Phase 2D: Business Drift Rules", () => {
    describe("ea:business/no-realizing-systems", () => {
        it("fires when active capability has no realizing systems", () => {
            const entities = [
                makeEntity({ ref: "capability:lonely", kind: "Capability", status: "active" }),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:business/no-realizing-systems")).toBeDefined();
        });
        it("does not fire when capability has a realizes relation", () => {
            const entities = [
                makeEntity({ ref: "capability:good", kind: "Capability", status: "active" }),
                makeEntity({
                    ref: "component:orders",
                    kind: "Component",
                    type: "website",
                    realizes: ["capability:good"]
                }),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:business/no-realizing-systems")).toBeUndefined();
        });
    });
    describe("ea:business/retired-system-dependency", () => {
        it("fires when active capability is realized by retired system", () => {
            const entities = [
                makeEntity({ ref: "capability:fulfillment", kind: "Capability", status: "active" }),
                makeEntity({
                    ref: "component:sunset",
                    kind: "Component",
                    type: "website",
                    status: "retired",
                    realizes: ["capability:fulfillment"]
                }),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.errors.find((e) => e.rule === "ea:business/retired-system-dependency")).toBeDefined();
        });
        it("does not fire when realizing system is active", () => {
            const entities = [
                makeEntity({ ref: "capability:fulfillment", kind: "Capability", status: "active" }),
                makeEntity({
                    ref: "component:orders",
                    kind: "Component",
                    type: "website",
                    status: "active",
                    realizes: ["capability:fulfillment"]
                }),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.errors.find((e) => e.rule === "ea:business/retired-system-dependency")).toBeUndefined();
        });
    });
    describe("ea:business/process-missing-owner", () => {
        it("fires when process has no owner", () => {
            const entities = [
                makeEntity({ ref: "valuestream:orphan", kind: "ValueStream", type: "process" }),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:business/process-missing-owner")).toBeDefined();
        });
        it("does not fire when process has processOwner field", () => {
            const entities = [
                makeEntity({ ref: "valuestream:owned", kind: "ValueStream", type: "process", processOwner: "ops-lead" } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:business/process-missing-owner")).toBeUndefined();
        });
    });
    describe("ea:business/control-missing-evidence", () => {
        it("fires when automated control has no evidence", () => {
            const entities = [
                makeEntity({
                    ref: "control:no-evidence",
                    kind: "Control",
                    controlType: "detective",
                    implementation: "automated",
                    assertion: "test"
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:business/control-missing-evidence")).toBeDefined();
        });
        it("does not fire when manual control has no evidence", () => {
            const entities = [
                makeEntity({
                    ref: "control:manual",
                    kind: "Control",
                    controlType: "detective",
                    implementation: "manual",
                    assertion: "test"
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:business/control-missing-evidence")).toBeUndefined();
        });
    });
    describe("ea:business/orphan-capability", () => {
        it("fires when capability has no parent, children, or systems", () => {
            const entities = [
                makeEntity({ ref: "capability:island", kind: "Capability", level: 1 } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:business/orphan-capability")).toBeDefined();
        });
        it("does not fire when capability has a child", () => {
            const entities = [
                makeEntity({ ref: "capability:parent", kind: "Capability", level: 1 } as any),
                makeEntity({ ref: "capability:child", kind: "Capability", level: 2, parentCapability: "capability:parent" } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:business/orphan-capability" && w.path === "capability:parent")).toBeUndefined();
        });
    });
    describe("ea:business/mission-no-capabilities", () => {
        it("fires when mission has no supporting capabilities", () => {
            const entities = [
                makeEntity({ ref: "mission:lonely", kind: "Mission" }),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:business/mission-no-capabilities")).toBeDefined();
        });
        it("does not fire when mission has supports relation", () => {
            const entities = [
                makeEntity({ ref: "mission:good", kind: "Mission" }),
                makeEntity({
                    ref: "capability:commerce",
                    kind: "Capability",
                    supports: ["mission:good"]
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:business/mission-no-capabilities")).toBeUndefined();
        });
    });
    describe("ea:business/policy-no-controls", () => {
        it("fires when policy has no enforcing controls", () => {
            const entities = [
                makeEntity({ ref: "mission:lonely", kind: "Mission", type: "policy-objective", category: "sla", objective: "test" } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:business/policy-no-controls")).toBeDefined();
        });
        it("does not fire when policy has enforcedBy", () => {
            const entities = [
                makeEntity({
                    ref: "mission:enforced",
                    kind: "Mission",
                    type: "policy-objective",
                    category: "sla",
                    objective: "test",
                    enforcedBy: ["control:latency"]
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:business/policy-no-controls")).toBeUndefined();
        });
    });
    describe("ea:business/value-stream-bottleneck", () => {
        it("fires when value stream has bottleneck stage", () => {
            const entities = [
                makeEntity({
                    ref: "valuestream:onboarding",
                    kind: "ValueStream",
                    stages: [
                        { ref: "s1", name: "Registration", supportingCapabilities: [], bottleneck: false },
                        { ref: "s2", name: "KYC Check", supportingCapabilities: [], bottleneck: true }
                    ],
                    customer: "test",
                    valueProposition: "test"
                } as any),
            ];
            const result = evaluateEaDrift(entities);
            expect(result.warnings.find((w) => w.rule === "ea:business/value-stream-bottleneck")).toBeDefined();
        });
    });
    it("evaluates all 27 static drift rules", () => {
        const result = evaluateEaDrift([]);
        expect(result.rulesEvaluated).toBe(39);
        expect(result.rulesSkipped).toBe(5);
    });
});
// ─── Phase 2D: Capability Map Report ────────────────────────────────────────────
import { buildCapabilityMap, renderCapabilityMapMarkdown } from "../index.js";
describe("Phase 2D: Capability Map Report", () => {
    const capabilityRef = (name: string) => `capability:default/${name}`;
    const missionRef = (name: string) => `mission:default/${name}`;
    const componentRef = (name: string) => `component:default/${name}`;
    const valueStreamRef = (name: string) => `valuestream:default/${name}`;
    const controlRef = (name: string) => `control:default/${name}`;
    const groupRef = (name: string) => `group:default/${name}`;
    it("returns empty report when no capabilities exist", () => {
        const report = buildCapabilityMap([]);
        expect(report.missions).toHaveLength(0);
        expect(report.unmappedCapabilities).toHaveLength(0);
        expect(report.summary.capabilityCount).toBe(0);
    });
    it("builds hierarchy from parentCapability", () => {
        const entities = [
            makeEntity({ ref: "capability:commerce", kind: "Capability", level: 1 } as any),
            makeEntity({ ref: "capability:orders", kind: "Capability", level: 2, parentCapability: "capability:commerce" } as any),
            makeEntity({ ref: "capability:payments", kind: "Capability", level: 2, parentCapability: "capability:commerce" } as any),
        ];
        const report = buildCapabilityMap(entities);
        expect(report.summary.capabilityCount).toBe(3);
        // All unmapped since no mission
        expect(report.unmappedCapabilities).toHaveLength(1);
        expect(report.unmappedCapabilities[0].id).toBe(capabilityRef("commerce"));
        expect(report.unmappedCapabilities[0].children).toHaveLength(2);
    });
    it("maps capabilities to missions via supports", () => {
        const entities = [
            makeEntity({ ref: "mission:digital", kind: "Mission" }),
            makeEntity({
                ref: "capability:commerce",
                kind: "Capability",
                level: 1,
                supports: ["mission:digital"]
            } as any),
            makeEntity({ ref: "capability:orders", kind: "Capability", level: 2, parentCapability: "capability:commerce" } as any),
        ];
        const report = buildCapabilityMap(entities);
        expect(report.missions).toHaveLength(1);
        expect(report.missions[0].id).toBe(missionRef("digital"));
        expect(report.missions[0].capabilities).toHaveLength(1);
        expect(report.missions[0].capabilities[0].id).toBe(capabilityRef("commerce"));
        expect(report.missions[0].capabilities[0].children).toHaveLength(1);
        expect(report.unmappedCapabilities).toHaveLength(0);
    });
    it("enriches capabilities with realizing systems", () => {
        const entities = [
            makeEntity({ ref: "capability:orders", kind: "Capability", level: 1 } as any),
            makeEntity({
                ref: "component:orders",
                kind: "Component",
                type: "website",
                realizes: ["capability:orders"]
            }),
        ];
        const report = buildCapabilityMap(entities);
        const cap = report.unmappedCapabilities[0];
        expect(cap.realizingSystems).toEqual([componentRef("orders")]);
        expect(report.summary.realizingSystemCount).toBe(1);
    });
    it("enriches capabilities with processes", () => {
        const entities = [
            makeEntity({ ref: "capability:orders", kind: "Capability", level: 1 } as any),
            makeEntity({
                ref: "valuestream:order-processing",
                kind: "ValueStream",
                type: "process",
                realizes: ["capability:orders"]
            }),
        ];
        const report = buildCapabilityMap(entities);
        expect(report.unmappedCapabilities[0].processes).toEqual([valueStreamRef("order-processing")]);
    });
    it("enriches capabilities with controls via governedBy", () => {
        const entities = [
            makeEntity({
                ref: "capability:orders",
                kind: "Capability",
                level: 1,
                governedBy: ["control:latency"]
            } as any),
            makeEntity({
                ref: "control:latency",
                kind: "Control",
                controlType: "detective",
                implementation: "automated",
                assertion: "latency < 200ms"
            } as any),
        ];
        const report = buildCapabilityMap(entities);
        expect(report.unmappedCapabilities[0].controls).toEqual([controlRef("latency")]);
    });
    it("enriches capabilities with owning org via ownedBy", () => {
        const entities = [
            makeEntity({
                ref: "capability:orders",
                kind: "Capability",
                level: 1,
                owner: "group:eng"
            } as any),
            makeEntity({ ref: "group:eng", kind: "Group", type: "team" }),
        ];
        const report = buildCapabilityMap(entities);
        expect(report.unmappedCapabilities[0].owningOrg).toBe(groupRef("eng"));
    });
    it("includes heatMap and maturity metadata", () => {
        const entities = [
            makeEntity({
                ref: "capability:orders",
                kind: "Capability",
                level: 1,
                maturity: "managed",
                strategicImportance: "core",
                investmentProfile: "invest",
                heatMap: { businessValue: "high", technicalHealth: "fair", risk: "medium" }
            } as any),
        ];
        const report = buildCapabilityMap(entities);
        const cap = report.unmappedCapabilities[0];
        expect(cap.maturity).toBe("managed");
        expect(cap.strategicImportance).toBe("core");
        expect(cap.investmentProfile).toBe("invest");
        expect(cap.heatMap).toEqual({ businessValue: "high", technicalHealth: "fair", risk: "medium" });
    });
    it("includes drift summary per capability", () => {
        // Active capability with no realizing systems → should produce a drift warning
        const entities = [
            makeEntity({ ref: "capability:lonely", kind: "Capability", level: 1, status: "active" } as any),
        ];
        const report = buildCapabilityMap(entities);
        const cap = report.unmappedCapabilities[0];
        expect(cap.driftSummary.warnings).toBeGreaterThan(0);
        expect(report.summary.driftWarningCount).toBeGreaterThan(0);
    });
    it("computes maxDepth correctly", () => {
        const entities = [
            makeEntity({ ref: "capability:l1", kind: "Capability", level: 1 } as any),
            makeEntity({ ref: "capability:l2", kind: "Capability", level: 2, parentCapability: "capability:l1" } as any),
            makeEntity({ ref: "capability:l3", kind: "Capability", level: 3, parentCapability: "capability:l2" } as any),
        ];
        const report = buildCapabilityMap(entities);
        expect(report.summary.maxDepth).toBe(3);
    });
    describe("renderCapabilityMapMarkdown", () => {
        it("renders empty report", () => {
            const report = buildCapabilityMap([]);
            const md = renderCapabilityMapMarkdown(report);
            expect(md).toContain("# Capability Map");
            expect(md).toContain("_No capabilities found._");
        });
        it("renders missions with capability trees", () => {
            const entities = [
                makeEntity({ ref: "mission:digital", kind: "Mission" }),
                makeEntity({
                    ref: "capability:commerce",
                    kind: "Capability",
                    level: 1,
                    strategicImportance: "core",
                    investmentProfile: "invest",
                    maturity: "managed",
                    supports: ["mission:digital"]
                } as any),
                makeEntity({
                    ref: "capability:orders",
                    kind: "Capability",
                    level: 2,
                    parentCapability: "capability:commerce"
                } as any),
                makeEntity({
                    ref: "component:orders",
                    kind: "Component",
                    type: "website",
                    status: "active",
                    realizes: ["capability:orders"]
                }),
            ];
            const report = buildCapabilityMap(entities);
            const md = renderCapabilityMapMarkdown(report);
            expect(md).toContain("## Mission: mission:digital");
            expect(md).toContain("**L1: capability:commerce**");
            expect(md).toContain("core, invest, maturity: managed");
            expect(md).toContain("Realized by:");
            expect(md).toContain("`component:default/orders`");
            expect(md).toContain("## Summary");
        });
        it("renders unmapped capabilities section", () => {
            const entities = [
                makeEntity({ ref: "capability:orphan", kind: "Capability", level: 1 } as any),
            ];
            const report = buildCapabilityMap(entities);
            const md = renderCapabilityMapMarkdown(report);
            expect(md).toContain("## Unmapped Capabilities");
        });
    });
});
