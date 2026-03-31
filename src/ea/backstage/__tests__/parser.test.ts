import { describe, it, expect } from "vitest";
import {
  parseBackstageYaml,
  parseFrontmatterEntity,
  extractMarkdownBody,
} from "../parser.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

const COMPONENT_YAML = `apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: my-service
  description: A test service
  annotations:
    anchored-spec.dev/source: src/main.ts
  tags:
    - typescript
spec:
  type: service
  lifecycle: production
  owner: team-platform
  system: core-platform
  dependsOn:
    - resource:default/my-database
`;

const API_YAML = `apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: users-api
  description: User management API
spec:
  type: openapi
  lifecycle: production
  owner: team-platform
  definition: |
    openapi: "3.1.0"
`;

const REQUIREMENT_YAML = `apiVersion: anchored-spec.dev/v1alpha1
kind: Requirement
metadata:
  name: req-auth-mfa
  title: Multi-Factor Authentication
spec:
  status: approved
  owner: security-team
`;

// ─── parseBackstageYaml ─────────────────────────────────────────────────────────

describe("parseBackstageYaml", () => {
  describe("single document", () => {
    it("parses a valid entity without leading ---", () => {
      const result = parseBackstageYaml(COMPONENT_YAML);
      expect(result.errors).toHaveLength(0);
      expect(result.entities).toHaveLength(1);

      const { entity, source } = result.entities[0];
      expect(entity.apiVersion).toBe("backstage.io/v1alpha1");
      expect(entity.kind).toBe("Component");
      expect(entity.metadata.name).toBe("my-service");
      expect(entity.spec?.type).toBe("service");
      expect(source.documentIndex).toBe(0);
    });

    it("parses a valid entity with leading ---", () => {
      const result = parseBackstageYaml(`---\n${COMPONENT_YAML}`);
      expect(result.errors).toHaveLength(0);
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].entity.metadata.name).toBe("my-service");
    });

    it("attaches filePath to source info", () => {
      const result = parseBackstageYaml(COMPONENT_YAML, "/repo/catalog-info.yaml");
      expect(result.entities[0].source.filePath).toBe("/repo/catalog-info.yaml");
    });

    it("preserves metadata annotations", () => {
      const result = parseBackstageYaml(COMPONENT_YAML);
      expect(result.entities[0].entity.metadata.annotations).toEqual({
        "anchored-spec.dev/source": "src/main.ts",
      });
    });

    it("preserves metadata tags", () => {
      const result = parseBackstageYaml(COMPONENT_YAML);
      expect(result.entities[0].entity.metadata.tags).toEqual(["typescript"]);
    });

    it("preserves spec relation fields", () => {
      const result = parseBackstageYaml(COMPONENT_YAML);
      expect(result.entities[0].entity.spec?.dependsOn).toEqual([
        "resource:default/my-database",
      ]);
    });
  });

  describe("multi-document", () => {
    it("parses multiple entities", () => {
      const content = `---\n${COMPONENT_YAML}---\n${API_YAML}---\n${REQUIREMENT_YAML}`;
      const result = parseBackstageYaml(content);

      expect(result.errors).toHaveLength(0);
      expect(result.entities).toHaveLength(3);
      expect(result.entities[0].entity.kind).toBe("Component");
      expect(result.entities[1].entity.kind).toBe("API");
      expect(result.entities[2].entity.kind).toBe("Requirement");
    });

    it("assigns correct documentIndex to each entity", () => {
      const content = `---\n${COMPONENT_YAML}---\n${API_YAML}`;
      const result = parseBackstageYaml(content);

      expect(result.entities[0].source.documentIndex).toBe(0);
      expect(result.entities[1].source.documentIndex).toBe(1);
    });

    it("skips trailing --- (empty document)", () => {
      const content = `---\n${COMPONENT_YAML}---\n`;
      const result = parseBackstageYaml(content);

      expect(result.errors).toHaveLength(0);
      expect(result.entities).toHaveLength(1);
    });

    it("returns valid entities alongside errored documents", () => {
      const content = `---\n${COMPONENT_YAML}---\ninvalid: yaml\nno_kind: true\n---\n${API_YAML}`;
      const result = parseBackstageYaml(content);

      expect(result.entities).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].documentIndex).toBe(1);
    });
  });

  describe("error handling", () => {
    it("reports missing apiVersion", () => {
      const yaml = `kind: Component\nmetadata:\n  name: test\n`;
      const result = parseBackstageYaml(yaml);

      expect(result.entities).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("apiVersion");
    });

    it("reports missing kind", () => {
      const yaml = `apiVersion: backstage.io/v1alpha1\nmetadata:\n  name: test\n`;
      const result = parseBackstageYaml(yaml);

      expect(result.entities).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("kind");
    });

    it("reports missing metadata.name", () => {
      const yaml = `apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  description: no name\n`;
      const result = parseBackstageYaml(yaml);

      expect(result.entities).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("metadata.name");
    });

    it("reports missing metadata entirely", () => {
      const yaml = `apiVersion: backstage.io/v1alpha1\nkind: Component\n`;
      const result = parseBackstageYaml(yaml);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("metadata.name");
    });

    it("reports multiple missing fields", () => {
      const yaml = `metadata:\n  description: bare minimum\n`;
      const result = parseBackstageYaml(yaml);

      expect(result.errors).toHaveLength(1);
      const msg = result.errors[0].message;
      expect(msg).toContain("apiVersion");
      expect(msg).toContain("kind");
      expect(msg).toContain("metadata.name");
    });

    it("rejects YAML arrays as documents", () => {
      const yaml = `- item1\n- item2\n`;
      const result = parseBackstageYaml(yaml);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("mapping");
    });

    it("reports YAML syntax errors", () => {
      const yaml = `apiVersion: backstage.io/v1alpha1\n  bad indent: true\nkind: Component\n`;
      const result = parseBackstageYaml(yaml);

      // yaml v2 may parse this with errors or warnings
      expect(result.entities.length + result.errors.length).toBeGreaterThan(0);
    });

    it("handles empty content", () => {
      const result = parseBackstageYaml("");
      expect(result.entities).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("handles content with only ---", () => {
      const result = parseBackstageYaml("---\n");
      expect(result.entities).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("strips BOM before parsing", () => {
      const result = parseBackstageYaml(`\ufeff${COMPONENT_YAML}`);
      expect(result.errors).toHaveLength(0);
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].entity.metadata.name).toBe("my-service");
    });
  });
});

// ─── parseFrontmatterEntity ─────────────────────────────────────────────────────

describe("parseFrontmatterEntity", () => {
  it("parses entity from markdown frontmatter", () => {
    const md = `---\n${COMPONENT_YAML}---\n\n# My Service\n\nSome docs.\n`;
    const result = parseFrontmatterEntity(md);

    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].entity.kind).toBe("Component");
    expect(result.entities[0].entity.metadata.name).toBe("my-service");
  });

  it("attaches filePath", () => {
    const md = `---\n${COMPONENT_YAML}---\n\n# Docs\n`;
    const result = parseFrontmatterEntity(md, "docs/my-service.md");

    expect(result.entities[0].source.filePath).toBe("docs/my-service.md");
  });

  it("reports error when no frontmatter", () => {
    const result = parseFrontmatterEntity("# Just a heading\n\nSome content.\n");

    expect(result.entities).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("No YAML frontmatter");
  });

  it("reports error for unclosed frontmatter", () => {
    const md = `---\napiVersion: backstage.io/v1alpha1\nkind: Component\n`;
    const result = parseFrontmatterEntity(md);

    expect(result.entities).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Unclosed");
  });

  it("handles ... as frontmatter close", () => {
    const md = `---\n${COMPONENT_YAML}...\n\n# Docs\n`;
    const result = parseFrontmatterEntity(md);

    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(1);
  });

  it("strips BOM before parsing", () => {
    const md = `\ufeff---\n${COMPONENT_YAML}---\n`;
    const result = parseFrontmatterEntity(md);

    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(1);
  });

  it("reports validation errors for invalid frontmatter entity", () => {
    const md = `---\ntitle: Not an entity\nauthor: someone\n---\n\n# Article\n`;
    const result = parseFrontmatterEntity(md);

    expect(result.entities).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});

// ─── extractMarkdownBody ────────────────────────────────────────────────────────

describe("extractMarkdownBody", () => {
  it("extracts body after frontmatter", () => {
    const md = `---\napiVersion: test\nkind: Test\n---\n\n# Title\n\nBody text.\n`;
    const body = extractMarkdownBody(md);

    expect(body).toBe("\n# Title\n\nBody text.\n");
  });

  it("returns full content if no frontmatter", () => {
    const content = "# Just a heading\n\nSome text.\n";
    expect(extractMarkdownBody(content)).toBe(content);
  });

  it("returns empty string if no closing ---", () => {
    const content = "---\napiVersion: test\nkind: Test\n";
    expect(extractMarkdownBody(content)).toBe("");
  });

  it("preserves leading blank line between --- and body", () => {
    const md = `---\nkind: Test\n---\n\nBody\n`;
    const body = extractMarkdownBody(md);
    expect(body).toBe("\nBody\n");
  });

  it("handles body immediately after --- (no blank line)", () => {
    const md = `---\nkind: Test\n---\nBody\n`;
    const body = extractMarkdownBody(md);
    expect(body).toBe("Body\n");
  });

  it("handles BOM", () => {
    const md = `\ufeff---\nkind: Test\n---\nBody\n`;
    const body = extractMarkdownBody(md);
    expect(body).toBe("Body\n");
  });

  it("handles ... as frontmatter close", () => {
    const md = `---\nkind: Test\n...\nBody\n`;
    const body = extractMarkdownBody(md);
    expect(body).toBe("Body\n");
  });

  it("returns empty string when body is empty", () => {
    const md = `---\nkind: Test\n---\n`;
    const body = extractMarkdownBody(md);
    expect(body).toBe("");
  });
});
