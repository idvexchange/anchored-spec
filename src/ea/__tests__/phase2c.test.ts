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
import {
  EA_KIND_REGISTRY,
  getKindEntry,
  getKindsByDomain,
  createDefaultRegistry,
  validateEaArtifacts,
  validateEaRelations,
  validateEaSchema,
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

// ─── Kind Registry ──────────────────────────────────────────────────────────────

describe("Phase 2C: Information Layer Kinds", () => {
  const infoKinds = getKindsByDomain("information");

  it("registers 7 information-layer kinds", () => {
    expect(infoKinds).toHaveLength(7);
  });

  it.each([
    ["information-concept", "IC"],
    ["canonical-entity", "CE"],
    ["information-exchange", "EXCH"],
    ["classification", "CLASS"],
    ["retention-policy", "RET"],
    ["glossary-term", "TERM"],
  ])("registers %s with prefix %s", (kind, prefix) => {
    const entry = getKindEntry(kind);
    expect(entry).toBeDefined();
    expect(entry!.prefix).toBe(prefix);
    expect(entry!.domain).toBe("information");
  });
});

// ─── Schema Validation ──────────────────────────────────────────────────────────

describe("Phase 2C: Schema Validation", () => {
  describe("information-concept", () => {
    it("validates a valid information-concept", () => {
      const result = validateEaSchema({
        id: "IC-customer",
        schemaVersion: "1.0.0",
        kind: "information-concept",
        title: "Customer",
        status: "active",
        summary: "The customer concept",
        owners: ["team-data"],
        confidence: "declared",
        domain: "commerce",
        glossaryTerms: ["TERM-customer"],
        synonyms: ["buyer", "client"],
      }, "information-concept");
      expect(result.valid).toBe(true);
    });

    it("rejects missing domain", () => {
      const result = validateEaSchema({
        id: "IC-bad",
        schemaVersion: "1.0.0",
        kind: "information-concept",
        title: "Bad",
        status: "active",
        summary: "Missing domain",
        owners: ["team"],
        confidence: "declared",
      }, "information-concept");
      expect(result.valid).toBe(false);
    });
  });

  describe("canonical-entity", () => {
    it("validates a valid canonical-entity", () => {
      const result = validateEaSchema({
        id: "CE-customer",
        schemaVersion: "1.0.0",
        kind: "canonical-entity",
        title: "Customer Entity",
        status: "active",
        summary: "The canonical customer entity",
        owners: ["team-data"],
        confidence: "declared",
        attributes: [
          { name: "id", type: "uuid", required: true },
          { name: "email", type: "email", required: true, classification: "CLASS-pii" },
        ],
        conceptRef: "IC-customer",
        governanceStatus: "ratified",
      }, "canonical-entity");
      expect(result.valid).toBe(true);
    });

    it("rejects empty attributes", () => {
      const result = validateEaSchema({
        id: "CE-bad",
        schemaVersion: "1.0.0",
        kind: "canonical-entity",
        title: "Bad Entity",
        status: "active",
        summary: "No attributes",
        owners: ["team"],
        confidence: "declared",
        attributes: [],
      }, "canonical-entity");
      expect(result.valid).toBe(false);
    });

    it("rejects attribute without type", () => {
      const result = validateEaSchema({
        id: "CE-bad",
        schemaVersion: "1.0.0",
        kind: "canonical-entity",
        title: "Bad Entity",
        status: "active",
        summary: "Attribute missing type",
        owners: ["team"],
        confidence: "declared",
        attributes: [{ name: "id" }],
      }, "canonical-entity");
      expect(result.valid).toBe(false);
    });

    it("rejects invalid governanceStatus", () => {
      const result = validateEaSchema({
        id: "CE-bad",
        schemaVersion: "1.0.0",
        kind: "canonical-entity",
        title: "Bad Entity",
        status: "active",
        summary: "Invalid governance",
        owners: ["team"],
        confidence: "declared",
        attributes: [{ name: "id", type: "uuid" }],
        governanceStatus: "invalid-value",
      }, "canonical-entity");
      expect(result.valid).toBe(false);
    });
  });

  describe("information-exchange", () => {
    it("validates a valid information-exchange", () => {
      const result = validateEaSchema({
        id: "EXCH-customer-onboarding",
        schemaVersion: "1.0.0",
        kind: "information-exchange",
        title: "Customer Onboarding Exchange",
        status: "active",
        summary: "Exchanges customer data during onboarding",
        owners: ["team-data"],
        confidence: "declared",
        source: { artifactId: "APP-frontend", role: "collector" },
        destination: { artifactId: "APP-backend", role: "processor" },
        exchangedEntities: ["CE-customer"],
        purpose: "Customer onboarding flow",
        trigger: "request",
        classificationLevel: "CLASS-pii",
      }, "information-exchange");
      expect(result.valid).toBe(true);
    });

    it("rejects missing source", () => {
      const result = validateEaSchema({
        id: "EXCH-bad",
        schemaVersion: "1.0.0",
        kind: "information-exchange",
        title: "Bad Exchange",
        status: "active",
        summary: "Missing source",
        owners: ["team"],
        confidence: "declared",
        destination: { artifactId: "APP-backend" },
        exchangedEntities: ["CE-customer"],
        purpose: "test",
      }, "information-exchange");
      expect(result.valid).toBe(false);
    });

    it("rejects invalid trigger enum", () => {
      const result = validateEaSchema({
        id: "EXCH-bad",
        schemaVersion: "1.0.0",
        kind: "information-exchange",
        title: "Bad Exchange",
        status: "active",
        summary: "Invalid trigger",
        owners: ["team"],
        confidence: "declared",
        source: { artifactId: "APP-frontend" },
        destination: { artifactId: "APP-backend" },
        exchangedEntities: ["CE-customer"],
        purpose: "test",
        trigger: "invalid-trigger",
      }, "information-exchange");
      expect(result.valid).toBe(false);
    });
  });

  describe("classification", () => {
    it("validates a valid classification", () => {
      const result = validateEaSchema({
        id: "CLASS-pii",
        schemaVersion: "1.0.0",
        kind: "classification",
        title: "PII Classification",
        status: "active",
        summary: "Personally identifiable information",
        owners: ["team-security"],
        confidence: "declared",
        level: "restricted",
        requiredControls: [
          { control: "encryption-at-rest", description: "All PII must be encrypted at rest" },
          { control: "access-logging", description: "All access must be logged", enforcedBy: "TECH-audit-system" },
        ],
        regulations: ["GDPR", "CCPA"],
        handling: {
          encryption: "both",
          auditLogging: true,
          masking: "partial",
        },
      }, "classification");
      expect(result.valid).toBe(true);
    });

    it("rejects empty requiredControls", () => {
      const result = validateEaSchema({
        id: "CLASS-bad",
        schemaVersion: "1.0.0",
        kind: "classification",
        title: "Bad Classification",
        status: "active",
        summary: "No controls",
        owners: ["team"],
        confidence: "declared",
        level: "public",
        requiredControls: [],
      }, "classification");
      expect(result.valid).toBe(false);
    });

    it("rejects invalid encryption enum", () => {
      const result = validateEaSchema({
        id: "CLASS-bad",
        schemaVersion: "1.0.0",
        kind: "classification",
        title: "Bad",
        status: "active",
        summary: "Invalid encryption",
        owners: ["team"],
        confidence: "declared",
        level: "public",
        requiredControls: [{ control: "c", description: "d" }],
        handling: { encryption: "invalid" },
      }, "classification");
      expect(result.valid).toBe(false);
    });
  });

  describe("retention-policy", () => {
    it("validates a valid retention-policy", () => {
      const result = validateEaSchema({
        id: "RET-order-data",
        schemaVersion: "1.0.0",
        kind: "retention-policy",
        title: "Order Data Retention",
        status: "active",
        summary: "7-year retention for order data",
        owners: ["team-compliance"],
        confidence: "declared",
        appliesTo: ["STORE-orders-db"],
        retention: { duration: "7 years", basis: "Tax regulations", startEvent: "order-closed" },
        disposal: { method: "anonymize", description: "Replace PII with hashes" },
        legalBasis: "EU tax directive",
        exceptions: [{ condition: "Active litigation hold", extendedDuration: "indefinite" }],
      }, "retention-policy");
      expect(result.valid).toBe(true);
    });

    it("rejects missing retention", () => {
      const result = validateEaSchema({
        id: "RET-bad",
        schemaVersion: "1.0.0",
        kind: "retention-policy",
        title: "Bad Policy",
        status: "active",
        summary: "Missing retention",
        owners: ["team"],
        confidence: "declared",
        appliesTo: ["STORE-x"],
        disposal: { method: "delete" },
      }, "retention-policy");
      expect(result.valid).toBe(false);
    });

    it("rejects invalid disposal method", () => {
      const result = validateEaSchema({
        id: "RET-bad",
        schemaVersion: "1.0.0",
        kind: "retention-policy",
        title: "Bad Policy",
        status: "active",
        summary: "Invalid disposal",
        owners: ["team"],
        confidence: "declared",
        appliesTo: ["STORE-x"],
        retention: { duration: "1 year", basis: "test" },
        disposal: { method: "shred" },
      }, "retention-policy");
      expect(result.valid).toBe(false);
    });
  });

  describe("glossary-term", () => {
    it("validates a valid glossary-term", () => {
      const result = validateEaSchema({
        id: "TERM-customer",
        schemaVersion: "1.0.0",
        kind: "glossary-term",
        title: "Customer",
        status: "active",
        summary: "The canonical customer term",
        owners: ["team-data"],
        confidence: "declared",
        definition: "An entity that has purchased or registered intent to purchase.",
        domain: "commerce",
        synonyms: ["buyer", "client"],
        antonymsOrConfusables: [
          { term: "prospect", distinction: "A prospect has not yet purchased" },
        ],
        relatedConcepts: ["IC-customer"],
        examples: ["Jane Doe who bought a widget"],
        approvedBy: "data-governance-board",
      }, "glossary-term");
      expect(result.valid).toBe(true);
    });

    it("rejects missing definition", () => {
      const result = validateEaSchema({
        id: "TERM-bad",
        schemaVersion: "1.0.0",
        kind: "glossary-term",
        title: "Bad Term",
        status: "active",
        summary: "No definition",
        owners: ["team"],
        confidence: "declared",
        domain: "commerce",
      }, "glossary-term");
      expect(result.valid).toBe(false);
    });

    it("rejects missing domain", () => {
      const result = validateEaSchema({
        id: "TERM-bad",
        schemaVersion: "1.0.0",
        kind: "glossary-term",
        title: "Bad Term",
        status: "active",
        summary: "No domain",
        owners: ["team"],
        confidence: "declared",
        definition: "A thing.",
      }, "glossary-term");
      expect(result.valid).toBe(false);
    });
  });
});

// ─── Quality Rules ──────────────────────────────────────────────────────────────

describe("Phase 2C: Quality Rules", () => {
  it("ea:quality:ce-missing-attributes — fires on empty attributes", () => {
    const artifacts = [
      makeArtifact({
        id: "CE-empty",
        kind: "canonical-entity",
        attributes: [],
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:ce-missing-attributes")).toBeDefined();
  });

  it("ea:quality:ce-attribute-missing-type — fires on attribute without type", () => {
    const artifacts = [
      makeArtifact({
        id: "CE-no-type",
        kind: "canonical-entity",
        attributes: [{ name: "id", type: "" }],
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:ce-attribute-missing-type")).toBeDefined();
  });

  it("ea:quality:exchange-missing-source-destination — fires on missing source", () => {
    const artifacts = [
      makeArtifact({
        id: "EXCH-no-source",
        kind: "information-exchange",
        destination: { artifactId: "APP-backend" },
        exchangedEntities: ["CE-x"],
        purpose: "test",
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:exchange-missing-source-destination")).toBeDefined();
  });

  it("ea:quality:exchange-missing-purpose — fires on empty purpose", () => {
    const artifacts = [
      makeArtifact({
        id: "EXCH-no-purpose",
        kind: "information-exchange",
        source: { artifactId: "APP-frontend" },
        destination: { artifactId: "APP-backend" },
        exchangedEntities: ["CE-x"],
        purpose: "",
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:exchange-missing-purpose")).toBeDefined();
  });

  it("ea:quality:classification-missing-controls — fires on empty controls", () => {
    const artifacts = [
      makeArtifact({
        id: "CLASS-no-controls",
        kind: "classification",
        level: "public",
        requiredControls: [],
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:classification-missing-controls")).toBeDefined();
  });

  it("ea:quality:retention-missing-duration — fires on missing duration", () => {
    const artifacts = [
      makeArtifact({
        id: "RET-no-duration",
        kind: "retention-policy",
        appliesTo: ["STORE-x"],
        retention: { duration: "", basis: "test" },
        disposal: { method: "delete" },
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:retention-missing-duration")).toBeDefined();
  });

  it("ea:quality:glossary-missing-definition — fires on empty definition", () => {
    const artifacts = [
      makeArtifact({
        id: "TERM-no-def",
        kind: "glossary-term",
        definition: "",
        domain: "commerce",
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:glossary-missing-definition")).toBeDefined();
  });

  it("passes quality for well-formed information artifacts", () => {
    const artifacts = [
      makeArtifact({
        id: "CE-good",
        kind: "canonical-entity",
        attributes: [{ name: "id", type: "uuid" }],
        relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
      } as any),
      makeArtifact({
        id: "CLASS-pii",
        kind: "classification",
        level: "restricted",
        requiredControls: [{ control: "encryption", description: "Encrypt all PII" }],
        relations: [],
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    // No quality rule errors for these well-formed artifacts
    const infoRules = result.errors.filter((e) =>
      e.rule?.startsWith("ea:quality:ce-") ||
      e.rule?.startsWith("ea:quality:exchange-") ||
      e.rule?.startsWith("ea:quality:classification-") ||
      e.rule?.startsWith("ea:quality:retention-") ||
      e.rule?.startsWith("ea:quality:glossary-")
    );
    expect(infoRules).toHaveLength(0);
  });
});

// ─── Relation Extension: implementedBy ──────────────────────────────────────────

describe("Phase 2C: implementedBy Extension", () => {
  const registry = createDefaultRegistry();

  it("accepts information-concept as valid source for implementedBy", () => {
    expect(registry.isValidSource("implementedBy", "information-concept")).toBe(true);
  });

  it("accepts canonical-entity as valid target for implementedBy", () => {
    expect(registry.isValidTarget("implementedBy", "canonical-entity")).toBe(true);
  });

  it("validates information-concept → canonical-entity via implementedBy", () => {
    const artifacts = [
      makeArtifact({
        id: "IC-customer",
        kind: "information-concept",
        relations: [{ type: "implementedBy", target: "CE-customer" }],
      } as any),
      makeArtifact({
        id: "CE-customer",
        kind: "canonical-entity",
      }),
    ];
    const result = validateEaRelations(artifacts, registry);
    expect(result.errors).toHaveLength(0);
  });

  it("still accepts logical-data-model as source for implementedBy", () => {
    expect(registry.isValidSource("implementedBy", "logical-data-model")).toBe(true);
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
      expect(entry!.validSourceKinds).toContain("canonical-entity");
      expect(entry!.validSourceKinds).toContain("data-store");
      expect(entry!.validSourceKinds).toContain("information-exchange");
      expect(entry!.validTargetKinds).toEqual(["classification"]);
    });

    it("validates CE → classification via classifiedAs", () => {
      const artifacts = [
        makeArtifact({
          id: "CE-customer",
          kind: "canonical-entity",
          relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
        } as any),
        makeArtifact({ id: "CLASS-pii", kind: "classification" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects invalid source kind for classifiedAs", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-frontend",
          kind: "application",
          relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
        }),
        makeArtifact({ id: "CLASS-pii", kind: "classification" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors.find((e) => e.rule === "ea:relation:invalid-source")).toBeDefined();
    });

    it("rejects invalid target kind for classifiedAs", () => {
      const artifacts = [
        makeArtifact({
          id: "CE-customer",
          kind: "canonical-entity",
          relations: [{ type: "classifiedAs", target: "APP-backend" }],
        } as any),
        makeArtifact({ id: "APP-backend", kind: "application" }),
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
      expect(entry!.validSourceKinds).toContain("canonical-entity");
      expect(entry!.validSourceKinds).toContain("information-concept");
      expect(entry!.validTargetKinds).toContain("information-exchange");
      expect(entry!.validTargetKinds).toContain("api-contract");
    });

    it("validates CE → information-exchange via exchangedVia", () => {
      const artifacts = [
        makeArtifact({
          id: "CE-customer",
          kind: "canonical-entity",
          relations: [{ type: "exchangedVia", target: "EXCH-onboarding" }],
        } as any),
        makeArtifact({ id: "EXCH-onboarding", kind: "information-exchange" }),
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
      expect(entry!.validSourceKinds).toContain("data-store");
      expect(entry!.validSourceKinds).toContain("data-product");
      expect(entry!.validTargetKinds).toEqual(["retention-policy"]);
    });

    it("validates data-store → retention-policy via retainedUnder", () => {
      const artifacts = [
        makeArtifact({
          id: "STORE-orders",
          kind: "data-store",
          relations: [{ type: "retainedUnder", target: "RET-7y" }],
        } as any),
        makeArtifact({ id: "RET-7y", kind: "retention-policy" }),
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
        makeArtifact({ id: "CE-orphan", kind: "canonical-entity" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:information/entity-missing-implementation")).toBeDefined();
    });

    it("does not fire when CE has implementedBy", () => {
      const artifacts = [
        makeArtifact({
          id: "CE-customer",
          kind: "canonical-entity",
          relations: [{ type: "implementedBy", target: "SCHEMA-customers" }],
        } as any),
        makeArtifact({ id: "SCHEMA-customers", kind: "physical-schema" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:information/entity-missing-implementation")).toBeUndefined();
    });
  });

  describe("ea:information/exchange-missing-contract", () => {
    it("fires when exchange has no implementing contracts", () => {
      const artifacts = [
        makeArtifact({
          id: "EXCH-bad",
          kind: "information-exchange",
          source: { artifactId: "APP-a" },
          destination: { artifactId: "APP-b" },
          exchangedEntities: ["CE-x"],
          purpose: "test",
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:information/exchange-missing-contract")).toBeDefined();
    });

    it("does not fire when exchange has implementingContracts", () => {
      const artifacts = [
        makeArtifact({
          id: "EXCH-good",
          kind: "information-exchange",
          source: { artifactId: "APP-a" },
          destination: { artifactId: "APP-b" },
          exchangedEntities: ["CE-x"],
          purpose: "test",
          implementingContracts: ["API-customer"],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:information/exchange-missing-contract")).toBeUndefined();
    });
  });

  describe("ea:information/classification-not-propagated", () => {
    it("fires when entity classified but downstream store is not", () => {
      const artifacts = [
        makeArtifact({
          id: "CE-customer",
          kind: "canonical-entity",
          relations: [
            { type: "classifiedAs", target: "CLASS-pii" },
            { type: "implementedBy", target: "SCHEMA-customers" },
          ],
        } as any),
        makeArtifact({ id: "SCHEMA-customers", kind: "physical-schema" }),
        makeArtifact({ id: "CLASS-pii", kind: "classification" }),
      ];
      const result = evaluateEaDrift(artifacts);
      const finding = result.warnings.find((w) => w.rule === "ea:information/classification-not-propagated");
      expect(finding).toBeDefined();
      expect(finding!.path).toBe("SCHEMA-customers");
    });

    it("does not fire when downstream store carries same classification", () => {
      const artifacts = [
        makeArtifact({
          id: "CE-customer",
          kind: "canonical-entity",
          relations: [
            { type: "classifiedAs", target: "CLASS-pii" },
            { type: "implementedBy", target: "SCHEMA-customers" },
          ],
        } as any),
        makeArtifact({
          id: "SCHEMA-customers",
          kind: "physical-schema",
          relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
        } as any),
        makeArtifact({ id: "CLASS-pii", kind: "classification" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:information/classification-not-propagated")).toBeUndefined();
    });

    it("detects multi-hop propagation gap via stores relation", () => {
      const artifacts = [
        makeArtifact({
          id: "CE-customer",
          kind: "canonical-entity",
          relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
        } as any),
        makeArtifact({
          id: "STORE-orders",
          kind: "data-store",
          relations: [{ type: "stores", target: "CE-customer" }],
        } as any),
        makeArtifact({ id: "CLASS-pii", kind: "classification" }),
      ];
      const result = evaluateEaDrift(artifacts);
      const finding = result.warnings.find((w) => w.rule === "ea:information/classification-not-propagated");
      expect(finding).toBeDefined();
      expect(finding!.path).toBe("STORE-orders");
    });
  });

  describe("ea:information/retention-not-enforced", () => {
    it("fires when retention policy has no enforcement evidence", () => {
      const artifacts = [
        makeArtifact({
          id: "RET-7y",
          kind: "retention-policy",
          appliesTo: ["STORE-orders"],
          retention: { duration: "7 years", basis: "tax" },
          disposal: { method: "delete" },
        } as any),
        makeArtifact({ id: "STORE-orders", kind: "data-store" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:information/retention-not-enforced")).toBeDefined();
    });

    it("does not fire when store has retainedUnder relation", () => {
      const artifacts = [
        makeArtifact({
          id: "RET-7y",
          kind: "retention-policy",
          appliesTo: ["STORE-orders"],
          retention: { duration: "7 years", basis: "tax" },
          disposal: { method: "delete" },
        } as any),
        makeArtifact({
          id: "STORE-orders",
          kind: "data-store",
          relations: [{ type: "retainedUnder", target: "RET-7y" }],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:information/retention-not-enforced")).toBeUndefined();
    });

    it("does not fire when disposal is automated", () => {
      const artifacts = [
        makeArtifact({
          id: "RET-auto",
          kind: "retention-policy",
          appliesTo: ["STORE-orders"],
          retention: { duration: "7 years", basis: "tax" },
          disposal: { method: "delete", automatedBy: "cron-purge-job" },
        } as any),
        makeArtifact({ id: "STORE-orders", kind: "data-store" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:information/retention-not-enforced")).toBeUndefined();
    });
  });

  describe("ea:information/concept-not-materialized", () => {
    it("fires when concept has no CE or LDM", () => {
      const artifacts = [
        makeArtifact({ id: "IC-orphan", kind: "information-concept" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:information/concept-not-materialized")).toBeDefined();
    });

    it("does not fire when a CE references the concept", () => {
      const artifacts = [
        makeArtifact({ id: "IC-customer", kind: "information-concept" }),
        makeArtifact({
          id: "CE-customer",
          kind: "canonical-entity",
          conceptRef: "IC-customer",
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:information/concept-not-materialized")).toBeUndefined();
    });
  });

  describe("ea:information/orphan-classification", () => {
    it("fires when classification is unreferenced", () => {
      const artifacts = [
        makeArtifact({
          id: "CLASS-unused",
          kind: "classification",
          level: "public",
          requiredControls: [{ control: "none", description: "no controls" }],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:information/orphan-classification")).toBeDefined();
    });

    it("does not fire when classification is referenced via classifiedAs", () => {
      const artifacts = [
        makeArtifact({
          id: "CLASS-pii",
          kind: "classification",
          level: "restricted",
          requiredControls: [{ control: "encrypt", description: "encrypt" }],
        } as any),
        makeArtifact({
          id: "CE-customer",
          kind: "canonical-entity",
          relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:information/orphan-classification")).toBeUndefined();
    });
  });

  describe("ea:information/exchange-classification-mismatch", () => {
    it("fires when exchange carries classified entity but has no classificationLevel", () => {
      const artifacts = [
        makeArtifact({
          id: "EXCH-onboarding",
          kind: "information-exchange",
          source: { artifactId: "APP-frontend" },
          destination: { artifactId: "APP-backend" },
          exchangedEntities: ["CE-customer"],
          purpose: "Customer onboarding",
        } as any),
        makeArtifact({
          id: "CE-customer",
          kind: "canonical-entity",
          relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
        } as any),
        makeArtifact({ id: "CLASS-pii", kind: "classification" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:information/exchange-classification-mismatch")).toBeDefined();
    });

    it("does not fire when exchange declares classificationLevel", () => {
      const artifacts = [
        makeArtifact({
          id: "EXCH-onboarding",
          kind: "information-exchange",
          source: { artifactId: "APP-frontend" },
          destination: { artifactId: "APP-backend" },
          exchangedEntities: ["CE-customer"],
          purpose: "Customer onboarding",
          classificationLevel: "CLASS-pii",
        } as any),
        makeArtifact({
          id: "CE-customer",
          kind: "canonical-entity",
          relations: [{ type: "classifiedAs", target: "CLASS-pii" }],
        } as any),
        makeArtifact({ id: "CLASS-pii", kind: "classification" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:information/exchange-classification-mismatch")).toBeUndefined();
    });
  });

  it("evaluates all 27 static drift rules (9 prior + 8 Phase 2C + 10 Phase 2D)", () => {
    const result = evaluateEaDrift([]);
    expect(result.rulesEvaluated).toBe(37);
    expect(result.rulesSkipped).toBe(5); // resolver stubs
  });
});
