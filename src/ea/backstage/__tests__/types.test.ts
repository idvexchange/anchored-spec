import { describe, it, expect } from "vitest";
import {
  BACKSTAGE_API_VERSION,
  ANCHORED_SPEC_API_VERSION,
  ANNOTATION_KEYS,
  ANNOTATION_PREFIX,
  parseEntityRef,
  formatEntityRef,
  formatFullEntityRef,
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
    expect(ANNOTATION_KEYS.LEGACY_KIND).toBe("anchored-spec.dev/legacy-kind");
  });
});

// ─── Entity Reference Parsing ───────────────────────────────────────────────────

describe("parseEntityRef", () => {
  it("parses bare name", () => {
    const ref = parseEntityRef("verifier-core");
    expect(ref).toEqual({ name: "verifier-core" });
  });

  it("parses kind:name", () => {
    const ref = parseEntityRef("component:verifier-core");
    expect(ref).toEqual({ kind: "component", name: "verifier-core" });
  });

  it("parses kind:namespace/name", () => {
    const ref = parseEntityRef("component:default/verifier-core");
    expect(ref).toEqual({ kind: "component", namespace: "default", name: "verifier-core" });
  });

  it("parses namespace/name (no kind)", () => {
    const ref = parseEntityRef("default/verifier-core");
    expect(ref).toEqual({ namespace: "default", name: "verifier-core" });
  });

  it("lowercases kind", () => {
    const ref = parseEntityRef("Component:verifier-core");
    expect(ref.kind).toBe("component");
  });

  it("preserves name case", () => {
    const ref = parseEntityRef("MyService");
    expect(ref.name).toBe("MyService");
  });

  it("trims whitespace", () => {
    const ref = parseEntityRef("  component:default/verifier-core  ");
    expect(ref).toEqual({ kind: "component", namespace: "default", name: "verifier-core" });
  });

  it("handles complex names with hyphens", () => {
    const ref = parseEntityRef("api:production/rest-api-v1");
    expect(ref).toEqual({ kind: "api", namespace: "production", name: "rest-api-v1" });
  });

  it("throws on empty string", () => {
    expect(() => parseEntityRef("")).toThrow("must not be empty");
  });

  it("throws on whitespace-only string", () => {
    expect(() => parseEntityRef("   ")).toThrow("must not be empty");
  });

  it("throws on empty kind (leading colon)", () => {
    expect(() => parseEntityRef(":name")).toThrow("empty kind");
  });

  it("throws on empty namespace (double slash)", () => {
    expect(() => parseEntityRef("/name")).toThrow("empty namespace");
  });

  it("throws on empty name (trailing colon)", () => {
    expect(() => parseEntityRef("kind:")).toThrow("empty name");
  });

  it("throws on empty name after namespace", () => {
    expect(() => parseEntityRef("kind:ns/")).toThrow("empty name");
  });

  // Ensures that properties aren't present as undefined
  it("omits kind property when not provided", () => {
    const ref = parseEntityRef("verifier-core");
    expect("kind" in ref).toBe(false);
  });

  it("omits namespace property when not provided", () => {
    const ref = parseEntityRef("component:verifier-core");
    expect("namespace" in ref).toBe(false);
  });
});

// ─── Entity Reference Formatting ────────────────────────────────────────────────

describe("formatEntityRef", () => {
  it("formats bare name", () => {
    expect(formatEntityRef(undefined, undefined, "verifier-core")).toBe("verifier-core");
  });

  it("formats kind:name", () => {
    expect(formatEntityRef("Component", undefined, "verifier-core")).toBe("component:verifier-core");
  });

  it("formats kind:namespace/name", () => {
    expect(formatEntityRef("Component", "production", "verifier-core")).toBe("component:production/verifier-core");
  });

  it("omits default namespace", () => {
    expect(formatEntityRef("Component", "default", "verifier-core")).toBe("component:verifier-core");
  });

  it("lowercases kind in output", () => {
    expect(formatEntityRef("API", undefined, "rest-v1")).toBe("api:rest-v1");
  });
});

describe("formatFullEntityRef", () => {
  it("always includes kind and namespace", () => {
    expect(formatFullEntityRef("Component", "default", "verifier-core")).toBe("component:default/verifier-core");
  });

  it("defaults namespace to 'default'", () => {
    expect(formatFullEntityRef("API", undefined, "rest-v1")).toBe("api:default/rest-v1");
  });

  it("uses provided namespace", () => {
    expect(formatFullEntityRef("Resource", "production", "postgres")).toBe("resource:production/postgres");
  });
});

// ─── Round-trip ─────────────────────────────────────────────────────────────────

describe("entity ref round-trip", () => {
  const cases: Array<[string, EntityRef, EntityRef]> = [
    // [input, expected parsed, expected after round-trip (formatEntityRef normalizes "default" away)]
    ["verifier-core", { name: "verifier-core" }, { name: "verifier-core" }],
    ["component:verifier-core", { kind: "component", name: "verifier-core" }, { kind: "component", name: "verifier-core" }],
    // Note: formatEntityRef omits "default" namespace, so round-trip normalizes it away
    ["component:default/verifier-core", { kind: "component", namespace: "default", name: "verifier-core" }, { kind: "component", name: "verifier-core" }],
    ["api:production/rest-api-v1", { kind: "api", namespace: "production", name: "rest-api-v1" }, { kind: "api", namespace: "production", name: "rest-api-v1" }],
  ];

  for (const [input, expectedParsed, expectedRoundTrip] of cases) {
    it(`round-trips "${input}"`, () => {
      const parsed = parseEntityRef(input);
      expect(parsed).toEqual(expectedParsed);
      const formatted = formatEntityRef(parsed.kind, parsed.namespace, parsed.name);
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
