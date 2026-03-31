import { describe, it, expect } from "vitest";
import {
  RELATION_MAPPING_REGISTRY,
  mapLegacyRelation,
  mapBackstageRelation,
  mapSpecField,
  getWellKnownRelations,
  getCustomRelations,
  isWellKnownRelation,
  legacyRelationToSpecEntry,
  extractRelationsFromSpec,
} from "../relation-mapping.js";
import { createDefaultRegistry } from "../../relation-registry.js";

// ─── Registry Coverage ──────────────────────────────────────────────────────────

describe("RELATION_MAPPING_REGISTRY", () => {
  it("covers all 27 legacy relation types", () => {
    const legacyRegistry = createDefaultRegistry();
    const legacyTypes = legacyRegistry.allTypes();
    const mappedTypes = RELATION_MAPPING_REGISTRY.map((e) => e.legacyType);

    for (const type of legacyTypes) {
      expect(mappedTypes, `Missing mapping for "${type}"`).toContain(type);
    }
  });

  it("has 28 entries total", () => {
    expect(RELATION_MAPPING_REGISTRY.length).toBe(28);
  });

  it("has no duplicate legacy types", () => {
    const seen = new Set<string>();
    for (const entry of RELATION_MAPPING_REGISTRY) {
      expect(seen.has(entry.legacyType), `Duplicate: ${entry.legacyType}`).toBe(false);
      seen.add(entry.legacyType);
    }
  });

  it("has no duplicate backstage types", () => {
    const seen = new Set<string>();
    for (const entry of RELATION_MAPPING_REGISTRY) {
      expect(seen.has(entry.backstageType), `Duplicate: ${entry.backstageType}`).toBe(false);
      seen.add(entry.backstageType);
    }
  });

  it("all entries have non-empty description", () => {
    for (const entry of RELATION_MAPPING_REGISTRY) {
      expect(entry.description.length, `Empty description for ${entry.legacyType}`).toBeGreaterThan(0);
    }
  });

  it("all spec-field entries have specField defined", () => {
    for (const entry of RELATION_MAPPING_REGISTRY) {
      if (entry.placement === "spec-field") {
        expect(entry.specField, `Missing specField for ${entry.legacyType}`).toBeDefined();
      }
    }
  });
});

// ─── Well-Known Relations ───────────────────────────────────────────────────────

describe("well-known Backstage relations", () => {
  it("dependsOn maps correctly", () => {
    const entry = mapLegacyRelation("dependsOn");
    expect(entry).toBeDefined();
    expect(entry!.backstageType).toBe("dependsOn");
    expect(entry!.backstageInverse).toBe("dependencyOf");
    expect(entry!.isWellKnown).toBe(true);
    expect(entry!.specField).toBe("dependsOn");
  });

  it("owns maps to ownerOf", () => {
    const entry = mapLegacyRelation("owns");
    expect(entry).toBeDefined();
    expect(entry!.backstageType).toBe("ownerOf");
    expect(entry!.backstageInverse).toBe("ownedBy");
    expect(entry!.isWellKnown).toBe(true);
    expect(entry!.specField).toBe("owner");
  });

  it("exposes maps to providesApi", () => {
    const entry = mapLegacyRelation("exposes");
    expect(entry).toBeDefined();
    expect(entry!.backstageType).toBe("providesApi");
    expect(entry!.backstageInverse).toBe("apiProvidedBy");
    expect(entry!.isWellKnown).toBe(true);
  });

  it("consumes maps to consumesApi", () => {
    const entry = mapLegacyRelation("consumes");
    expect(entry).toBeDefined();
    expect(entry!.backstageType).toBe("consumesApi");
    expect(entry!.backstageInverse).toBe("apiConsumedBy");
    expect(entry!.isWellKnown).toBe(true);
  });

  it("getWellKnownRelations returns 4 entries", () => {
    const wellKnown = getWellKnownRelations();
    expect(wellKnown.length).toBe(4);
    expect(wellKnown.every((e) => e.isWellKnown)).toBe(true);
  });
});

// ─── Custom Relations ───────────────────────────────────────────────────────────

describe("custom anchored-spec relations", () => {
  const customTypes = [
    "realizes", "uses", "deploys", "runsOn", "boundedBy", "authenticatedBy",
    "deployedTo", "interfacesWith", "standardizes", "providedBy",
    "stores", "hostedOn", "lineageFrom", "implementedBy",
    "classifiedAs", "exchangedVia", "retainedUnder",
    "supports", "performedBy", "governedBy",
    "supersedes", "generates", "mitigates", "targets",
  ];

  for (const type of customTypes) {
    it(`maps legacy "${type}" to custom relation`, () => {
      const entry = mapLegacyRelation(type);
      expect(entry, `Missing mapping for "${type}"`).toBeDefined();
      expect(entry!.isWellKnown).toBe(false);
    });
  }

  it("getCustomRelations returns 24 entries", () => {
    const custom = getCustomRelations();
    expect(custom.length).toBe(24);
    expect(custom.every((e) => !e.isWellKnown)).toBe(true);
  });
});

// ─── Lookup Functions ───────────────────────────────────────────────────────────

describe("mapLegacyRelation", () => {
  it("finds by forward type", () => {
    expect(mapLegacyRelation("dependsOn")).toBeDefined();
    expect(mapLegacyRelation("implementedBy")).toBeDefined();
  });

  it("finds by inverse type", () => {
    const entry = mapLegacyRelation("dependedOnBy");
    expect(entry).toBeDefined();
    expect(entry!.legacyType).toBe("dependsOn");
  });

  it("returns undefined for unknown", () => {
    expect(mapLegacyRelation("nonexistent")).toBeUndefined();
  });
});

describe("mapBackstageRelation", () => {
  it("finds by forward type", () => {
    expect(mapBackstageRelation("dependsOn")).toBeDefined();
    expect(mapBackstageRelation("providesApi")).toBeDefined();
  });

  it("finds by inverse type", () => {
    const entry = mapBackstageRelation("dependencyOf");
    expect(entry).toBeDefined();
    expect(entry!.backstageType).toBe("dependsOn");
  });

  it("returns undefined for unknown", () => {
    expect(mapBackstageRelation("nonexistent")).toBeUndefined();
  });
});

describe("mapSpecField", () => {
  it("maps dependsOn field", () => {
    const entry = mapSpecField("dependsOn");
    expect(entry).toBeDefined();
    expect(entry!.legacyType).toBe("dependsOn");
  });

  it("maps providesApis field", () => {
    const entry = mapSpecField("providesApis");
    expect(entry).toBeDefined();
    expect(entry!.legacyType).toBe("exposes");
  });

  it("maps owner field", () => {
    const entry = mapSpecField("owner");
    expect(entry).toBeDefined();
    expect(entry!.legacyType).toBe("owns");
  });

  it("returns undefined for non-relation field", () => {
    expect(mapSpecField("type")).toBeUndefined();
    expect(mapSpecField("lifecycle")).toBeUndefined();
  });
});

describe("isWellKnownRelation", () => {
  it("returns true for Backstage well-known types", () => {
    expect(isWellKnownRelation("dependsOn")).toBe(true);
    expect(isWellKnownRelation("providesApi")).toBe(true);
    expect(isWellKnownRelation("consumesApi")).toBe(true);
    expect(isWellKnownRelation("ownerOf")).toBe(true);
  });

  it("returns true for well-known inverse types", () => {
    expect(isWellKnownRelation("dependencyOf")).toBe(true);
    expect(isWellKnownRelation("apiProvidedBy")).toBe(true);
  });

  it("returns false for custom types", () => {
    expect(isWellKnownRelation("implementedBy")).toBe(false);
    expect(isWellKnownRelation("supports")).toBe(false);
  });

  it("returns false for unknown types", () => {
    expect(isWellKnownRelation("nonexistent")).toBe(false);
  });
});

// ─── Conversion Utilities ───────────────────────────────────────────────────────

describe("legacyRelationToSpecEntry", () => {
  it("converts dependsOn to spec entry", () => {
    const result = legacyRelationToSpecEntry("dependsOn", "component:default/db-service");
    expect(result).toEqual({
      specField: "dependsOn",
      targetRef: "component:default/db-service",
    });
  });

  it("converts exposes to providesApis spec entry", () => {
    const result = legacyRelationToSpecEntry("exposes", "api:default/rest-v1");
    expect(result).toEqual({
      specField: "providesApis",
      targetRef: "api:default/rest-v1",
    });
  });

  it("converts implementedBy to spec entry", () => {
    const result = legacyRelationToSpecEntry("implementedBy", "resource:default/workflows-table");
    expect(result).toEqual({
      specField: "implementedBy",
      targetRef: "resource:default/workflows-table",
    });
  });

  it("returns null for unknown relation", () => {
    expect(legacyRelationToSpecEntry("nonexistent", "ref")).toBeNull();
  });
});

describe("extractRelationsFromSpec", () => {
  it("extracts dependsOn array", () => {
    const spec = {
      type: "service",
      lifecycle: "production",
      owner: "group:default/platform-team",
      dependsOn: ["resource:default/postgresql", "component:default/auth-service"],
    };

    const relations = extractRelationsFromSpec(spec);
    const depRelation = relations.find((r) => r.backstageType === "dependsOn");
    expect(depRelation).toBeDefined();
    expect(depRelation!.targets).toEqual(["resource:default/postgresql", "component:default/auth-service"]);
    expect(depRelation!.legacyType).toBe("dependsOn");
  });

  it("extracts owner as single-value relation", () => {
    const spec = {
      owner: "group:default/platform-team",
    };

    const relations = extractRelationsFromSpec(spec);
    const ownerRelation = relations.find((r) => r.backstageType === "ownerOf");
    expect(ownerRelation).toBeDefined();
    expect(ownerRelation!.targets).toEqual(["group:default/platform-team"]);
  });

  it("extracts multiple relation types", () => {
    const spec = {
      type: "service",
      lifecycle: "production",
      owner: "group:default/platform-team",
      dependsOn: ["resource:default/postgresql"],
      providesApis: ["rest-api-v1"],
      consumesApis: ["auth-api"],
    };

    const relations = extractRelationsFromSpec(spec);
    expect(relations.length).toBe(4); // owner + dependsOn + providesApis + consumesApis
  });

  it("ignores non-relation spec fields", () => {
    const spec = {
      type: "service",
      lifecycle: "production",
      system: "idv-exchange",
    };

    const relations = extractRelationsFromSpec(spec);
    expect(relations.length).toBe(0);
  });

  it("ignores empty arrays", () => {
    const spec = {
      dependsOn: [],
    };

    const relations = extractRelationsFromSpec(spec);
    expect(relations.length).toBe(0);
  });

  it("filters non-string array values", () => {
    const spec = {
      dependsOn: ["resource:default/postgresql", 42, null, "component:default/auth"],
    };

    const relations = extractRelationsFromSpec(spec);
    const dep = relations.find((r) => r.backstageType === "dependsOn");
    expect(dep).toBeDefined();
    expect(dep!.targets).toEqual(["resource:default/postgresql", "component:default/auth"]);
  });

  it("extracts custom relation spec fields", () => {
    const spec = {
      implementedBy: ["resource:default/workflows-table"],
      supports: ["mission:default/eudi-readiness"],
    };

    const relations = extractRelationsFromSpec(spec);
    expect(relations.length).toBe(2);
    expect(relations.find((r) => r.legacyType === "implementedBy")).toBeDefined();
    expect(relations.find((r) => r.legacyType === "supports")).toBeDefined();
  });
});
