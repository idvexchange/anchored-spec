import { describe, it, expect } from "vitest";
import {
  ENTITY_DESCRIPTOR_REGISTRY,
  getSchemaDescriptor,
  getEntityDescriptorForEntity,
  getEntityDescriptorsForKind,
  isSchemaRegistered,
  isEntityKindRegistered,
  getAllEntityKinds,
  getBuiltinEntityDescriptors,
  getCustomEntityDescriptors,
} from "../kind-mapping.js";
import { BACKSTAGE_API_VERSION, ANCHORED_SPEC_API_VERSION } from "../types.js";

// ─── Registry Coverage ──────────────────────────────────────────────────────────

describe("ENTITY_DESCRIPTOR_REGISTRY", () => {
  it("contains the full 48-kind descriptor set", () => {
    expect(ENTITY_DESCRIPTOR_REGISTRY).toHaveLength(48);
  });

  it("carries domain metadata for every mapping", () => {
    for (const entry of ENTITY_DESCRIPTOR_REGISTRY) {
      expect(entry.domain).toBeTruthy();
    }
  });

  it("has no duplicate schema names", () => {
    const seen = new Set<string>();
    for (const entry of ENTITY_DESCRIPTOR_REGISTRY) {
      expect(seen.has(entry.schema)).toBe(false);
      seen.add(entry.schema);
    }
  });

  it("all entries have valid apiVersion", () => {
    for (const entry of ENTITY_DESCRIPTOR_REGISTRY) {
      expect([BACKSTAGE_API_VERSION, ANCHORED_SPEC_API_VERSION]).toContain(entry.apiVersion);
    }
  });

  it("all entries have non-empty description", () => {
    for (const entry of ENTITY_DESCRIPTOR_REGISTRY) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});

// ─── Tier 1: Backstage Built-in Mappings ────────────────────────────────────────

describe("Tier 1 — Backstage built-in kind mappings", () => {
  const builtinMappings: Array<[string, string, string, string?]> = [
    // [schemaName, expectedBackstageKind, expectedApiVersion, expectedSpecType?]
    ["service", "Component", BACKSTAGE_API_VERSION, "service"],
    ["application", "Component", BACKSTAGE_API_VERSION, "website"],
    ["consumer", "Component", BACKSTAGE_API_VERSION, "service"],
    ["platform", "Component", BACKSTAGE_API_VERSION, "service"],
    ["api-contract", "API", BACKSTAGE_API_VERSION, "openapi"],
    ["event-contract", "API", BACKSTAGE_API_VERSION, "asyncapi"],
    ["cloud-resource", "Resource", BACKSTAGE_API_VERSION, "cloud-resource"],
    ["physical-schema", "Resource", BACKSTAGE_API_VERSION, "database-table"],
    ["data-store", "Resource", BACKSTAGE_API_VERSION, "database"],
    ["data-product", "Resource", BACKSTAGE_API_VERSION, "data-product"],
    ["runtime-cluster", "Resource", BACKSTAGE_API_VERSION, "cluster"],
    ["network-zone", "Resource", BACKSTAGE_API_VERSION, "network-zone"],
    ["deployment", "Resource", BACKSTAGE_API_VERSION, "deployment"],
    ["environment", "Resource", BACKSTAGE_API_VERSION, "environment"],
    ["org-unit", "Group", BACKSTAGE_API_VERSION, "team"],
  ];

  for (const [schemaName, expected, apiVer, specType] of builtinMappings) {
    it(`maps "${schemaName}" → ${expected} (${specType ?? "no type"})`, () => {
      const mapping = getSchemaDescriptor(schemaName);
      expect(mapping).toBeDefined();
      expect(mapping!.kind).toBe(expected);
      expect(mapping!.apiVersion).toBe(apiVer);
      if (specType) {
        expect(mapping!.specType).toBe(specType);
      }
    });
  }
});

// ─── Tier 2: Custom EA Kind Mappings ────────────────────────────────────────────

describe("Tier 2 — Custom EA kind mappings", () => {
  const customMappings: Array<[string, string, string?]> = [
    ["requirement", "Requirement", "functional"],
    ["security-requirement", "Requirement", "security"],
    ["data-requirement", "Requirement", "data"],
    ["technical-requirement", "Requirement", "technical"],
    ["information-requirement", "Requirement", "information"],
    ["decision", "Decision", undefined],
    ["change", "Decision", "change-record"],
    ["canonical-entity", "CanonicalEntity", undefined],
    ["information-concept", "CanonicalEntity", "concept"],
    ["glossary-term", "CanonicalEntity", "glossary-term"],
    ["master-data-domain", "CanonicalEntity", "master-data-domain"],
    ["information-exchange", "Exchange", undefined],
    ["integration", "Exchange", "integration"],
    ["capability", "Capability", undefined],
    ["value-stream", "ValueStream", undefined],
    ["process", "ValueStream", "process"],
    ["mission", "Mission", undefined],
    ["policy-objective", "Mission", "policy-objective"],
    ["technology-standard", "Technology", undefined],
    ["system-interface", "SystemInterface", undefined],
    ["identity-boundary", "SystemInterface", "identity-boundary"],
    ["control", "Control", undefined],
    ["classification", "Control", "classification"],
    ["retention-policy", "Control", "retention-policy"],
    ["data-quality-rule", "Control", "data-quality-rule"],
    ["transition-plan", "TransitionPlan", undefined],
    ["migration-wave", "TransitionPlan", "migration-wave"],
    ["baseline", "TransitionPlan", "baseline"],
    ["target", "TransitionPlan", "target"],
    ["exception", "Exception", undefined],
    ["logical-data-model", "CanonicalEntity", "logical-data-model"],
    ["lineage", "Exchange", "data-lineage"],
    ["business-service", "Capability", "business-service"],
  ];

  for (const [schemaName, expected, specType] of customMappings) {
    it(`maps "${schemaName}" → ${expected} (${specType ?? "default"})`, () => {
      const mapping = getSchemaDescriptor(schemaName);
      expect(mapping).toBeDefined();
      expect(mapping!.kind).toBe(expected);
      expect(mapping!.apiVersion).toBe(ANCHORED_SPEC_API_VERSION);
      if (specType) {
        expect(mapping!.specType).toBe(specType);
      }
    });
  }
});

// ─── Lookup Helpers ─────────────────────────────────────────────────────────────

describe("getSchemaDescriptor", () => {
  it("returns entry for known kind", () => {
    const entry = getSchemaDescriptor("service");
    expect(entry).toBeDefined();
    expect(entry!.kind).toBe("Component");
  });

  it("returns undefined for unknown kind", () => {
    expect(getSchemaDescriptor("nonexistent")).toBeUndefined();
  });
});

describe("getEntityDescriptorForEntity (reverse lookup)", () => {
  it("resolves Component + service → service", () => {
    const entry = getEntityDescriptorForEntity(BACKSTAGE_API_VERSION, "Component", "service");
    expect(entry).toBeDefined();
    expect(entry!.schema).toBe("service");
  });

  it("resolves Component + website → application", () => {
    const entry = getEntityDescriptorForEntity(BACKSTAGE_API_VERSION, "Component", "website");
    expect(entry).toBeDefined();
    expect(entry!.schema).toBe("application");
  });

  it("resolves API + asyncapi → event-contract", () => {
    const entry = getEntityDescriptorForEntity(BACKSTAGE_API_VERSION, "API", "asyncapi");
    expect(entry).toBeDefined();
    expect(entry!.schema).toBe("event-contract");
  });

  it("resolves Requirement + security → security-requirement", () => {
    const entry = getEntityDescriptorForEntity(ANCHORED_SPEC_API_VERSION, "Requirement", "security");
    expect(entry).toBeDefined();
    expect(entry!.schema).toBe("security-requirement");
  });

  it("resolves Requirement without type → requirement (default)", () => {
    const entry = getEntityDescriptorForEntity(ANCHORED_SPEC_API_VERSION, "Requirement");
    expect(entry).toBeDefined();
    expect(entry!.schema).toBe("requirement");
  });

  it("resolves Decision without type → decision (default)", () => {
    const entry = getEntityDescriptorForEntity(ANCHORED_SPEC_API_VERSION, "Decision");
    expect(entry).toBeDefined();
    expect(entry!.schema).toBe("decision");
  });

  it("returns undefined for unknown kind", () => {
    expect(getEntityDescriptorForEntity(BACKSTAGE_API_VERSION, "FooBar")).toBeUndefined();
  });

  it("returns undefined for wrong apiVersion", () => {
    // Requirement is custom, not backstage built-in
    expect(getEntityDescriptorForEntity(BACKSTAGE_API_VERSION, "Requirement")).toBeUndefined();
  });
});

describe("getEntityDescriptorsForKind", () => {
  it("returns multiple entries for Component", () => {
    const entries = getEntityDescriptorsForKind("Component");
    expect(entries.length).toBeGreaterThanOrEqual(3);
    const kinds = entries.map((e) => e.schema);
    expect(kinds).toContain("service");
    expect(kinds).toContain("application");
    expect(kinds).toContain("consumer");
  });

  it("returns all requirement subtypes for Requirement", () => {
    const entries = getEntityDescriptorsForKind("Requirement");
    expect(entries.length).toBe(5);
    const kinds = entries.map((e) => e.schema);
    expect(kinds).toContain("requirement");
    expect(kinds).toContain("security-requirement");
    expect(kinds).toContain("data-requirement");
  });

  it("returns empty array for unknown kind", () => {
    expect(getEntityDescriptorsForKind("FooBar")).toEqual([]);
  });
});

describe("isSchemaRegistered", () => {
  it("returns true for known kinds", () => {
    expect(isSchemaRegistered("service")).toBe(true);
    expect(isSchemaRegistered("requirement")).toBe(true);
    expect(isSchemaRegistered("decision")).toBe(true);
  });

  it("returns false for unknown kinds", () => {
    expect(isSchemaRegistered("nonexistent")).toBe(false);
  });
});

describe("isEntityKindRegistered", () => {
  it("returns true for Component", () => {
    expect(isEntityKindRegistered("Component")).toBe(true);
  });

  it("returns true for Requirement", () => {
    expect(isEntityKindRegistered("Requirement")).toBe(true);
  });

  it("returns false for unknown", () => {
    expect(isEntityKindRegistered("FooBar")).toBe(false);
  });
});

describe("getAllEntityKinds", () => {
  it("returns unique kind names", () => {
    const kinds = getAllEntityKinds();
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("includes both built-in and custom kinds", () => {
    const kinds = getAllEntityKinds();
    expect(kinds).toContain("Component");
    expect(kinds).toContain("API");
    expect(kinds).toContain("Requirement");
    expect(kinds).toContain("Decision");
  });

  it("has approximately 16 unique kinds", () => {
    const kinds = getAllEntityKinds();
    expect(kinds.length).toBeGreaterThanOrEqual(14);
    expect(kinds.length).toBeLessThanOrEqual(20);
  });
});

describe("getBuiltinEntityDescriptors / getCustomEntityDescriptors", () => {
  it("splits by apiVersion correctly", () => {
    const builtins = getBuiltinEntityDescriptors();
    const customs = getCustomEntityDescriptors();

    expect(builtins.every((e) => e.apiVersion === BACKSTAGE_API_VERSION)).toBe(true);
    expect(customs.every((e) => e.apiVersion === ANCHORED_SPEC_API_VERSION)).toBe(true);
    expect(builtins.length + customs.length).toBe(ENTITY_DESCRIPTOR_REGISTRY.length);
  });
});
