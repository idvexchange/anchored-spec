import { describe, it, expect } from "vitest";
import {
  BACKSTAGE_API_VERSION,
  ANCHORED_SPEC_API_VERSION,
  ANNOTATION_KEYS,
  ANNOTATION_PREFIX,
  normalizeEntityRef,
  parseEntityRef,
  parseLocationRef,
  stringifyEntityRef,
  stringifyLocationRef,
  type BackstageEntity,
  type EntityRef,
} from "../types.js";

// ─── Constants ──────────────────────────────────────────────────────────────────

describe("API version constants", () => {
  it("defines Backstage API version", () => {
    expect(BACKSTAGE_API_VERSION).toBe("backstage.io/v1alpha1");
  });

  it("defines anchored-spec API version", () => {
    expect(ANCHORED_SPEC_API_VERSION).toBe("anchored-spec.dev/v1alpha1");
  });
});

describe("Annotation keys", () => {
  it("uses anchored-spec.dev prefix", () => {
    expect(ANNOTATION_PREFIX).toBe("anchored-spec.dev");
  });

  it("defines all expected annotation keys", () => {
    expect(ANNOTATION_KEYS.SOURCE).toBe("anchored-spec.dev/source");
    expect(ANNOTATION_KEYS.CONFIDENCE).toBe("anchored-spec.dev/confidence");
    expect(ANNOTATION_KEYS.EXPECT_ANCHORS).toBe("anchored-spec.dev/expect-anchors");
    expect(ANNOTATION_KEYS.COMPLIANCE).toBe("anchored-spec.dev/compliance");
    expect(ANNOTATION_KEYS.RISK).toBe("anchored-spec.dev/risk");
    expect(ANNOTATION_KEYS.SUPPRESS).toBe("anchored-spec.dev/suppress");
  });
});

// ─── Entity Reference Parsing ───────────────────────────────────────────────────

describe("parseEntityRef", () => {
  it("parses kind:name", () => {
    const ref = parseEntityRef("component:verifier-core");
    expect(ref).toEqual({ kind: "component", namespace: "default", name: "verifier-core" });
  });

  it("parses kind:namespace/name", () => {
    const ref = parseEntityRef("component:default/verifier-core");
    expect(ref).toEqual({ kind: "component", namespace: "default", name: "verifier-core" });
  });

  it("preserves kind casing until stringified by Backstage", () => {
    const ref = parseEntityRef("Component:verifier-core");
    expect(ref.kind).toBe("Component");
  });

  it("trims whitespace", () => {
    const ref = parseEntityRef("  component:default/verifier-core  ");
    expect(ref).toEqual({ kind: "component", namespace: "default", name: "verifier-core" });
  });

  it("handles complex names with hyphens", () => {
    const ref = parseEntityRef("api:production/rest-api-v1");
    expect(ref).toEqual({ kind: "api", namespace: "production", name: "rest-api-v1" });
  });

  it("supports Backstage context defaults", () => {
    const ref = parseEntityRef("platform-team", {
      defaultKind: "Group",
      defaultNamespace: "default",
    });
    expect(ref).toEqual({ kind: "Group", namespace: "default", name: "platform-team" });
  });

  it("rejects bare names without context", () => {
    expect(() => parseEntityRef("verifier-core")).toThrow("missing or empty kind");
  });

  it("rejects namespace/name without kind", () => {
    expect(() => parseEntityRef("default/verifier-core")).toThrow("missing or empty kind");
  });

  it("throws on empty string", () => {
    expect(() => parseEntityRef("")).toThrow("must not be empty");
  });

  it("throws on whitespace-only string", () => {
    expect(() => parseEntityRef("   ")).toThrow("must not be empty");
  });

  it("throws on malformed refs", () => {
    expect(() => parseEntityRef(":name")).toThrow("was not on the form");
    expect(() => parseEntityRef("/name")).toThrow("was not on the form");
    expect(() => parseEntityRef("kind:")).toThrow("was not on the form");
    expect(() => parseEntityRef("kind:ns/")).toThrow("was not on the form");
  });
});

// ─── Entity Reference Formatting ────────────────────────────────────────────────

describe("stringifyEntityRef", () => {
  it("formats canonical full refs", () => {
    expect(stringifyEntityRef({
      kind: "Component",
      namespace: "default",
      name: "verifier-core",
    })).toBe("component:default/verifier-core");
  });

  it("fills in the default namespace", () => {
    expect(stringifyEntityRef({
      kind: "API",
      name: "rest-v1",
    })).toBe("api:default/rest-v1");
  });

  it("normalizes case", () => {
    expect(stringifyEntityRef({
      kind: "Component",
      namespace: "Production",
      name: "Verifier-Core",
    })).toBe("component:production/verifier-core");
  });
});

describe("normalizeEntityRef", () => {
  it("normalizes partial refs using context defaults", () => {
    expect(normalizeEntityRef("platform-team", {
      defaultKind: "Group",
      defaultNamespace: "default",
    })).toBe("group:default/platform-team");
  });

  it("normalizes already-qualified refs to canonical form", () => {
    expect(normalizeEntityRef("component:verifier-core", {
      defaultNamespace: "default",
    })).toBe("component:default/verifier-core");
  });
});

describe("location refs", () => {
  it("parses and stringifies location refs", () => {
    const parsed = parseLocationRef("url:https://example.com/catalog-info.yaml");
    expect(parsed).toEqual({
      type: "url",
      target: "https://example.com/catalog-info.yaml",
    });
    expect(stringifyLocationRef(parsed)).toBe("url:https://example.com/catalog-info.yaml");
  });
});

// ─── Round-trip ─────────────────────────────────────────────────────────────────

describe("entity ref round-trip", () => {
  const cases: Array<[string, EntityRef, EntityRef]> = [
    ["component:verifier-core", { kind: "component", namespace: "default", name: "verifier-core" }, { kind: "component", namespace: "default", name: "verifier-core" }],
    ["component:default/verifier-core", { kind: "component", namespace: "default", name: "verifier-core" }, { kind: "component", namespace: "default", name: "verifier-core" }],
    ["api:production/rest-api-v1", { kind: "api", namespace: "production", name: "rest-api-v1" }, { kind: "api", namespace: "production", name: "rest-api-v1" }],
  ];

  for (const [input, expectedParsed, expectedRoundTrip] of cases) {
    it(`round-trips "${input}"`, () => {
      const parsed = parseEntityRef(input);
      expect(parsed).toEqual(expectedParsed);
      const formatted = stringifyEntityRef(parsed);
      const reparsed = parseEntityRef(formatted);
      expect(reparsed).toEqual(expectedRoundTrip);
    });
  }
});

// ─── BackstageEntity type check ─────────────────────────────────────────────────

describe("BackstageEntity type", () => {
  it("accepts a valid Component entity", () => {
    const entity: BackstageEntity = {
      apiVersion: "backstage.io/v1alpha1",
      kind: "Component",
      metadata: {
        name: "verifier-core",
        description: "Verification orchestration engine",
        tags: ["core"],
        annotations: {
          "anchored-spec.dev/source": "docs/architecture/pillar-wallets.md#verifier-engine",
          "anchored-spec.dev/confidence": "declared",
        },
      },
      spec: {
        type: "service",
        lifecycle: "production",
        owner: "group:default/platform-team",
        system: "idv-exchange",
        dependsOn: ["resource:default/postgresql"],
        providesApis: ["rest-api-v1"],
      },
    };

    expect(entity.apiVersion).toBe("backstage.io/v1alpha1");
    expect(entity.kind).toBe("Component");
    expect(entity.metadata.name).toBe("verifier-core");
    expect(entity.spec.type).toBe("service");
  });

  it("accepts a valid custom Requirement entity", () => {
    const entity: BackstageEntity = {
      apiVersion: "anchored-spec.dev/v1alpha1",
      kind: "Requirement",
      metadata: {
        name: "req-3",
        title: "1:N Dossier Model",
      },
      spec: {
        priority: "must",
        category: "functional",
        status: "shipped",
        owner: "group:default/platform-team",
        behaviorStatements: [
          { id: "BS-01", format: "EARS", trigger: "user initiates verification", response: "create dossier" },
        ],
      },
    };

    expect(entity.apiVersion).toBe("anchored-spec.dev/v1alpha1");
    expect(entity.kind).toBe("Requirement");
    expect(entity.metadata.name).toBe("req-3");
  });
});
