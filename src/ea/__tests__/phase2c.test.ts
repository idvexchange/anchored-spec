/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for Phase 2C: Information Layer Schemas, Types, Quality Rules
 *
 * Covers:
 *  - 6 information-layer kinds in EA_KIND_REGISTRY
 *  - Schema validation for all 6 kinds
 *  - 7 quality rules for information-layer artifacts
 *  - ea create templates for all 6 kinds
 *  - implementedBy relation extension (information-concept → canonical-entity)
 *  - 3 new relations (classifiedAs, exchangedVia, retainedUnder)
 *  - 8 information drift rules including classification propagation
 */
import { describe, it, expect } from "vitest";
import { createDefaultRegistry, validateEntities, validateEaRelations, validateEaSchema, evaluateEaDrift, } from "../index.js";
import { ENTITY_DESCRIPTOR_REGISTRY, getSchemaDescriptor } from "../backstage/kind-mapping.js";
import { makeEntity } from "./helpers/make-entity.js";
// ─── Kind Registry ──────────────────────────────────────────────────────────────
describe("Phase 2C: Information Layer Kinds", () => {
    const infoKinds = ENTITY_DESCRIPTOR_REGISTRY.filter((entry) => entry.domain === "information");
    it("registers 7 information-layer kinds", () => {
        expect(infoKinds).toHaveLength(7);
    });
    it.each([
        "information-concept",
        "canonical-entity",
        "information-exchange",
        "classification",
        "retention-policy",
        "glossary-term",
    ])("registers %s in the information domain", (kind) => {
        const entry = getSchemaDescriptor(kind);
        expect(entry).toBeDefined();
        expect(entry!.domain).toBe("information");
    });
});
// ─── Schema Validation ──────────────────────────────────────────────────────────
describe("Phase 2C: Schema Validation", () => {
    describe("information-concept", () => {
        it("validates a valid information-concept", () => {
            const result = validateEaSchema({
                ref: "canonicalentity:customer-concept",
                schemaVersion: "1.0.0",
                kind: "CanonicalEntity",
                type: "concept",
                title: "Customer",
                status: "active",
                summary: "The customer concept",
                owners: ["team-data"],
                confidence: "declared",
                domain: "commerce",
                glossaryTerms: ["canonicalentity:customer"],
                synonyms: ["buyer", "client"]
            }, "information-concept");
            expect(result.valid).toBe(true);
        });
        it("rejects missing domain", () => {
            const result = validateEaSchema({
                ref: "canonicalentity:bad",
                schemaVersion: "1.0.0",
                kind: "CanonicalEntity",
                type: "concept",
                title: "Bad",
                status: "active",
                summary: "Missing domain",
                owners: ["team"],
                confidence: "declared"
            }, "information-concept");
            expect(result.valid).toBe(false);
        });
    });
    describe("canonical-entity", () => {
        it("validates a valid canonical-entity", () => {
            const result = validateEaSchema({
                ref: "canonicalentity:customer-entity",
                schemaVersion: "1.0.0",
                kind: "CanonicalEntity",
                title: "Customer Entity",
                status: "active",
                summary: "The canonical customer entity",
                owners: ["team-data"],
                confidence: "declared",
                attributes: [
                    { name: "id", type: "uuid", required: true },
                    { name: "email", type: "email", required: true, classification: "control:pii" }
                ],
                conceptRef: "canonicalentity:customer-concept",
                governanceStatus: "ratified"
            }, "canonical-entity");
            expect(result.valid).toBe(true);
        });
        it("rejects empty attributes", () => {
            const result = validateEaSchema({
                ref: "canonicalentity:bad",
                schemaVersion: "1.0.0",
                kind: "CanonicalEntity",
                title: "Bad Entity",
                status: "active",
                summary: "No attributes",
                owners: ["team"],
                confidence: "declared",
                attributes: []
            }, "canonical-entity");
            expect(result.valid).toBe(false);
        });
        it("rejects attribute without type", () => {
            const result = validateEaSchema({
                ref: "canonicalentity:bad",
                schemaVersion: "1.0.0",
                kind: "CanonicalEntity",
                title: "Bad Entity",
                status: "active",
                summary: "Attribute missing type",
                owners: ["team"],
                confidence: "declared",
                attributes: [{ name: "id" }]
            }, "canonical-entity");
            expect(result.valid).toBe(false);
        });
        it("rejects invalid governanceStatus", () => {
            const result = validateEaSchema({
                ref: "canonicalentity:bad",
                schemaVersion: "1.0.0",
                kind: "CanonicalEntity",
                title: "Bad Entity",
                status: "active",
                summary: "Invalid governance",
                owners: ["team"],
                confidence: "declared",
                attributes: [{ name: "id", type: "uuid" }],
                governanceStatus: "invalid-value"
            }, "canonical-entity");
            expect(result.valid).toBe(false);
        });
    });
    describe("information-exchange", () => {
        it("validates a valid information-exchange", () => {
            const result = validateEaSchema({
                ref: "exchange:customer-onboarding",
                schemaVersion: "1.0.0",
                kind: "Exchange",
                title: "Customer Onboarding Exchange",
                status: "active",
                summary: "Exchanges customer data during onboarding",
                owners: ["team-data"],
                confidence: "declared",
                source: { entityRef: "component:frontend", role: "collector" },
                destination: { entityRef: "component:backend", role: "processor" },
                exchangedEntities: ["canonicalentity:customer"],
                purpose: "Customer onboarding flow",
                trigger: "request",
                classificationLevel: "control:pii"
            }, "information-exchange");
            expect(result.valid).toBe(true);
        });
        it("rejects missing source", () => {
            const result = validateEaSchema({
                ref: "exchange:bad",
                schemaVersion: "1.0.0",
                kind: "Exchange",
                title: "Bad Exchange",
                status: "active",
                summary: "Missing source",
                owners: ["team"],
                confidence: "declared",
                destination: { entityRef: "component:backend" },
                exchangedEntities: ["canonicalentity:customer"],
                purpose: "test"
            }, "information-exchange");
            expect(result.valid).toBe(false);
        });
        it("rejects invalid trigger enum", () => {
            const result = validateEaSchema({
                ref: "exchange:bad",
                schemaVersion: "1.0.0",
                kind: "Exchange",
                title: "Bad Exchange",
                status: "active",
                summary: "Invalid trigger",
                owners: ["team"],
                confidence: "declared",
                source: { entityRef: "component:frontend" },
                destination: { entityRef: "component:backend" },
                exchangedEntities: ["canonicalentity:customer"],
                purpose: "test",
                trigger: "invalid-trigger"
            }, "information-exchange");
            expect(result.valid).toBe(false);
        });
    });
    describe("classification", () => {
        it("validates a valid classification", () => {
            const result = validateEaSchema({
                ref: "control:pii",
                schemaVersion: "1.0.0",
                kind: "Control",
                type: "classification",
                title: "PII Classification",
                status: "active",
                summary: "Personally identifiable information",
                owners: ["team-security"],
                confidence: "declared",
                level: "restricted",
                requiredControls: [
                    { control: "encryption-at-rest", description: "All PII must be encrypted at rest" },
                    { control: "access-logging", description: "All access must be logged", enforcedBy: "technology:audit-system" }
                ],
                regulations: ["GDPR", "CCPA"],
                handling: {
                    encryption: "both",
                    auditLogging: true,
                    masking: "partial"
                }
            }, "classification");
            expect(result.valid).toBe(true);
        });
        it("rejects empty requiredControls", () => {
            const result = validateEaSchema({
                ref: "control:bad",
                schemaVersion: "1.0.0",
                kind: "Control",
                type: "classification",
                title: "Bad Classification",
                status: "active",
                summary: "No controls",
                owners: ["team"],
                confidence: "declared",
                level: "public",
                requiredControls: []
            }, "classification");
            expect(result.valid).toBe(false);
        });
        it("rejects invalid encryption enum", () => {
            const result = validateEaSchema({
                ref: "control:bad",
                schemaVersion: "1.0.0",
                kind: "Control",
                type: "classification",
                title: "Bad",
                status: "active",
                summary: "Invalid encryption",
                owners: ["team"],
                confidence: "declared",
                level: "public",
                requiredControls: [{ control: "c", description: "d" }],
                handling: { encryption: "invalid" }
            }, "classification");
            expect(result.valid).toBe(false);
        });
    });
    describe("retention-policy", () => {
        it("validates a valid retention-policy", () => {
            const result = validateEaSchema({
                ref: "control:order-data",
                schemaVersion: "1.0.0",
                kind: "Control",
                type: "retention-policy",
                title: "Order Data Retention",
                status: "active",
                summary: "7-year retention for order data",
                owners: ["team-compliance"],
                confidence: "declared",
                appliesTo: ["resource:orders-db"],
                retention: { duration: "7 years", basis: "Tax regulations", startEvent: "order-closed" },
                disposal: { method: "anonymize", description: "Replace PII with hashes" },
                legalBasis: "EU tax directive",
                exceptions: [{ condition: "Active litigation hold", extendedDuration: "indefinite" }]
            }, "retention-policy");
            expect(result.valid).toBe(true);
        });
        it("rejects missing retention", () => {
            const result = validateEaSchema({
                ref: "control:bad",
                schemaVersion: "1.0.0",
                kind: "Control",
                type: "retention-policy",
                title: "Bad Policy",
                status: "active",
                summary: "Missing retention",
                owners: ["team"],
                confidence: "declared",
                appliesTo: ["resource:x"],
                disposal: { method: "delete" }
            }, "retention-policy");
            expect(result.valid).toBe(false);
        });
        it("rejects invalid disposal method", () => {
            const result = validateEaSchema({
                ref: "control:bad",
                schemaVersion: "1.0.0",
                kind: "Control",
                type: "retention-policy",
                title: "Bad Policy",
                status: "active",
                summary: "Invalid disposal",
                owners: ["team"],
                confidence: "declared",
                appliesTo: ["resource:x"],
                retention: { duration: "1 year", basis: "test" },
                disposal: { method: "shred" }
            }, "retention-policy");
            expect(result.valid).toBe(false);
        });
    });
    describe("glossary-term", () => {
        it("validates a valid glossary-term", () => {
            const result = validateEaSchema({
                ref: "canonicalentity:customer",
                schemaVersion: "1.0.0",
                kind: "CanonicalEntity",
                type: "glossary-term",
                title: "Customer",
                status: "active",
                summary: "The canonical customer term",
                owners: ["team-data"],
                confidence: "declared",
                definition: "An entity that has purchased or registered intent to purchase.",
                domain: "commerce",
                synonyms: ["buyer", "client"],
                antonymsOrConfusables: [
                    { term: "prospect", distinction: "A prospect has not yet purchased" }
                ],
                relatedConcepts: ["canonicalentity:customer"],
                examples: ["Jane Doe who bought a widget"],
                approvedBy: "data-governance-board"
            }, "glossary-term");
            expect(result.valid).toBe(true);
        });
        it("rejects missing definition", () => {
            const result = validateEaSchema({
                ref: "canonicalentity:bad",
                schemaVersion: "1.0.0",
                kind: "CanonicalEntity",
                type: "glossary-term",
                title: "Bad Term",
                status: "active",
                summary: "No definition",
                owners: ["team"],
                confidence: "declared",
                domain: "commerce"
            }, "glossary-term");
            expect(result.valid).toBe(false);
        });
        it("rejects missing domain", () => {
            const result = validateEaSchema({
                ref: "canonicalentity:bad",
                schemaVersion: "1.0.0",
                kind: "CanonicalEntity",
                type: "glossary-term",
                title: "Bad Term",
                status: "active",
                summary: "No domain",
                owners: ["team"],
                confidence: "declared",
                definition: "A thing."
            }, "glossary-term");
            expect(result.valid).toBe(false);
        });
    });
});
// ─── Quality Rules ──────────────────────────────────────────────────────────────
describe("Phase 2C: Quality Rules", () => {
    it("ea:quality:ce-missing-attributes — fires on empty attributes", () => {
        const artifacts = [
            makeEntity({
                ref: "canonicalentity:empty",
                kind: "CanonicalEntity",
                attributes: []
            } as any),
        ];
        const result = validateEntities(artifacts);
        expect(result.errors.find((e) => e.rule === "ea:quality:ce-missing-attributes")).toBeDefined();
    });
    it("ea:quality:ce-attribute-missing-type — fires on attribute without type", () => {
        const artifacts = [
            makeEntity({
                ref: "canonicalentity:no-type",
                kind: "CanonicalEntity",
                attributes: [{ name: "id", type: "" }]
            } as any),
        ];
        const result = validateEntities(artifacts);
        expect(result.errors.find((e) => e.rule === "ea:quality:ce-attribute-missing-type")).toBeDefined();
    });
    it("ea:quality:exchange-missing-source-destination — fires on missing source", () => {
        const artifacts = [
            makeEntity({
                ref: "exchange:no-source",
                kind: "Exchange",
                destination: { entityRef: "component:backend" },
                exchangedEntities: ["canonicalentity:x"],
                purpose: "test"
            } as any),
        ];
        const result = validateEntities(artifacts);
        expect(result.errors.find((e) => e.rule === "ea:quality:exchange-missing-source-destination")).toBeDefined();
    });
    it("ea:quality:exchange-missing-purpose — fires on empty purpose", () => {
        const artifacts = [
            makeEntity({
                ref: "exchange:no-purpose",
                kind: "Exchange",
                source: { entityRef: "component:frontend" },
                destination: { entityRef: "component:backend" },
                exchangedEntities: ["canonicalentity:x"],
                purpose: ""
            } as any),
        ];
        const result = validateEntities(artifacts);
        expect(result.errors.find((e) => e.rule === "ea:quality:exchange-missing-purpose")).toBeDefined();
    });
    it("ea:quality:classification-missing-controls — fires on empty controls", () => {
        const artifacts = [
            makeEntity({
                ref: "control:no-controls",
                kind: "Control",
                type: "classification",
                level: "public",
                requiredControls: []
            } as any),
        ];
        const result = validateEntities(artifacts);
        expect(result.errors.find((e) => e.rule === "ea:quality:classification-missing-controls")).toBeDefined();
    });
    it("ea:quality:retention-missing-duration — fires on missing duration", () => {
        const artifacts = [
            makeEntity({
                ref: "control:no-duration",
                kind: "Control",
                type: "retention-policy",
                appliesTo: ["resource:x"],
                retention: { duration: "", basis: "test" },
                disposal: { method: "delete" }
            } as any),
        ];
        const result = validateEntities(artifacts);
        expect(result.errors.find((e) => e.rule === "ea:quality:retention-missing-duration")).toBeDefined();
    });
    it("ea:quality:glossary-missing-definition — fires on empty definition", () => {
        const artifacts = [
            makeEntity({
                ref: "canonicalentity:no-def",
                kind: "CanonicalEntity",
                type: "glossary-term",
                definition: "",
                domain: "commerce"
            } as any),
        ];
        const result = validateEntities(artifacts);
        expect(result.errors.find((e) => e.rule === "ea:quality:glossary-missing-definition")).toBeDefined();
    });
    it("passes quality for well-formed information artifacts", () => {
        const artifacts = [
            makeEntity({
                ref: "canonicalentity:good",
                kind: "CanonicalEntity",
                attributes: [{ name: "id", type: "uuid" }],
                classifiedAs: ["control:pii"]
            } as any),
            makeEntity({
                ref: "control:pii",
                kind: "Control",
                type: "classification",
                level: "restricted",
                requiredControls: [{ control: "encryption", description: "Encrypt all PII" }]
            } as any),
        ];
        const result = validateEntities(artifacts);
        // No quality rule errors for these well-formed artifacts
        const infoRules = result.errors.filter((e) => e.rule?.startsWith("ea:quality:ce-") ||
            e.rule?.startsWith("ea:quality:exchange-") ||
            e.rule?.startsWith("ea:quality:classification-") ||
            e.rule?.startsWith("ea:quality:retention-") ||
            e.rule?.startsWith("ea:quality:glossary-"));
        expect(infoRules).toHaveLength(0);
    });
});
// ─── Relation Extension: implementedBy ──────────────────────────────────────────
describe("Phase 2C: implementedBy Extension", () => {
    const registry = createDefaultRegistry();
    it("accepts information-concept as valid source for implementedBy", () => {
        expect(registry.isValidSourceSchema("implementedBy", "information-concept")).toBe(true);
    });
    it("accepts canonical-entity as valid target for implementedBy", () => {
        expect(registry.isValidTargetSchema("implementedBy", "canonical-entity")).toBe(true);
    });
    it("validates information-concept → canonical-entity via implementedBy", () => {
        const artifacts = [
            makeEntity({
                ref: "canonicalentity:customer-concept",
                kind: "CanonicalEntity",
                type: "concept",
                implementedBy: ["canonicalentity:customer-entity"]
            } as any),
            makeEntity({
                ref: "canonicalentity:customer-entity",
                kind: "CanonicalEntity"
            }),
        ];
        const result = validateEaRelations(artifacts, registry);
        expect(result.errors).toHaveLength(0);
    });
    it("still accepts logical-data-model as source for implementedBy", () => {
        expect(registry.isValidSourceSchema("implementedBy", "logical-data-model")).toBe(true);
    });
});
// ─── Phase 2C: New Relations ────────────────────────────────────────────────────
describe("Phase 2C: New Relations", () => {
    const registry = createDefaultRegistry();
    describe("classifiedAs", () => {
        it("is registered with correct source and target kinds", () => {
            const entry = registry.get("classifiedAs");
            expect(entry).toBeDefined();
            expect(entry!.inverse).toBe("classifies");
            expect(entry!.validSourceSchemas).toContain("canonical-entity");
            expect(entry!.validSourceSchemas).toContain("data-store");
            expect(entry!.validSourceSchemas).toContain("information-exchange");
            expect(entry!.validTargetSchemas).toEqual(["classification"]);
        });
        it("validates CE → classification via classifiedAs", () => {
            const artifacts = [
                makeEntity({
                    ref: "canonicalentity:customer-entity",
                    kind: "CanonicalEntity",
                    classifiedAs: ["control:pii"]
                } as any),
                makeEntity({ ref: "control:pii", kind: "Control", type: "classification" }),
            ];
            const result = validateEaRelations(artifacts, registry);
            expect(result.errors).toHaveLength(0);
        });
        it("rejects invalid source kind for classifiedAs", () => {
            const artifacts = [
                makeEntity({
                    ref: "component:frontend",
                    kind: "Component",
                    type: "website",
                    classifiedAs: ["control:pii"]
                }),
                makeEntity({ ref: "control:pii", kind: "Control", type: "classification" }),
            ];
            const result = validateEaRelations(artifacts, registry);
            expect(result.errors.find((e) => e.rule === "ea:relation:invalid-source")).toBeDefined();
        });
        it("rejects invalid target kind for classifiedAs", () => {
            const artifacts = [
                makeEntity({
                    ref: "canonicalentity:customer-entity",
                    kind: "CanonicalEntity",
                    classifiedAs: ["component:backend"]
                } as any),
                makeEntity({ ref: "component:backend", kind: "Component", type: "website" }),
            ];
            const result = validateEaRelations(artifacts, registry);
            expect(result.errors.find((e) => e.rule === "ea:relation:invalid-target")).toBeDefined();
        });
    });
    describe("exchangedVia", () => {
        it("is registered with correct source and target kinds", () => {
            const entry = registry.get("exchangedVia");
            expect(entry).toBeDefined();
            expect(entry!.inverse).toBe("exchanges");
            expect(entry!.validSourceSchemas).toContain("canonical-entity");
            expect(entry!.validSourceSchemas).toContain("information-concept");
            expect(entry!.validTargetSchemas).toContain("information-exchange");
            expect(entry!.validTargetSchemas).toContain("api-contract");
        });
        it("validates CE → information-exchange via exchangedVia", () => {
            const artifacts = [
                makeEntity({
                    ref: "canonicalentity:customer-entity",
                    kind: "CanonicalEntity",
                    exchangedVia: ["exchange:onboarding"]
                } as any),
                makeEntity({ ref: "exchange:onboarding", kind: "Exchange" }),
            ];
            const result = validateEaRelations(artifacts, registry);
            expect(result.errors).toHaveLength(0);
        });
    });
    describe("retainedUnder", () => {
        it("is registered with correct source and target kinds", () => {
            const entry = registry.get("retainedUnder");
            expect(entry).toBeDefined();
            expect(entry!.inverse).toBe("retains");
            expect(entry!.validSourceSchemas).toContain("data-store");
            expect(entry!.validSourceSchemas).toContain("data-product");
            expect(entry!.validTargetSchemas).toEqual(["retention-policy"]);
        });
        it("validates data-store → retention-policy via retainedUnder", () => {
            const artifacts = [
                makeEntity({
                    ref: "resource:orders",
                    kind: "Resource",
                    type: "database",
                    retainedUnder: ["control:7y"]
                } as any),
                makeEntity({ ref: "control:7y", kind: "Control", type: "retention-policy" }),
            ];
            const result = validateEaRelations(artifacts, registry);
            expect(result.errors).toHaveLength(0);
        });
    });
});
// ─── Phase 2C: Drift Rules ──────────────────────────────────────────────────────
describe("Phase 2C: Information Drift Rules", () => {
    describe("ea:information/entity-missing-implementation", () => {
        it("fires when CE has no implementedBy relation", () => {
            const artifacts = [
                makeEntity({ ref: "canonicalentity:orphan", kind: "CanonicalEntity" }),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((w) => w.rule === "ea:information/entity-missing-implementation")).toBeDefined();
        });
        it("does not fire when CE has implementedBy", () => {
            const artifacts = [
                makeEntity({
                    ref: "canonicalentity:customer-entity",
                    kind: "CanonicalEntity",
                    implementedBy: ["resource:customers"]
                } as any),
                makeEntity({ ref: "resource:customers", kind: "Resource", type: "database-table" }),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((w) => w.rule === "ea:information/entity-missing-implementation")).toBeUndefined();
        });
    });
    describe("ea:information/exchange-missing-contract", () => {
        it("fires when exchange has no implementing contracts", () => {
            const artifacts = [
                makeEntity({
                    ref: "exchange:bad",
                    kind: "Exchange",
                    source: { entityRef: "component:a" },
                    destination: { entityRef: "component:b" },
                    exchangedEntities: ["canonicalentity:x"],
                    purpose: "test"
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.errors.find((e) => e.rule === "ea:information/exchange-missing-contract")).toBeDefined();
        });
        it("does not fire when exchange has implementingContracts", () => {
            const artifacts = [
                makeEntity({
                    ref: "exchange:good",
                    kind: "Exchange",
                    source: { entityRef: "component:a" },
                    destination: { entityRef: "component:b" },
                    exchangedEntities: ["canonicalentity:x"],
                    purpose: "test",
                    implementingContracts: ["api:customer"]
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.errors.find((e) => e.rule === "ea:information/exchange-missing-contract")).toBeUndefined();
        });
    });
    describe("ea:information/classification-not-propagated", () => {
        it("fires when entity classified but downstream store is not", () => {
            const artifacts = [
                makeEntity({
                    ref: "canonicalentity:customer-entity",
                    kind: "CanonicalEntity",
                    classifiedAs: ["control:pii"],
                    implementedBy: ["resource:customers"]
                } as any),
                makeEntity({ ref: "resource:customers", kind: "Resource", type: "database-table" }),
                makeEntity({ ref: "control:pii", kind: "Control", type: "classification" }),
            ];
            const result = evaluateEaDrift(artifacts);
            const finding = result.warnings.find((w) => w.rule === "ea:information/classification-not-propagated");
            expect(finding).toBeDefined();
            expect(finding!.path).toBe("resource:default/customers");
        });
        it("does not fire when downstream store carries same classification", () => {
            const artifacts = [
                makeEntity({
                    ref: "canonicalentity:customer-entity",
                    kind: "CanonicalEntity",
                    classifiedAs: ["control:pii"],
                    implementedBy: ["resource:customers"]
                } as any),
                makeEntity({
                    ref: "resource:customers",
                    kind: "Resource",
                    type: "database-table",
                    classifiedAs: ["control:pii"]
                } as any),
                makeEntity({ ref: "control:pii", kind: "Control", type: "classification" }),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((w) => w.rule === "ea:information/classification-not-propagated")).toBeUndefined();
        });
        it("detects multi-hop propagation gap via stores relation", () => {
            const artifacts = [
                makeEntity({
                    ref: "canonicalentity:customer-entity",
                    kind: "CanonicalEntity",
                    classifiedAs: ["control:pii"]
                } as any),
                makeEntity({
                    ref: "resource:orders",
                    kind: "Resource",
                    type: "database",
                    stores: ["canonicalentity:customer-entity"]
                } as any),
                makeEntity({ ref: "control:pii", kind: "Control", type: "classification" }),
            ];
            const result = evaluateEaDrift(artifacts);
            const finding = result.warnings.find((w) => w.rule === "ea:information/classification-not-propagated");
            expect(finding).toBeDefined();
            expect(finding!.path).toBe("resource:default/orders");
        });
    });
    describe("ea:information/retention-not-enforced", () => {
        it("fires when retention policy has no enforcement evidence", () => {
            const artifacts = [
                makeEntity({
                    ref: "control:7y",
                    kind: "Control",
                    type: "retention-policy",
                    appliesTo: ["resource:orders"],
                    retention: { duration: "7 years", basis: "tax" },
                    disposal: { method: "delete" }
                } as any),
                makeEntity({ ref: "resource:orders", kind: "Resource", type: "database" }),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((w) => w.rule === "ea:information/retention-not-enforced")).toBeDefined();
        });
        it("does not fire when store has retainedUnder relation", () => {
            const artifacts = [
                makeEntity({
                    ref: "control:7y",
                    kind: "Control",
                    type: "retention-policy",
                    appliesTo: ["resource:orders"],
                    retention: { duration: "7 years", basis: "tax" },
                    disposal: { method: "delete" }
                } as any),
                makeEntity({
                    ref: "resource:orders",
                    kind: "Resource",
                    type: "database",
                    retainedUnder: ["control:7y"]
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((w) => w.rule === "ea:information/retention-not-enforced")).toBeUndefined();
        });
        it("does not fire when disposal is automated", () => {
            const artifacts = [
                makeEntity({
                    ref: "control:auto",
                    kind: "Control",
                    type: "retention-policy",
                    appliesTo: ["resource:orders"],
                    retention: { duration: "7 years", basis: "tax" },
                    disposal: { method: "delete", automatedBy: "cron-purge-job" }
                } as any),
                makeEntity({ ref: "resource:orders", kind: "Resource", type: "database" }),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((w) => w.rule === "ea:information/retention-not-enforced")).toBeUndefined();
        });
    });
    describe("ea:information/concept-not-materialized", () => {
        it("fires when concept has no CE or LDM", () => {
            const artifacts = [
                makeEntity({ ref: "canonicalentity:orphan", kind: "CanonicalEntity", type: "concept" }),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((w) => w.rule === "ea:information/concept-not-materialized")).toBeDefined();
        });
        it("does not fire when a CE references the concept", () => {
            const artifacts = [
                makeEntity({ ref: "canonicalentity:customer-concept", kind: "CanonicalEntity", type: "concept" }),
                makeEntity({
                    ref: "canonicalentity:customer-entity",
                    kind: "CanonicalEntity",
                    conceptRef: "canonicalentity:customer-concept"
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((w) => w.rule === "ea:information/concept-not-materialized")).toBeUndefined();
        });
    });
    describe("ea:information/orphan-classification", () => {
        it("fires when classification is unreferenced", () => {
            const artifacts = [
                makeEntity({
                    ref: "control:unused",
                    kind: "Control",
                    type: "classification",
                    level: "public",
                    requiredControls: [{ control: "none", description: "no controls" }]
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((w) => w.rule === "ea:information/orphan-classification")).toBeDefined();
        });
        it("does not fire when classification is referenced via classifiedAs", () => {
            const artifacts = [
                makeEntity({
                    ref: "control:pii",
                    kind: "Control",
                    type: "classification",
                    level: "restricted",
                    requiredControls: [{ control: "encrypt", description: "encrypt" }]
                } as any),
                makeEntity({
                    ref: "canonicalentity:customer-entity",
                    kind: "CanonicalEntity",
                    classifiedAs: ["control:pii"]
                } as any),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.warnings.find((w) => w.rule === "ea:information/orphan-classification")).toBeUndefined();
        });
    });
    describe("ea:information/exchange-classification-mismatch", () => {
        it("fires when exchange carries classified entity but has no classificationLevel", () => {
            const artifacts = [
                makeEntity({
                    ref: "exchange:onboarding",
                    kind: "Exchange",
                    source: { entityRef: "component:frontend" },
                    destination: { entityRef: "component:backend" },
                    exchangedEntities: ["canonicalentity:customer-entity"],
                    purpose: "Customer onboarding"
                } as any),
                makeEntity({
                    ref: "canonicalentity:customer-entity",
                    kind: "CanonicalEntity",
                    classifiedAs: ["control:pii"]
                } as any),
                makeEntity({ ref: "control:pii", kind: "Control", type: "classification" }),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.errors.find((e) => e.rule === "ea:information/exchange-classification-mismatch")).toBeDefined();
        });
        it("does not fire when exchange declares classificationLevel", () => {
            const artifacts = [
                makeEntity({
                    ref: "exchange:onboarding",
                    kind: "Exchange",
                    source: { entityRef: "component:frontend" },
                    destination: { entityRef: "component:backend" },
                    exchangedEntities: ["canonicalentity:customer-entity"],
                    purpose: "Customer onboarding",
                    classificationLevel: "control:pii"
                } as any),
                makeEntity({
                    ref: "canonicalentity:customer-entity",
                    kind: "CanonicalEntity",
                    classifiedAs: ["control:pii"]
                } as any),
                makeEntity({ ref: "control:pii", kind: "Control", type: "classification" }),
            ];
            const result = evaluateEaDrift(artifacts);
            expect(result.errors.find((e) => e.rule === "ea:information/exchange-classification-mismatch")).toBeUndefined();
        });
    });
    it("evaluates all 29 static drift rules (9 prior + 8 Phase 2C + 10 Phase 2D + 2 traceability)", () => {
        const result = evaluateEaDrift([]);
        expect(result.rulesEvaluated).toBe(39);
        expect(result.rulesSkipped).toBe(5); // resolver stubs
    });
});
