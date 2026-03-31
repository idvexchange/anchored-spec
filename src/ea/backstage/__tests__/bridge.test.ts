import { describe, it, expect } from "vitest";
import { backstageToArtifact, artifactToBackstage } from "../bridge.js";
import type { BackstageEntity } from "../types.js";
import { ANNOTATION_KEYS, BACKSTAGE_API_VERSION, ANCHORED_SPEC_API_VERSION } from "../types.js";
import type { EaArtifactBase } from "../../types.js";

// ─── Test Fixtures ──────────────────────────────────────────────────────────────

const componentEntity: BackstageEntity = {
  apiVersion: BACKSTAGE_API_VERSION,
  kind: "Component",
  metadata: {
    name: "verifier-core",
    title: "Verifier Core",
    description: "Verification orchestration engine",
    tags: ["core", "orchestration"],
    annotations: {
      [ANNOTATION_KEYS.SOURCE]: "docs/architecture/pillar-wallets.md#verifier-engine",
      [ANNOTATION_KEYS.CONFIDENCE]: "declared",
      [ANNOTATION_KEYS.EXPECT_ANCHORS]: "VerifierEngine,DossierManager",
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

const apiEntity: BackstageEntity = {
  apiVersion: BACKSTAGE_API_VERSION,
  kind: "API",
  metadata: {
    name: "rest-api-v1",
    description: "IDV Exchange REST API v1",
    annotations: {
      [ANNOTATION_KEYS.SOURCE]: "docs/platform/rest-api-v1.md",
    },
  },
  spec: {
    type: "openapi",
    lifecycle: "production",
    owner: "group:default/platform-team",
    definition: "openapi: 3.1.0",
  },
};

const requirementEntity: BackstageEntity = {
  apiVersion: ANCHORED_SPEC_API_VERSION,
  kind: "Requirement",
  metadata: {
    name: "req-3",
    title: "1:N Dossier Model",
    description: "When an end-user initiates a verification, create a dossier with concurrent attempts.",
    tags: ["functional", "priority-p0"],
    annotations: {
      [ANNOTATION_KEYS.SOURCE]: "specs/requirements/req-3.md",
      [ANNOTATION_KEYS.RISK]: "moderate",
      [ANNOTATION_KEYS.COMPLIANCE]: "NIST:SI-12,eIDAS:Art.12",
    },
  },
  spec: {
    priority: "must",
    category: "functional",
    status: "shipped",
    owner: "group:default/platform-team",
    behaviorStatements: [
      { id: "BS-01", trigger: "user initiates verification", response: "create dossier" },
    ],
  },
};

const decisionEntity: BackstageEntity = {
  apiVersion: ANCHORED_SPEC_API_VERSION,
  kind: "Decision",
  metadata: {
    name: "adr-05",
    title: "Dossier Terminal States",
    annotations: {
      [ANNOTATION_KEYS.SOURCE]: "docs/decisions/adr-05.md",
    },
  },
  spec: {
    status: "accepted",
    date: "2026-03-24",
    owner: "group:default/platform-team",
    constrains: ["canonicalentity:default/dossier"],
    satisfies: ["requirement:default/req-3"],
  },
};

// ─── backstageToArtifact ────────────────────────────────────────────────────────

describe("backstageToArtifact", () => {
  describe("Component entity", () => {
    it("maps kind to legacy 'service'", () => {
      const artifact = backstageToArtifact(componentEntity);
      expect(artifact.kind).toBe("service");
    });

    it("builds legacy ID with prefix", () => {
      const artifact = backstageToArtifact(componentEntity);
      expect(artifact.id).toBe("SVC-verifier-core");
    });

    it("maps title", () => {
      const artifact = backstageToArtifact(componentEntity);
      expect(artifact.title).toBe("Verifier Core");
    });

    it("maps description to summary", () => {
      const artifact = backstageToArtifact(componentEntity);
      expect(artifact.summary).toBe("Verification orchestration engine");
    });

    it("maps lifecycle to status", () => {
      const artifact = backstageToArtifact(componentEntity);
      expect(artifact.status).toBe("active");
    });

    it("maps tags", () => {
      const artifact = backstageToArtifact(componentEntity);
      expect(artifact.tags).toEqual(["core", "orchestration"]);
    });

    it("extracts owner from spec.owner", () => {
      const artifact = backstageToArtifact(componentEntity);
      expect(artifact.owners).toEqual(["platform-team"]);
    });

    it("extracts confidence from annotation", () => {
      const artifact = backstageToArtifact(componentEntity);
      expect(artifact.confidence).toBe("declared");
    });

    it("builds relations from spec.dependsOn", () => {
      const artifact = backstageToArtifact(componentEntity);
      const depRelation = artifact.relations?.find((r) => r.type === "dependsOn");
      expect(depRelation).toBeDefined();
      // Target is converted from entity ref to legacy ID
      expect(depRelation!.target).toContain("postgresql");
    });

    it("builds relations from spec.providesApis", () => {
      const artifact = backstageToArtifact(componentEntity);
      const apiRelation = artifact.relations?.find((r) => r.type === "exposes");
      expect(apiRelation).toBeDefined();
    });

    it("builds anchors from expect-anchors annotation", () => {
      const artifact = backstageToArtifact(componentEntity);
      expect(artifact.anchors).toBeDefined();
      expect(artifact.anchors!.symbols).toContain("VerifierEngine");
      expect(artifact.anchors!.symbols).toContain("DossierManager");
    });

    it("builds traceRefs from source annotation", () => {
      const artifact = backstageToArtifact(componentEntity);
      expect(artifact.traceRefs).toHaveLength(1);
      expect(artifact.traceRefs![0].path).toBe("docs/architecture/pillar-wallets.md#verifier-engine");
      expect(artifact.traceRefs![0].role).toBe("specification");
    });
  });

  describe("API entity", () => {
    it("maps API + openapi → api-contract", () => {
      const artifact = backstageToArtifact(apiEntity);
      expect(artifact.kind).toBe("api-contract");
      expect(artifact.id).toBe("API-rest-api-v1");
    });

    it("carries API definition in extensions", () => {
      const artifact = backstageToArtifact(apiEntity);
      expect(artifact.extensions?.definition).toBe("openapi: 3.1.0");
    });
  });

  describe("Requirement entity", () => {
    it("maps Requirement → requirement", () => {
      const artifact = backstageToArtifact(requirementEntity);
      expect(artifact.kind).toBe("requirement");
      expect(artifact.id).toBe("REQ-req-3");
    });

    it("maps custom status field", () => {
      const artifact = backstageToArtifact(requirementEntity);
      expect(artifact.status).toBe("shipped");
    });

    it("extracts risk from annotation", () => {
      const artifact = backstageToArtifact(requirementEntity);
      expect(artifact.risk).toBeDefined();
      // "moderate" maps to "medium"
      expect(artifact.risk!.level).toBe("medium");
    });

    it("extracts compliance from annotation", () => {
      const artifact = backstageToArtifact(requirementEntity);
      expect(artifact.compliance).toBeDefined();
      expect(artifact.compliance!.frameworks).toContain("NIST:SI-12");
      expect(artifact.compliance!.frameworks).toContain("eIDAS:Art.12");
    });

    it("carries behaviorStatements in extensions", () => {
      const artifact = backstageToArtifact(requirementEntity);
      expect(artifact.extensions?.behaviorStatements).toBeDefined();
    });
  });

  describe("Decision entity", () => {
    it("maps Decision → decision", () => {
      const artifact = backstageToArtifact(decisionEntity);
      expect(artifact.kind).toBe("decision");
      expect(artifact.id).toBe("ADR-adr-05");
    });

    it("maps accepted status → active", () => {
      const artifact = backstageToArtifact(decisionEntity);
      expect(artifact.status).toBe("active");
    });

    it("extracts constrains relations", () => {
      const artifact = backstageToArtifact(decisionEntity);
      // constrains is a custom spec field, not a mapped relation, so it goes to extensions
      // unless we have a relation mapping for it
      expect(artifact.extensions?.constrains || artifact.relations?.some(r => r.type === "constrains")).toBeTruthy();
    });
  });

  describe("edge cases", () => {
    it("handles entity with no annotations", () => {
      const entity: BackstageEntity = {
        apiVersion: BACKSTAGE_API_VERSION,
        kind: "Component",
        metadata: { name: "simple-service" },
        spec: { type: "service", lifecycle: "production" },
      };
      const artifact = backstageToArtifact(entity);
      expect(artifact.id).toBe("SVC-simple-service");
      expect(artifact.confidence).toBe("declared");
      expect(artifact.owners).toEqual(["unassigned"]);
    });

    it("handles entity with minimal metadata", () => {
      const entity: BackstageEntity = {
        apiVersion: BACKSTAGE_API_VERSION,
        kind: "Resource",
        metadata: { name: "postgresql" },
        spec: { type: "database" },
      };
      const artifact = backstageToArtifact(entity);
      expect(artifact.kind).toBe("data-store");
      expect(artifact.title).toBe("postgresql");
      expect(artifact.summary).toBe("");
      expect(artifact.status).toBe("draft");
    });

    it("handles unknown kind gracefully", () => {
      const entity: BackstageEntity = {
        apiVersion: "custom.io/v1",
        kind: "CustomThing",
        metadata: { name: "my-thing" },
        spec: {},
      };
      const artifact = backstageToArtifact(entity);
      expect(artifact.kind).toBe("customthing");
      expect(artifact.id).toBe("my-thing");
    });

    it("maps experimental lifecycle to draft", () => {
      const entity: BackstageEntity = {
        apiVersion: BACKSTAGE_API_VERSION,
        kind: "Component",
        metadata: { name: "beta-service" },
        spec: { type: "service", lifecycle: "experimental" },
      };
      const artifact = backstageToArtifact(entity);
      expect(artifact.status).toBe("draft");
    });

    it("maps deprecated lifecycle", () => {
      const entity: BackstageEntity = {
        apiVersion: BACKSTAGE_API_VERSION,
        kind: "Component",
        metadata: { name: "old-service" },
        spec: { type: "service", lifecycle: "deprecated" },
      };
      const artifact = backstageToArtifact(entity);
      expect(artifact.status).toBe("deprecated");
    });
  });
});

// ─── artifactToBackstage ────────────────────────────────────────────────────────

describe("artifactToBackstage", () => {
  const serviceArtifact: EaArtifactBase = {
    id: "SVC-verifier-core",
    schemaVersion: "1.0.0",
    kind: "service",
    title: "Verifier Core",
    status: "active",
    summary: "Verification orchestration engine",
    owners: ["platform-team"],
    confidence: "declared",
    tags: ["core"],
    relations: [
      { type: "dependsOn", target: "STORE-postgresql" },
      { type: "exposes", target: "API-rest-v1" },
    ],
    anchors: { symbols: ["VerifierEngine", "DossierManager"] },
    traceRefs: [{ path: "docs/architecture/pillar-wallets.md#verifier-engine", role: "specification" }],
    risk: { level: "high" },
    compliance: { frameworks: ["SOC2", "HIPAA"] },
  };

  it("maps kind to Backstage Component", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.apiVersion).toBe(BACKSTAGE_API_VERSION);
    expect(entity.kind).toBe("Component");
  });

  it("extracts entity name from legacy ID", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.metadata.name).toBe("verifier-core");
  });

  it("maps title", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.metadata.title).toBe("Verifier Core");
  });

  it("maps summary to description", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.metadata.description).toBe("Verification orchestration engine");
  });

  it("maps tags", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.metadata.tags).toEqual(["core"]);
  });

  it("sets spec.type from mapping", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.spec.type).toBe("service");
  });

  it("maps status to lifecycle", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.spec.lifecycle).toBe("production");
  });

  it("sets owner", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.spec.owner).toBe("platform-team");
  });

  it("sets source annotation from traceRefs", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.metadata.annotations?.[ANNOTATION_KEYS.SOURCE]).toBe("docs/architecture/pillar-wallets.md#verifier-engine");
  });

  it("sets expect-anchors annotation", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.metadata.annotations?.[ANNOTATION_KEYS.EXPECT_ANCHORS]).toBe("VerifierEngine,DossierManager");
  });

  it("sets risk annotation", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.metadata.annotations?.[ANNOTATION_KEYS.RISK]).toBe("high");
  });

  it("sets compliance annotation", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.metadata.annotations?.[ANNOTATION_KEYS.COMPLIANCE]).toBe("SOC2,HIPAA");
  });

  it("sets legacy ID annotation for round-trip", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.metadata.annotations?.[ANNOTATION_KEYS.LEGACY_ID]).toBe("SVC-verifier-core");
    expect(entity.metadata.annotations?.[ANNOTATION_KEYS.LEGACY_KIND]).toBe("service");
  });

  it("converts relations to spec fields", () => {
    const entity = artifactToBackstage(serviceArtifact);
    expect(entity.spec.dependsOn).toBeDefined();
    expect(entity.spec.providesApis).toBeDefined();
  });

  describe("custom kinds", () => {
    const reqArtifact: EaArtifactBase = {
      id: "REQ-req-3",
      schemaVersion: "1.0.0",
      kind: "requirement",
      title: "1:N Dossier Model",
      status: "shipped",
      summary: "Multi-attempt dossier requirement",
      owners: ["platform-team"],
      confidence: "declared",
    };

    it("maps requirement to anchored-spec.dev apiVersion", () => {
      const entity = artifactToBackstage(reqArtifact);
      expect(entity.apiVersion).toBe(ANCHORED_SPEC_API_VERSION);
      expect(entity.kind).toBe("Requirement");
    });

    it("extracts name from REQ prefix", () => {
      const entity = artifactToBackstage(reqArtifact);
      expect(entity.metadata.name).toBe("req-3");
    });
  });

  describe("edge cases", () => {
    it("handles artifact with no relations", () => {
      const artifact: EaArtifactBase = {
        id: "SVC-simple",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Simple",
        status: "draft",
        summary: "",
        owners: ["team"],
        confidence: "declared",
      };
      const entity = artifactToBackstage(artifact);
      expect(entity.spec.dependsOn).toBeUndefined();
    });

    it("handles artifact with no anchors", () => {
      const artifact: EaArtifactBase = {
        id: "SVC-plain",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Plain",
        status: "active",
        summary: "A plain service",
        owners: ["team"],
        confidence: "observed",
      };
      const entity = artifactToBackstage(artifact);
      expect(entity.metadata.annotations?.[ANNOTATION_KEYS.EXPECT_ANCHORS]).toBeUndefined();
      expect(entity.metadata.annotations?.[ANNOTATION_KEYS.CONFIDENCE]).toBe("observed");
    });

    it("maps draft status to experimental lifecycle", () => {
      const artifact: EaArtifactBase = {
        id: "SVC-new",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "New",
        status: "draft",
        summary: "",
        owners: ["team"],
        confidence: "declared",
      };
      const entity = artifactToBackstage(artifact);
      expect(entity.spec.lifecycle).toBe("experimental");
    });
  });
});

// ─── Round-trip tests ───────────────────────────────────────────────────────────

describe("round-trip: backstage → artifact → backstage", () => {
  it("preserves Component entity semantics", () => {
    const artifact = backstageToArtifact(componentEntity);
    const backToEntity = artifactToBackstage(artifact);

    expect(backToEntity.apiVersion).toBe(componentEntity.apiVersion);
    expect(backToEntity.kind).toBe(componentEntity.kind);
    expect(backToEntity.metadata.name).toBe(componentEntity.metadata.name);
    expect(backToEntity.spec.type).toBe("service");
    expect(backToEntity.spec.lifecycle).toBe("production");
  });

  it("preserves API entity semantics", () => {
    const artifact = backstageToArtifact(apiEntity);
    const backToEntity = artifactToBackstage(artifact);

    expect(backToEntity.apiVersion).toBe(apiEntity.apiVersion);
    expect(backToEntity.kind).toBe(apiEntity.kind);
    expect(backToEntity.metadata.name).toBe(apiEntity.metadata.name);
    expect(backToEntity.spec.type).toBe("openapi");
  });

  it("preserves Requirement entity semantics", () => {
    const artifact = backstageToArtifact(requirementEntity);
    const backToEntity = artifactToBackstage(artifact);

    expect(backToEntity.apiVersion).toBe(requirementEntity.apiVersion);
    expect(backToEntity.kind).toBe(requirementEntity.kind);
    expect(backToEntity.metadata.name).toBe(requirementEntity.metadata.name);
  });

  it("preserves source annotation through round-trip", () => {
    const artifact = backstageToArtifact(componentEntity);
    const backToEntity = artifactToBackstage(artifact);

    expect(backToEntity.metadata.annotations?.[ANNOTATION_KEYS.SOURCE])
      .toBe(componentEntity.metadata.annotations?.[ANNOTATION_KEYS.SOURCE]);
  });

  it("preserves expect-anchors through round-trip", () => {
    const artifact = backstageToArtifact(componentEntity);
    const backToEntity = artifactToBackstage(artifact);

    expect(backToEntity.metadata.annotations?.[ANNOTATION_KEYS.EXPECT_ANCHORS])
      .toBe(componentEntity.metadata.annotations?.[ANNOTATION_KEYS.EXPECT_ANCHORS]);
  });
});

describe("round-trip: artifact → backstage → artifact", () => {
  const originalArtifact: EaArtifactBase = {
    id: "SVC-my-service",
    schemaVersion: "1.0.0",
    kind: "service",
    title: "My Service",
    status: "active",
    summary: "A test service",
    owners: ["dev-team"],
    confidence: "observed",
    tags: ["backend"],
    anchors: { symbols: ["MyClass"], apis: ["GET /health"] },
    traceRefs: [{ path: "docs/services/my-service.md", role: "specification" }],
  };

  it("preserves core fields", () => {
    const entity = artifactToBackstage(originalArtifact);
    const backToArtifact = backstageToArtifact(entity);

    expect(backToArtifact.kind).toBe(originalArtifact.kind);
    expect(backToArtifact.title).toBe(originalArtifact.title);
    expect(backToArtifact.status).toBe(originalArtifact.status);
    expect(backToArtifact.summary).toBe(originalArtifact.summary);
    expect(backToArtifact.tags).toEqual(originalArtifact.tags);
  });

  it("preserves confidence", () => {
    const entity = artifactToBackstage(originalArtifact);
    const backToArtifact = backstageToArtifact(entity);

    expect(backToArtifact.confidence).toBe(originalArtifact.confidence);
  });

  it("preserves traceRefs", () => {
    const entity = artifactToBackstage(originalArtifact);
    const backToArtifact = backstageToArtifact(entity);

    expect(backToArtifact.traceRefs).toHaveLength(1);
    expect(backToArtifact.traceRefs![0]!.path).toBe(originalArtifact.traceRefs![0]!.path);
  });

  it("preserves all traceRefs in spec.traceRefs when multiple exist", () => {
    const artifact: EaArtifactBase = {
      id: "SREQ-test-multi-ref",
      schemaVersion: "1.0.0",
      kind: "security-requirement",
      title: "Multi-ref Test",
      summary: "Test artifact with multiple traceRefs",
      status: "active",
      owners: ["team"],
      confidence: "observed",
      traceRefs: [
        { path: "docs/spec.md", role: "specification" },
        { path: "docs/arch.md", role: "context" },
        { path: "src/impl.ts", role: "implementation" },
      ],
    };

    const entity = artifactToBackstage(artifact);

    // Primary source should be the specification doc
    expect(entity.metadata.annotations!["anchored-spec.dev/source"]).toBe("docs/spec.md");

    // All traceRefs preserved in spec
    expect(entity.spec.traceRefs).toEqual([
      { path: "docs/spec.md", role: "specification" },
      { path: "docs/arch.md", role: "context" },
      { path: "src/impl.ts", role: "implementation" },
    ]);

    // Round-trip
    const roundTripped = backstageToArtifact(entity);
    expect(roundTripped.traceRefs).toEqual(artifact.traceRefs);
  });

  it("uses specification role for primary source heuristic", () => {
    const artifact: EaArtifactBase = {
      id: "SREQ-heuristic-test",
      schemaVersion: "1.0.0",
      kind: "security-requirement",
      title: "Heuristic Test",
      summary: "Test primary source heuristic",
      status: "active",
      owners: ["team"],
      confidence: "declared",
      traceRefs: [
        { path: "src/impl.ts", role: "implementation" },
        { path: "docs/spec.md", role: "specification" },
      ],
    };

    const entity = artifactToBackstage(artifact);

    // Should pick role=specification, not first entry
    expect(entity.metadata.annotations!["anchored-spec.dev/source"]).toBe("docs/spec.md");
  });

  it("falls back to .md file for primary source when no specification role", () => {
    const artifact: EaArtifactBase = {
      id: "SREQ-fallback-test",
      schemaVersion: "1.0.0",
      kind: "security-requirement",
      title: "Fallback Test",
      summary: "Test .md fallback heuristic",
      status: "active",
      owners: ["team"],
      confidence: "declared",
      traceRefs: [
        { path: "src/impl.ts", role: "implementation" },
        { path: "docs/arch.md", role: "context" },
      ],
    };

    const entity = artifactToBackstage(artifact);

    // Should pick .md file, not first entry
    expect(entity.metadata.annotations!["anchored-spec.dev/source"]).toBe("docs/arch.md");
  });

  it("does not write spec.traceRefs for single traceRef", () => {
    const artifact: EaArtifactBase = {
      id: "SREQ-single-ref",
      schemaVersion: "1.0.0",
      kind: "security-requirement",
      title: "Single Ref",
      summary: "Single traceRef test",
      status: "active",
      owners: ["team"],
      confidence: "declared",
      traceRefs: [
        { path: "docs/spec.md", role: "specification" },
      ],
    };

    const entity = artifactToBackstage(artifact);

    // Should NOT write spec.traceRefs (keep single-ref entities clean)
    expect(entity.spec.traceRefs).toBeUndefined();
    expect(entity.metadata.annotations!["anchored-spec.dev/source"]).toBe("docs/spec.md");
  });
});
