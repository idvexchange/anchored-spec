/**
 * Tests for Phase 2C: Information Layer Schemas, Types, Quality Rules
 *
 * Covers:
 *  - 6 information-layer kinds in EA_KIND_REGISTRY
 *  - Schema validation for all 6 kinds
 *  - 7 quality rules for information-layer artifacts
 *  - ea create templates for all 6 kinds
 *  - implementedBy relation extension (information-concept → canonical-entity)
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

  it("registers 6 information-layer kinds", () => {
    expect(infoKinds).toHaveLength(6);
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
