/**
 * Tests for Backstage Entity Validation
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { BackstageEntity } from "../types.js";
import {
  validateBackstageEntity,
  validateBackstageEntities,
  getBackstageSchemaForKind,
  getBackstageSchemaNames,
  resetBackstageAjv,
} from "../validate.js";

beforeEach(() => {
  resetBackstageAjv();
});

// ─── Fixtures ───────────────────────────────────────────────────────────────────

function makeComponent(overrides: Partial<BackstageEntity> = {}): BackstageEntity {
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind: "Component",
    metadata: {
      name: "my-service",
      title: "My Service",
      description: "A test service that does useful things",
    },
    spec: {
      type: "service",
      lifecycle: "production",
      owner: "group:default/platform-team",
    },
    ...overrides,
  };
}

function makeRequirement(overrides: Partial<BackstageEntity> = {}): BackstageEntity {
  return {
    apiVersion: "anchored-spec.dev/v1alpha1",
    kind: "Requirement",
    metadata: {
      name: "password-complexity",
      description: "Passwords must meet complexity requirements",
    },
    spec: {
      owner: "group:default/security-team",
      status: "accepted",
      priority: "must",
      category: "security",
    },
    ...overrides,
  };
}

// ─── Schema Lookup ──────────────────────────────────────────────────────────────

describe("schema lookup", () => {
  it("getBackstageSchemaNames returns all supported schema names", () => {
    const names = getBackstageSchemaNames();
    expect(names).toContain("entity-envelope");
    expect(names).toContain("component");
    expect(names).toContain("api");
    expect(names).toContain("user");
    expect(names).toContain("location");
    expect(names).toContain("requirement");
    expect(names).toContain("canonical-entity");
    expect(names.length).toBe(21);
  });

  it("getBackstageSchemaForKind maps PascalCase kinds", () => {
    expect(getBackstageSchemaForKind("Component")).toBe("component");
    expect(getBackstageSchemaForKind("API")).toBe("api");
    expect(getBackstageSchemaForKind("CanonicalEntity")).toBe("canonical-entity");
    expect(getBackstageSchemaForKind("TransitionPlan")).toBe("transition-plan");
    expect(getBackstageSchemaForKind("ValueStream")).toBe("value-stream");
  });

  it("getBackstageSchemaForKind returns undefined for unknown kinds", () => {
    expect(getBackstageSchemaForKind("FooBar")).toBeUndefined();
    expect(getBackstageSchemaForKind("service")).toBeUndefined(); // not PascalCase
  });
});

// ─── validateBackstageEntity ────────────────────────────────────────────────────

describe("validateBackstageEntity", () => {
  it("validates a valid Component entity", async () => {
    const result = await validateBackstageEntity(makeComponent());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validates a valid Requirement entity", async () => {
    const result = await validateBackstageEntity(makeRequirement());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects entity missing apiVersion", async () => {
    const entity = makeComponent();
    delete (entity as Record<string, unknown>).apiVersion;
    const result = await validateBackstageEntity(entity);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects entity missing kind", async () => {
    const entity = makeComponent();
    delete (entity as Record<string, unknown>).kind;
    const result = await validateBackstageEntity(entity);
    expect(result.valid).toBe(false);
  });

  it("rejects entity missing metadata.name", async () => {
    const entity = makeComponent();
    delete (entity.metadata as Record<string, unknown>).name;
    const result = await validateBackstageEntity(entity);
    expect(result.valid).toBe(false);
  });

  it("falls back to entity-envelope for unknown kinds", async () => {
    const entity: BackstageEntity = {
      apiVersion: "backstage.io/v1alpha1",
      kind: "UnknownKind",
      metadata: { name: "test-entity" },
      spec: {},
    };
    // Unknown kind falls back to envelope validation — apiVersion/kind/metadata present
    const result = await validateBackstageEntity(entity, "entity-envelope");
    expect(result.valid).toBe(true);
  });

  it("validates with explicit schema name", async () => {
    const entity = makeComponent();
    const result = await validateBackstageEntity(entity, "component");
    expect(result.valid).toBe(true);
  });

  it("accepts a component with a primary code-location annotation", async () => {
    const entity = makeComponent({
      metadata: {
        name: "my-service",
        annotations: {
          "anchored-spec.dev/code-location": "src/my-service/",
        },
      },
    });
    const result = await validateBackstageEntity(entity, "entity-envelope");
    expect(result.valid).toBe(true);
  });

  it("validates all built-in kinds", async () => {
    const entities: BackstageEntity[] = [
      makeComponent(),
      {
        apiVersion: "backstage.io/v1alpha1",
        kind: "API",
        metadata: { name: "my-api" },
        spec: { type: "openapi", lifecycle: "production", owner: "team-a", definition: "openapi: 3.0" },
      },
      {
        apiVersion: "backstage.io/v1alpha1",
        kind: "Resource",
        metadata: { name: "my-db" },
        spec: { type: "database", owner: "team-a" },
      },
      {
        apiVersion: "backstage.io/v1alpha1",
        kind: "System",
        metadata: { name: "my-system" },
        spec: { owner: "team-a" },
      },
      {
        apiVersion: "backstage.io/v1alpha1",
        kind: "Domain",
        metadata: { name: "my-domain" },
        spec: { owner: "team-a" },
      },
      {
        apiVersion: "backstage.io/v1alpha1",
        kind: "Group",
        metadata: { name: "my-group" },
        spec: { type: "team", children: [] },
      },
    ];

    for (const entity of entities) {
      const result = await validateBackstageEntity(entity);
      expect(result.valid, `${entity.kind} should be valid`).toBe(true);
    }
  });

  it("validates all custom kinds", async () => {
    const customEntities: BackstageEntity[] = [
      makeRequirement(),
      {
        apiVersion: "anchored-spec.dev/v1alpha1",
        kind: "Decision",
        metadata: { name: "use-postgres" },
        spec: { owner: "team-a", status: "accepted" },
      },
      {
        apiVersion: "anchored-spec.dev/v1alpha1",
        kind: "CanonicalEntity",
        metadata: { name: "customer" },
        spec: { owner: "team-a" },
      },
      {
        apiVersion: "anchored-spec.dev/v1alpha1",
        kind: "Exchange",
        metadata: { name: "order-feed" },
        spec: { owner: "team-a" },
      },
      {
        apiVersion: "anchored-spec.dev/v1alpha1",
        kind: "Capability",
        metadata: { name: "payments" },
        spec: { owner: "team-a" },
      },
      {
        apiVersion: "anchored-spec.dev/v1alpha1",
        kind: "ValueStream",
        metadata: { name: "order-to-cash" },
        spec: { owner: "team-a" },
      },
      {
        apiVersion: "anchored-spec.dev/v1alpha1",
        kind: "Mission",
        metadata: { name: "cloud-first" },
        spec: { owner: "team-a" },
      },
      {
        apiVersion: "anchored-spec.dev/v1alpha1",
        kind: "Technology",
        metadata: { name: "kubernetes" },
        spec: { owner: "team-a" },
      },
      {
        apiVersion: "anchored-spec.dev/v1alpha1",
        kind: "SystemInterface",
        metadata: { name: "payment-gateway" },
        spec: { owner: "team-a" },
      },
      {
        apiVersion: "anchored-spec.dev/v1alpha1",
        kind: "Control",
        metadata: { name: "access-control" },
        spec: { owner: "team-a" },
      },
      {
        apiVersion: "anchored-spec.dev/v1alpha1",
        kind: "TransitionPlan",
        metadata: { name: "cloud-migration" },
        spec: { owner: "team-a" },
      },
      {
        apiVersion: "anchored-spec.dev/v1alpha1",
        kind: "Exception",
        metadata: { name: "sunset-db-exception" },
        spec: { owner: "team-a" },
      },
    ];

    for (const entity of customEntities) {
      const result = await validateBackstageEntity(entity);
      expect(result.valid, `${entity.kind} should be valid`).toBe(true);
    }
  });
});

// ─── validateBackstageEntities — Quality Rules ──────────────────────────────────

describe("validateBackstageEntities", () => {
  it("detects duplicate entity refs", () => {
    const entities = [makeComponent(), makeComponent()];
    const result = validateBackstageEntities(entities);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === "backstage:quality:duplicate-name")).toBe(true);
  });

  it("passes with unique entity refs", () => {
    const entities = [
      makeComponent(),
      makeComponent({ metadata: { name: "other-service" } }),
    ];
    const result = validateBackstageEntities(entities);
    const dupErrors = result.errors.filter((e) => e.rule === "backstage:quality:duplicate-name");
    expect(dupErrors).toHaveLength(0);
  });

  it("detects invalid entity name format", () => {
    const entity = makeComponent({ metadata: { name: "Invalid Name!" } });
    const result = validateBackstageEntities([entity]);
    expect(result.errors.some((e) => e.rule === "backstage:quality:name-format")).toBe(true);
  });

  it("accepts valid entity names", () => {
    const entities = [
      makeComponent({ metadata: { name: "my-service" } }),
      makeComponent({ metadata: { name: "service.v2" } }),
      makeComponent({ metadata: { name: "a1" } }),
    ];
    for (const entity of entities) {
      const result = validateBackstageEntities([entity]);
      const nameErrors = result.errors.filter((e) => e.rule === "backstage:quality:name-format");
      expect(nameErrors, `Name "${entity.metadata.name}" should be valid`).toHaveLength(0);
    }
  });

  it("requires owner for active entities", () => {
    const entity = makeComponent({
      spec: { type: "service", lifecycle: "production" },
    });
    const result = validateBackstageEntities([entity]);
    expect(result.errors.some((e) => e.rule === "backstage:quality:active-needs-owner")).toBe(true);
  });

  it("does not require owner for draft entities", () => {
    const entity = makeComponent({
      spec: { type: "service", lifecycle: "experimental" },
    });
    const result = validateBackstageEntities([entity]);
    const ownerErrors = result.errors.filter((e) => e.rule === "backstage:quality:active-needs-owner");
    expect(ownerErrors).toHaveLength(0);
  });

  it("warns about active entities without description", () => {
    const entity = makeComponent({
      metadata: { name: "my-service" },
      spec: { type: "service", lifecycle: "production", owner: "team-a" },
    });
    const result = validateBackstageEntities([entity]);
    expect(result.warnings.some((e) => e.rule === "backstage:quality:active-needs-desc")).toBe(true);
  });

  it("warns about orphan entities", () => {
    const entity = makeComponent({
      spec: { type: "service", lifecycle: "experimental" },
    });
    const result = validateBackstageEntities([entity]);
    expect(result.warnings.some((e) => e.rule === "backstage:quality:orphan-entity")).toBe(true);
  });

  it("rejects invalid absolute code-location annotations", () => {
    const entity = makeComponent({
      metadata: {
        name: "my-service",
        title: "My Service",
        description: "A test service that does useful things",
        annotations: {
          "anchored-spec.dev/code-location": "/absolute/path",
        },
      },
    });
    const result = validateBackstageEntities([entity]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === "backstage:quality:code-location-format")).toBe(true);
  });

  it("does not flag entities with relations as orphans", () => {
    const entity = makeComponent({
      spec: {
        type: "service",
        lifecycle: "experimental",
        dependsOn: ["component:other-service"],
      },
    });
    const result = validateBackstageEntities([entity]);
    const orphanWarnings = result.warnings.filter((e) => e.rule === "backstage:quality:orphan-entity");
    expect(orphanWarnings).toHaveLength(0);
  });

  it("respects rule overrides via quality config", () => {
    const entities = [makeComponent(), makeComponent()];
    const result = validateBackstageEntities(entities, {
      quality: {
        rules: { "backstage:quality:duplicate-name": "off" },
      },
    });
    const dupErrors = result.errors.filter((e) => e.rule === "backstage:quality:duplicate-name");
    expect(dupErrors).toHaveLength(0);
  });

  it("promotes warnings to errors in strict mode", () => {
    const entity = makeComponent({
      metadata: { name: "my-service" },
      spec: { type: "service", lifecycle: "production", owner: "team-a" },
    });
    const result = validateBackstageEntities([entity], {
      quality: { strictMode: true },
    });
    // active-needs-desc (normally warning) should be promoted to error
    expect(result.errors.some((e) => e.rule === "backstage:quality:active-needs-desc")).toBe(true);
  });
});
