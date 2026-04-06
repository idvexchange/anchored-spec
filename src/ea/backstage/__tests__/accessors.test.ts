/**
 * Tests for Backstage Entity Accessors
 */
import { describe, it, expect } from "vitest";
import type { BackstageEntity } from "../types.js";
import {
  getEntityId,
  getEntityName,
  getEntityNamespace,
  getEntityTitle,
  getEntityDescription,
  getEntitySchema,
  getEntityDescriptor,
  getEntitySpecType,
  getEntityStatus,
  getEntityLifecycle,
  getEntityOwners,
  getEntityOwnerRef,
  getEntityTags,
  getAnnotation,
  getAnnotations,
  getEntityConfidence,
  getEntityRisk,
  getEntityCompliance,
  getEntitySource,
  getEntityCodeLocation,
  getEntityExpectAnchors,
  getEntitySuppressions,
  getLabel,
  getLabels,
  getEntitySpecRelations,
  getEntityRelations,
  getSpecFieldTargets,
  getSpecField,
  getSpec,
  getEntitySystem,
  getEntityDomain,
  getEntityLinks,
} from "../accessors.js";
import { ANNOTATION_KEYS } from "../types.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────────

const component: BackstageEntity = {
  apiVersion: "backstage.io/v1alpha1",
  kind: "Component",
  metadata: {
    name: "verifier-core",
    namespace: "production",
    title: "Verifier Core Service",
    description: "Core verification service for identity documents",
    tags: ["backend", "go", "critical"],
    labels: { tier: "1", env: "production" },
    annotations: {
      [ANNOTATION_KEYS.SOURCE]: "docs/architecture/verifier.md",
      [ANNOTATION_KEYS.CODE_LOCATION]: "src/verifier/",
      [ANNOTATION_KEYS.CONFIDENCE]: "observed",
      [ANNOTATION_KEYS.RISK]: "high",
      [ANNOTATION_KEYS.COMPLIANCE]: "SOC2,ISO27001",
      [ANNOTATION_KEYS.EXPECT_ANCHORS]: "VerifierService,ProcessDocument",
      [ANNOTATION_KEYS.SUPPRESS]: "drift:naming-convention",
    },
    links: [
      { url: "https://grafana.example.com/d/verifier", title: "Dashboard", type: "dashboard" },
    ],
  },
  spec: {
    type: "service",
    lifecycle: "production",
    owner: "group:default/platform-team",
    system: "identity-system",
    dependsOn: ["component:database-core", "resource:redis-cache"],
    providesApis: ["api:verifier-api"],
  },
  relations: [
    { type: "dependsOn", targetRef: "component:default/database-core" },
  ],
};

const requirement: BackstageEntity = {
  apiVersion: "anchored-spec.dev/v1alpha1",
  kind: "Requirement",
  metadata: {
    name: "password-complexity",
    description: "Password must meet complexity requirements",
  },
  spec: {
    type: "security",
    status: "accepted",
    priority: "must",
    category: "security",
    owner: "group:default/security-team",
  },
};

const minimal: BackstageEntity = {
  apiVersion: "backstage.io/v1alpha1",
  kind: "System",
  metadata: { name: "my-system" },
  spec: {},
};

// ─── Identity ───────────────────────────────────────────────────────────────────

describe("identity accessors", () => {
  it("getEntityId returns entity ref with kind and namespace", () => {
    expect(getEntityId(component)).toBe("component:production/verifier-core");
  });

  it("getEntityId keeps the default namespace in canonical refs", () => {
    const entity: BackstageEntity = {
      ...component,
      metadata: { ...component.metadata, namespace: "default" },
    };
    expect(getEntityId(entity)).toBe("component:default/verifier-core");
  });

  it("getEntityId works with minimal entity", () => {
    expect(getEntityId(minimal)).toBe("system:default/my-system");
  });

  it("getEntityName returns metadata.name", () => {
    expect(getEntityName(component)).toBe("verifier-core");
  });

  it("getEntityNamespace returns namespace or default", () => {
    expect(getEntityNamespace(component)).toBe("production");
    expect(getEntityNamespace(minimal)).toBe("default");
  });
});

// ─── Display ────────────────────────────────────────────────────────────────────

describe("display accessors", () => {
  it("getEntityTitle returns metadata.title", () => {
    expect(getEntityTitle(component)).toBe("Verifier Core Service");
  });

  it("getEntityTitle falls back to name", () => {
    expect(getEntityTitle(minimal)).toBe("my-system");
  });

  it("getEntityDescription returns metadata.description", () => {
    expect(getEntityDescription(component)).toBe("Core verification service for identity documents");
  });

  it("getEntityDescription returns empty string if unset", () => {
    expect(getEntityDescription(minimal)).toBe("");
  });
});

// ─── Kind & Type ────────────────────────────────────────────────────────────────

describe("kind accessors", () => {
  it("getEntitySchema maps Component/service to 'service'", () => {
    expect(getEntitySchema(component)).toBe("service");
  });

  it("getEntitySchema maps Requirement to 'security-requirement' (via spec.type=security)", () => {
    expect(getEntitySchema(requirement)).toBe("security-requirement");
  });

  it("getEntitySchema maps Requirement without spec.type to 'requirement'", () => {
    const req: BackstageEntity = {
      apiVersion: "anchored-spec.dev/v1alpha1",
      kind: "Requirement",
      metadata: { name: "basic-req" },
      spec: { priority: "must", category: "functional" },
    };
    expect(getEntitySchema(req)).toBe("requirement");
  });

  it("getEntitySchema falls back to lowercase kind for unmapped", () => {
    const unknown: BackstageEntity = {
      apiVersion: "custom/v1",
      kind: "FooBar",
      metadata: { name: "x" },
      spec: {},
    };
    expect(getEntitySchema(unknown)).toBe("foobar");
  });

  it("getEntityDescriptor returns mapping entry", () => {
    const mapping = getEntityDescriptor(component);
    expect(mapping).toBeDefined();
    expect(mapping?.schema).toBe("service");
    expect(mapping?.kind).toBe("Component");
  });

  it("getEntityDescriptor returns undefined for unknown kinds", () => {
    const unknown: BackstageEntity = {
      apiVersion: "custom/v1",
      kind: "Unknown",
      metadata: { name: "x" },
      spec: {},
    };
    expect(getEntityDescriptor(unknown)).toBeUndefined();
  });

  it("getEntitySpecType returns spec.type", () => {
    expect(getEntitySpecType(component)).toBe("service");
  });

  it("getEntitySpecType returns undefined when not set", () => {
    expect(getEntitySpecType(minimal)).toBeUndefined();
  });
});

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

describe("lifecycle accessors", () => {
  it("getEntityStatus maps lifecycle=production to 'active'", () => {
    expect(getEntityStatus(component)).toBe("active");
  });

  it("getEntityStatus maps spec.status for custom kinds", () => {
    expect(getEntityStatus(requirement)).toBe("active"); // "accepted" → "active"
  });

  it("getEntityStatus maps spec.status=proposed to 'draft'", () => {
    const entity: BackstageEntity = {
      ...requirement,
      spec: { ...requirement.spec, status: "proposed" },
    };
    expect(getEntityStatus(entity)).toBe("draft");
  });

  it("getEntityStatus returns 'draft' when no lifecycle or status", () => {
    expect(getEntityStatus(minimal)).toBe("draft");
  });

  it("getEntityStatus maps lifecycle=experimental to 'draft'", () => {
    const entity: BackstageEntity = {
      ...minimal,
      spec: { lifecycle: "experimental" },
    };
    expect(getEntityStatus(entity)).toBe("draft");
  });

  it("getEntityStatus maps lifecycle=deprecated to 'deprecated'", () => {
    const entity: BackstageEntity = {
      ...minimal,
      spec: { lifecycle: "deprecated" },
    };
    expect(getEntityStatus(entity)).toBe("deprecated");
  });

  it("getEntityLifecycle returns raw lifecycle string", () => {
    expect(getEntityLifecycle(component)).toBe("production");
  });

  it("getEntityLifecycle returns undefined when not set", () => {
    expect(getEntityLifecycle(minimal)).toBeUndefined();
  });
});

// ─── Ownership ──────────────────────────────────────────────────────────────────

describe("ownership accessors", () => {
  it("getEntityOwners returns spec.owner as array", () => {
    expect(getEntityOwners(component)).toEqual(["group:default/platform-team"]);
  });

  it("getEntityOwners returns ['unassigned'] when no owner", () => {
    expect(getEntityOwners(minimal)).toEqual(["unassigned"]);
  });

  it("getEntityOwnerRef returns raw owner ref", () => {
    expect(getEntityOwnerRef(component)).toBe("group:default/platform-team");
  });

  it("getEntityOwnerRef returns undefined when not set", () => {
    expect(getEntityOwnerRef(minimal)).toBeUndefined();
  });
});

// ─── Tags ───────────────────────────────────────────────────────────────────────

describe("tags accessors", () => {
  it("getEntityTags returns metadata.tags", () => {
    expect(getEntityTags(component)).toEqual(["backend", "go", "critical"]);
  });

  it("getEntityTags returns empty array when not set", () => {
    expect(getEntityTags(minimal)).toEqual([]);
  });
});

// ─── Annotations ────────────────────────────────────────────────────────────────

describe("annotation accessors", () => {
  it("getAnnotation returns a specific annotation value", () => {
    expect(getAnnotation(component, ANNOTATION_KEYS.SOURCE)).toBe("docs/architecture/verifier.md");
  });

  it("getAnnotation returns undefined for missing annotations", () => {
    expect(getAnnotation(minimal, ANNOTATION_KEYS.SOURCE)).toBeUndefined();
  });

  it("getAnnotations returns all annotations", () => {
    const annotations = getAnnotations(component);
    expect(annotations[ANNOTATION_KEYS.SOURCE]).toBe("docs/architecture/verifier.md");
    expect(annotations[ANNOTATION_KEYS.CONFIDENCE]).toBe("observed");
  });

  it("getAnnotations returns empty object when no annotations", () => {
    expect(getAnnotations(minimal)).toEqual({});
  });

  it("getEntityConfidence returns confidence from annotation", () => {
    expect(getEntityConfidence(component)).toBe("observed");
  });

  it("getEntityConfidence defaults to 'declared'", () => {
    expect(getEntityConfidence(minimal)).toBe("declared");
  });

  it("getEntityRisk returns risk level", () => {
    expect(getEntityRisk(component)).toBe("high");
  });

  it("getEntityRisk returns undefined when not set", () => {
    expect(getEntityRisk(minimal)).toBeUndefined();
  });

  it("getEntityCompliance parses CSV frameworks", () => {
    expect(getEntityCompliance(component)).toEqual(["SOC2", "ISO27001"]);
  });

  it("getEntityCompliance returns empty array when not set", () => {
    expect(getEntityCompliance(minimal)).toEqual([]);
  });

  it("getEntitySource returns source path", () => {
    expect(getEntitySource(component)).toBe("docs/architecture/verifier.md");
  });

  it("getEntityCodeLocation returns primary code location path", () => {
    expect(getEntityCodeLocation(component)).toBe("src/verifier/");
  });

  it("getEntityExpectAnchors parses CSV anchors", () => {
    expect(getEntityExpectAnchors(component)).toEqual(["VerifierService", "ProcessDocument"]);
  });

  it("getEntityExpectAnchors returns empty array when not set", () => {
    expect(getEntityExpectAnchors(minimal)).toEqual([]);
  });

  it("getEntitySuppressions parses CSV suppressions", () => {
    expect(getEntitySuppressions(component)).toEqual(["drift:naming-convention"]);
  });

});

// ─── Labels ─────────────────────────────────────────────────────────────────────

describe("label accessors", () => {
  it("getLabel returns a specific label value", () => {
    expect(getLabel(component, "tier")).toBe("1");
  });

  it("getLabel returns undefined for missing labels", () => {
    expect(getLabel(minimal, "tier")).toBeUndefined();
  });

  it("getLabels returns all labels", () => {
    expect(getLabels(component)).toEqual({ tier: "1", env: "production" });
  });

  it("getLabels returns empty object when no labels", () => {
    expect(getLabels(minimal)).toEqual({});
  });
});

// ─── Relations ──────────────────────────────────────────────────────────────────

describe("relation accessors", () => {
  it("getEntitySpecRelations extracts relations from spec fields", () => {
    const relations = getEntitySpecRelations(component);
    const dependsOn = relations.find((r) => r.type === "dependsOn");
    expect(dependsOn).toBeDefined();
    expect(dependsOn?.targets).toContain("component:default/database-core");
  });

  it("getEntityRelations returns the computed relations array", () => {
    expect(getEntityRelations(component)).toEqual([
      { type: "dependsOn", targetRef: "component:default/database-core" },
    ]);
  });

  it("getEntityRelations returns empty array when not set", () => {
    expect(getEntityRelations(minimal)).toEqual([]);
  });

  it("getSpecFieldTargets returns array field values", () => {
    expect(getSpecFieldTargets(component, "dependsOn")).toEqual([
      "component:database-core",
      "resource:redis-cache",
    ]);
  });

  it("getSpecFieldTargets returns single string as array", () => {
    const entity: BackstageEntity = {
      ...minimal,
      spec: { owner: "team:alpha" },
    };
    expect(getSpecFieldTargets(entity, "owner")).toEqual(["team:alpha"]);
  });

  it("getSpecFieldTargets returns empty array for missing field", () => {
    expect(getSpecFieldTargets(minimal, "dependsOn")).toEqual([]);
  });
});

// ─── Spec Access ────────────────────────────────────────────────────────────────

describe("spec accessors", () => {
  it("getSpecField returns typed field", () => {
    expect(getSpecField<string>(component, "lifecycle")).toBe("production");
    expect(getSpecField<string[]>(component, "dependsOn")).toEqual([
      "component:database-core",
      "resource:redis-cache",
    ]);
  });

  it("getSpecField returns undefined for missing field", () => {
    expect(getSpecField(minimal, "lifecycle")).toBeUndefined();
  });

  it("getSpec returns full spec object", () => {
    expect(getSpec(component)).toHaveProperty("type", "service");
    expect(getSpec(component)).toHaveProperty("lifecycle", "production");
  });

  it("getSpec returns empty object when spec is empty", () => {
    expect(getSpec(minimal)).toEqual({});
  });
});

// ─── System & Domain ────────────────────────────────────────────────────────────

describe("system and domain accessors", () => {
  it("getEntitySystem returns spec.system", () => {
    expect(getEntitySystem(component)).toBe("identity-system");
  });

  it("getEntitySystem returns undefined when not set", () => {
    expect(getEntitySystem(minimal)).toBeUndefined();
  });

  it("getEntityDomain returns spec.domain for System kind", () => {
    const system: BackstageEntity = {
      apiVersion: "backstage.io/v1alpha1",
      kind: "System",
      metadata: { name: "my-system" },
      spec: { owner: "team-a", domain: "payments" },
    };
    expect(getEntityDomain(system)).toBe("payments");
  });

  it("getEntityDomain falls back to kind mapping when no explicit domain is set", () => {
    expect(getEntityDomain(component)).toBe("systems");
  });
});

// ─── Links ──────────────────────────────────────────────────────────────────────

describe("link accessors", () => {
  it("getEntityLinks returns metadata.links", () => {
    const links = getEntityLinks(component);
    expect(links).toHaveLength(1);
    expect(links[0]!.url).toBe("https://grafana.example.com/d/verifier");
    expect(links[0]!.title).toBe("Dashboard");
  });

  it("getEntityLinks returns empty array when not set", () => {
    expect(getEntityLinks(minimal)).toEqual([]);
  });
});
