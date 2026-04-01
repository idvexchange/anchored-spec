import { describe, it, expect } from "vitest";
import {
  writeBackstageYaml,
  writeBackstageManifest,
  writeBackstageFrontmatter,
} from "../writer.js";
import {
  parseBackstageYaml,
  parseFrontmatterEntity,
  extractMarkdownBody,
} from "../parser.js";
import type { BackstageEntity } from "../types.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────────

const componentEntity: BackstageEntity = {
  apiVersion: "backstage.io/v1alpha1",
  kind: "Component",
  metadata: {
    name: "my-service",
    description: "A test service",
    annotations: {
      "anchored-spec.dev/source": "src/main.ts",
    },
    tags: ["typescript"],
  },
  spec: {
    type: "service",
    lifecycle: "production",
    owner: "team-platform",
    system: "core-platform",
    dependsOn: ["resource:default/my-database"],
  },
};

const apiEntity: BackstageEntity = {
  apiVersion: "backstage.io/v1alpha1",
  kind: "API",
  metadata: {
    name: "users-api",
    description: "User management API",
  },
  spec: {
    type: "openapi",
    lifecycle: "production",
    owner: "team-platform",
  },
};

const requirementEntity: BackstageEntity = {
  apiVersion: "anchored-spec.dev/v1alpha1",
  kind: "Requirement",
  metadata: {
    name: "req-auth-mfa",
    title: "Multi-Factor Authentication",
  },
  spec: {
    status: "approved",
    owner: "security-team",
  },
};

// ─── writeBackstageYaml ─────────────────────────────────────────────────────────

describe("writeBackstageYaml", () => {
  it("serializes an entity to valid YAML", () => {
    const yaml = writeBackstageYaml(componentEntity);

    expect(yaml).toContain("apiVersion: backstage.io/v1alpha1");
    expect(yaml).toContain("kind: Component");
    expect(yaml).toContain("name: my-service");
    expect(yaml).toContain("type: service");
  });

  it("outputs keys in canonical order", () => {
    const yaml = writeBackstageYaml(componentEntity);
    const lines = yaml.split("\n");

    const apiVersionLine = lines.findIndex((l) => l.startsWith("apiVersion:"));
    const kindLine = lines.findIndex((l) => l.startsWith("kind:"));
    const metadataLine = lines.findIndex((l) => l.startsWith("metadata:"));
    const specLine = lines.findIndex((l) => l.startsWith("spec:"));

    expect(apiVersionLine).toBeLessThan(kindLine);
    expect(kindLine).toBeLessThan(metadataLine);
    expect(metadataLine).toBeLessThan(specLine);
  });

  it("outputs metadata keys in readable order", () => {
    const yaml = writeBackstageYaml(componentEntity);
    const namePos = yaml.indexOf("  name:");
    const descPos = yaml.indexOf("  description:");
    const annotPos = yaml.indexOf("  annotations:");
    const tagsPos = yaml.indexOf("  tags:");

    expect(namePos).toBeLessThan(descPos);
    expect(descPos).toBeLessThan(annotPos);
    expect(annotPos).toBeLessThan(tagsPos);
  });

  it("ends with a newline", () => {
    const yaml = writeBackstageYaml(componentEntity);
    expect(yaml.endsWith("\n")).toBe(true);
  });

  it("does not include leading ---", () => {
    const yaml = writeBackstageYaml(componentEntity);
    expect(yaml.startsWith("---")).toBe(false);
  });

  it("respects custom indent option", () => {
    const yaml = writeBackstageYaml(componentEntity, { indent: 4 });
    expect(yaml).toContain("    name: my-service");
  });

  it("omits empty annotations/tags/labels", () => {
    const entity: BackstageEntity = {
      apiVersion: "backstage.io/v1alpha1",
      kind: "Component",
      metadata: {
        name: "bare",
        annotations: {},
        tags: [],
        labels: {},
      },
      spec: { type: "service" },
    };
    const yaml = writeBackstageYaml(entity);
    expect(yaml).not.toContain("annotations:");
    expect(yaml).not.toContain("tags:");
    expect(yaml).not.toContain("labels:");
  });

  it("preserves non-standard top-level keys", () => {
    const entity = {
      ...componentEntity,
      customField: "custom-value",
    } as BackstageEntity;
    const yaml = writeBackstageYaml(entity);
    expect(yaml).toContain("customField: custom-value");
  });

  it("preserves authored substitution objects instead of inlining them", () => {
    const entity: BackstageEntity = {
      ...apiEntity,
      spec: {
        ...apiEntity.spec,
        definition: { $text: "./specs/openapi.yaml" },
      },
    };

    const yaml = writeBackstageYaml(entity);

    expect(yaml).toContain("definition:");
    expect(yaml).toContain("$text: ./specs/openapi.yaml");
    expect(yaml).not.toContain('openapi: "3.1.0"');
  });

  it("omits derived top-level relations and status by default", () => {
    const entity = {
      ...componentEntity,
      relations: [{ type: "dependsOn", targetRef: "resource:default/my-database" }],
      status: {
        items: [{ type: "anchored-spec", level: "info", message: "derived" }],
      },
    } as BackstageEntity;

    const yaml = writeBackstageYaml(entity);

    expect(yaml).not.toContain("\nrelations:");
    expect(yaml).not.toContain("\nstatus:");
  });

  it("can include derived top-level relations and status when requested", () => {
    const entity = {
      ...componentEntity,
      relations: [{ type: "dependsOn", targetRef: "resource:default/my-database" }],
      status: {
        items: [{ type: "anchored-spec", level: "info", message: "derived" }],
      },
    } as BackstageEntity;

    const yaml = writeBackstageYaml(entity, { includeDerivedFields: true });

    expect(yaml).toContain("\nrelations:");
    expect(yaml).toContain("\nstatus:");
  });
});

// ─── writeBackstageManifest ─────────────────────────────────────────────────────

describe("writeBackstageManifest", () => {
  it("writes multi-doc YAML with --- separators", () => {
    const manifest = writeBackstageManifest([componentEntity, apiEntity]);

    expect(manifest.startsWith("---\n")).toBe(true);
    // Count --- markers
    const markers = manifest.match(/^---$/gm);
    expect(markers).toHaveLength(2);
  });

  it("returns empty string for no entities", () => {
    expect(writeBackstageManifest([])).toBe("");
  });

  it("handles single entity", () => {
    const manifest = writeBackstageManifest([componentEntity]);

    expect(manifest.startsWith("---\n")).toBe(true);
    expect(manifest).toContain("kind: Component");
  });

  it("serializes three entities in order", () => {
    const manifest = writeBackstageManifest([
      componentEntity,
      apiEntity,
      requirementEntity,
    ]);

    const kindPositions = [
      manifest.indexOf("kind: Component"),
      manifest.indexOf("kind: API"),
      manifest.indexOf("kind: Requirement"),
    ];

    expect(kindPositions[0]).toBeLessThan(kindPositions[1]);
    expect(kindPositions[1]).toBeLessThan(kindPositions[2]);
  });
});

// ─── writeBackstageFrontmatter ──────────────────────────────────────────────────

describe("writeBackstageFrontmatter", () => {
  it("writes entity as frontmatter with body", () => {
    const output = writeBackstageFrontmatter(
      componentEntity,
      "\n# My Service\n\nDocumentation here.\n",
    );

    expect(output.startsWith("---\n")).toBe(true);
    expect(output).toContain("kind: Component");
    expect(output).toContain("\n---\n");
    expect(output).toContain("# My Service");
    expect(output).toContain("Documentation here.");
  });

  it("writes entity as frontmatter without body", () => {
    const output = writeBackstageFrontmatter(componentEntity);

    expect(output.startsWith("---\n")).toBe(true);
    expect(output).toContain("kind: Component");
    expect(output.endsWith("---\n")).toBe(true);
  });

  it("preserves empty body as trailing ---", () => {
    const output = writeBackstageFrontmatter(componentEntity, "");
    expect(output.endsWith("---\n")).toBe(true);
  });
});

// ─── Round-trips ────────────────────────────────────────────────────────────────

describe("round-trips", () => {
  it("write → parse preserves single entity", () => {
    const yaml = writeBackstageYaml(componentEntity);
    const result = parseBackstageYaml(yaml);

    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(1);

    const parsed = result.entities[0].entity;
    expect(parsed.apiVersion).toBe(componentEntity.apiVersion);
    expect(parsed.kind).toBe(componentEntity.kind);
    expect(parsed.metadata.name).toBe(componentEntity.metadata.name);
    expect(parsed.spec?.type).toBe(componentEntity.spec?.type);
    expect(parsed.spec?.dependsOn).toEqual(componentEntity.spec?.dependsOn);
  });

  it("manifest write → parse preserves all entities", () => {
    const manifest = writeBackstageManifest([
      componentEntity,
      apiEntity,
      requirementEntity,
    ]);
    const result = parseBackstageYaml(manifest);

    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(3);
    expect(result.entities[0].entity.kind).toBe("Component");
    expect(result.entities[1].entity.kind).toBe("API");
    expect(result.entities[2].entity.kind).toBe("Requirement");
  });

  it("frontmatter write → parse + extractBody preserves both", () => {
    const body = "\n# My Service\n\nDocumentation here.\n";
    const output = writeBackstageFrontmatter(componentEntity, body);

    const parseResult = parseFrontmatterEntity(output);
    expect(parseResult.errors).toHaveLength(0);
    expect(parseResult.entities).toHaveLength(1);
    expect(parseResult.entities[0].entity.kind).toBe("Component");

    const extractedBody = extractMarkdownBody(output);
    expect(extractedBody).toBe(body);
  });

  it("frontmatter round-trip preserves body without blank line", () => {
    const body = "Immediate content.\n";
    const output = writeBackstageFrontmatter(componentEntity, body);
    const extractedBody = extractMarkdownBody(output);
    expect(extractedBody).toBe(body);
  });

  it("parse → write → parse produces equivalent entities", () => {
    const original = `---\napiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: test-svc\nspec:\n  type: service\n  lifecycle: production\n  owner: team-a\n`;
    const result1 = parseBackstageYaml(original);
    expect(result1.entities).toHaveLength(1);

    const written = writeBackstageYaml(result1.entities[0].entity);
    const result2 = parseBackstageYaml(written);
    expect(result2.entities).toHaveLength(1);

    expect(result2.entities[0].entity).toEqual(result1.entities[0].entity);
  });

  it("round-trips authored substitution objects unchanged", () => {
    const entity: BackstageEntity = {
      ...apiEntity,
      spec: {
        ...apiEntity.spec,
        definition: { $text: "./specs/openapi.yaml" },
      },
    };

    const yaml = writeBackstageYaml(entity);
    const result = parseBackstageYaml(yaml);

    expect(result.errors).toHaveLength(0);
    expect(result.entities[0].entity.spec.definition).toEqual({
      $text: "./specs/openapi.yaml",
    });
  });
});
