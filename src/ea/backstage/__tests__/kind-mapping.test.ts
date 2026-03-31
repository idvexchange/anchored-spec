import { describe, it, expect } from "vitest";
import {
  BACKSTAGE_KIND_REGISTRY,
  mapLegacyKind,
  mapLegacyPrefix,
  mapBackstageKind,
  getLegacyKindsForBackstageKind,
  isLegacyKindRegistered,
  isBackstageKindRegistered,
  getAllBackstageKinds,
  getBuiltinKinds,
  getCustomKinds,
  legacyIdToEntityName,
  entityNameToLegacyId,
} from "../kind-mapping.js";
import { BACKSTAGE_API_VERSION, ANCHORED_SPEC_API_VERSION } from "../types.js";
import { EA_KIND_REGISTRY } from "../../types.js";

// ─── Registry Coverage ──────────────────────────────────────────────────────────

describe("BACKSTAGE_KIND_REGISTRY", () => {
  it("covers all 48 legacy kinds from EA_KIND_REGISTRY", () => {
    const legacyKinds = EA_KIND_REGISTRY.map((e) => e.kind);
    const mappedKinds = BACKSTAGE_KIND_REGISTRY.map((e) => e.legacyKind);

    for (const kind of legacyKinds) {
      expect(mappedKinds).toContain(kind);
    }
  });

  it("covers all legacy prefixes from EA_KIND_REGISTRY", () => {
    const legacyPrefixes = EA_KIND_REGISTRY.map((e) => e.prefix);
    const mappedPrefixes = BACKSTAGE_KIND_REGISTRY.map((e) => e.legacyPrefix);

    for (const prefix of legacyPrefixes) {
      expect(mappedPrefixes).toContain(prefix);
    }
  });

  it("has no duplicate legacy kinds", () => {
    const seen = new Set<string>();
    for (const entry of BACKSTAGE_KIND_REGISTRY) {
      expect(seen.has(entry.legacyKind)).toBe(false);
      seen.add(entry.legacyKind);
    }
  });

  it("has no duplicate legacy prefixes", () => {
    const seen = new Set<string>();
    for (const entry of BACKSTAGE_KIND_REGISTRY) {
      expect(seen.has(entry.legacyPrefix)).toBe(false);
      seen.add(entry.legacyPrefix);
    }
  });

  it("all entries have valid apiVersion", () => {
    for (const entry of BACKSTAGE_KIND_REGISTRY) {
      expect([BACKSTAGE_API_VERSION, ANCHORED_SPEC_API_VERSION]).toContain(entry.apiVersion);
    }
  });

  it("all entries have non-empty description", () => {
    for (const entry of BACKSTAGE_KIND_REGISTRY) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});

// ─── Tier 1: Backstage Built-in Mappings ────────────────────────────────────────

describe("Tier 1 — Backstage built-in kind mappings", () => {
  const builtinMappings: Array<[string, string, string, string?]> = [
    // [legacyKind, expectedBackstageKind, expectedApiVersion, expectedSpecType?]
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

  for (const [legacy, expected, apiVer, specType] of builtinMappings) {
    it(`maps "${legacy}" → ${expected} (${specType ?? "no type"})`, () => {
      const mapping = mapLegacyKind(legacy);
      expect(mapping).toBeDefined();
      expect(mapping!.backstageKind).toBe(expected);
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

  for (const [legacy, expected, specType] of customMappings) {
    it(`maps "${legacy}" → ${expected} (${specType ?? "default"})`, () => {
      const mapping = mapLegacyKind(legacy);
      expect(mapping).toBeDefined();
      expect(mapping!.backstageKind).toBe(expected);
      expect(mapping!.apiVersion).toBe(ANCHORED_SPEC_API_VERSION);
      if (specType) {
        expect(mapping!.specType).toBe(specType);
      }
    });
  }
});

// ─── Lookup Helpers ─────────────────────────────────────────────────────────────

describe("mapLegacyKind", () => {
  it("returns entry for known kind", () => {
    const entry = mapLegacyKind("service");
    expect(entry).toBeDefined();
    expect(entry!.backstageKind).toBe("Component");
  });

  it("returns undefined for unknown kind", () => {
    expect(mapLegacyKind("nonexistent")).toBeUndefined();
  });
});

describe("mapLegacyPrefix", () => {
  it("maps SVC → Component", () => {
    const entry = mapLegacyPrefix("SVC");
    expect(entry).toBeDefined();
    expect(entry!.backstageKind).toBe("Component");
  });

  it("maps API → API", () => {
    const entry = mapLegacyPrefix("API");
    expect(entry).toBeDefined();
    expect(entry!.backstageKind).toBe("API");
  });

  it("maps REQ → Requirement", () => {
    const entry = mapLegacyPrefix("REQ");
    expect(entry).toBeDefined();
    expect(entry!.backstageKind).toBe("Requirement");
  });

  it("returns undefined for unknown prefix", () => {
    expect(mapLegacyPrefix("XXX")).toBeUndefined();
  });
});

describe("mapBackstageKind (reverse lookup)", () => {
  it("resolves Component + service → service", () => {
    const entry = mapBackstageKind(BACKSTAGE_API_VERSION, "Component", "service");
    expect(entry).toBeDefined();
    expect(entry!.legacyKind).toBe("service");
  });

  it("resolves Component + website → application", () => {
    const entry = mapBackstageKind(BACKSTAGE_API_VERSION, "Component", "website");
    expect(entry).toBeDefined();
    expect(entry!.legacyKind).toBe("application");
  });

  it("resolves API + asyncapi → event-contract", () => {
    const entry = mapBackstageKind(BACKSTAGE_API_VERSION, "API", "asyncapi");
    expect(entry).toBeDefined();
    expect(entry!.legacyKind).toBe("event-contract");
  });

  it("resolves Requirement + security → security-requirement", () => {
    const entry = mapBackstageKind(ANCHORED_SPEC_API_VERSION, "Requirement", "security");
    expect(entry).toBeDefined();
    expect(entry!.legacyKind).toBe("security-requirement");
  });

  it("resolves Requirement without type → requirement (default)", () => {
    const entry = mapBackstageKind(ANCHORED_SPEC_API_VERSION, "Requirement");
    expect(entry).toBeDefined();
    expect(entry!.legacyKind).toBe("requirement");
  });

  it("resolves Decision without type → decision (default)", () => {
    const entry = mapBackstageKind(ANCHORED_SPEC_API_VERSION, "Decision");
    expect(entry).toBeDefined();
    expect(entry!.legacyKind).toBe("decision");
  });

  it("returns undefined for unknown kind", () => {
    expect(mapBackstageKind(BACKSTAGE_API_VERSION, "FooBar")).toBeUndefined();
  });

  it("returns undefined for wrong apiVersion", () => {
    // Requirement is custom, not backstage built-in
    expect(mapBackstageKind(BACKSTAGE_API_VERSION, "Requirement")).toBeUndefined();
  });
});

describe("getLegacyKindsForBackstageKind", () => {
  it("returns multiple entries for Component", () => {
    const entries = getLegacyKindsForBackstageKind("Component");
    expect(entries.length).toBeGreaterThanOrEqual(3);
    const kinds = entries.map((e) => e.legacyKind);
    expect(kinds).toContain("service");
    expect(kinds).toContain("application");
    expect(kinds).toContain("consumer");
  });

  it("returns all requirement subtypes for Requirement", () => {
    const entries = getLegacyKindsForBackstageKind("Requirement");
    expect(entries.length).toBe(5);
    const kinds = entries.map((e) => e.legacyKind);
    expect(kinds).toContain("requirement");
    expect(kinds).toContain("security-requirement");
    expect(kinds).toContain("data-requirement");
  });

  it("returns empty array for unknown kind", () => {
    expect(getLegacyKindsForBackstageKind("FooBar")).toEqual([]);
  });
});

describe("isLegacyKindRegistered", () => {
  it("returns true for known kinds", () => {
    expect(isLegacyKindRegistered("service")).toBe(true);
    expect(isLegacyKindRegistered("requirement")).toBe(true);
    expect(isLegacyKindRegistered("decision")).toBe(true);
  });

  it("returns false for unknown kinds", () => {
    expect(isLegacyKindRegistered("nonexistent")).toBe(false);
  });
});

describe("isBackstageKindRegistered", () => {
  it("returns true for Component", () => {
    expect(isBackstageKindRegistered("Component")).toBe(true);
  });

  it("returns true for Requirement", () => {
    expect(isBackstageKindRegistered("Requirement")).toBe(true);
  });

  it("returns false for unknown", () => {
    expect(isBackstageKindRegistered("FooBar")).toBe(false);
  });
});

describe("getAllBackstageKinds", () => {
  it("returns unique kind names", () => {
    const kinds = getAllBackstageKinds();
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("includes both built-in and custom kinds", () => {
    const kinds = getAllBackstageKinds();
    expect(kinds).toContain("Component");
    expect(kinds).toContain("API");
    expect(kinds).toContain("Requirement");
    expect(kinds).toContain("Decision");
  });

  it("has approximately 16 unique kinds", () => {
    const kinds = getAllBackstageKinds();
    expect(kinds.length).toBeGreaterThanOrEqual(14);
    expect(kinds.length).toBeLessThanOrEqual(20);
  });
});

describe("getBuiltinKinds / getCustomKinds", () => {
  it("splits by apiVersion correctly", () => {
    const builtins = getBuiltinKinds();
    const customs = getCustomKinds();

    expect(builtins.every((e) => e.apiVersion === BACKSTAGE_API_VERSION)).toBe(true);
    expect(customs.every((e) => e.apiVersion === ANCHORED_SPEC_API_VERSION)).toBe(true);
    expect(builtins.length + customs.length).toBe(BACKSTAGE_KIND_REGISTRY.length);
  });
});

// ─── ID Conversion ──────────────────────────────────────────────────────────────

describe("legacyIdToEntityName", () => {
  it("strips known prefix", () => {
    expect(legacyIdToEntityName("SVC-verifier-core")).toBe("verifier-core");
  });

  it("strips domain-qualified prefix", () => {
    expect(legacyIdToEntityName("systems/SVC-verifier-core")).toBe("verifier-core");
  });

  it("strips API prefix", () => {
    expect(legacyIdToEntityName("API-rest-v1")).toBe("rest-v1");
  });

  it("strips REQ prefix", () => {
    expect(legacyIdToEntityName("REQ-dossier-model")).toBe("dossier-model");
  });

  it("handles unknown prefix gracefully", () => {
    expect(legacyIdToEntityName("UNKNOWN-thing")).toBe("unknown-thing");
  });

  it("handles no prefix", () => {
    expect(legacyIdToEntityName("noprefixhere")).toBe("noprefixhere");
  });
});

describe("entityNameToLegacyId", () => {
  it("prepends Component → SVC for service type", () => {
    // Default Component → first entry (application/APP for website, but service is "SVC")
    const id = entityNameToLegacyId("Component", "verifier-core", "service");
    expect(id).toBe("SVC-verifier-core");
  });

  it("prepends Component → APP for website type", () => {
    const id = entityNameToLegacyId("Component", "dashboard", "website");
    expect(id).toBe("APP-dashboard");
  });

  it("prepends API → API for openapi type", () => {
    const id = entityNameToLegacyId("API", "rest-v1", "openapi");
    expect(id).toBe("API-rest-v1");
  });

  it("prepends API → EVT for asyncapi type", () => {
    const id = entityNameToLegacyId("API", "dossier-cancelled", "asyncapi");
    expect(id).toBe("EVT-dossier-cancelled");
  });

  it("prepends Requirement → REQ for default", () => {
    const id = entityNameToLegacyId("Requirement", "dossier-model");
    expect(id).toBe("REQ-dossier-model");
  });

  it("prepends Requirement → SREQ for security type", () => {
    const id = entityNameToLegacyId("Requirement", "auth-hardening", "security");
    expect(id).toBe("SREQ-auth-hardening");
  });

  it("handles unknown kind gracefully", () => {
    const id = entityNameToLegacyId("UnknownKind", "something");
    expect(id).toBe("SOMETHING");
  });
});
