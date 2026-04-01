import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SCHEMA_DIR = join(__dirname, "../../schemas/backstage");

function loadSchema(filename: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, filename), "utf-8"));
}

describe("Backstage JSON Schemas", () => {
  const schemaFiles = readdirSync(SCHEMA_DIR).filter((f) =>
    f.endsWith(".schema.json"),
  );

  it("has all expected schema files", () => {
    const expected = [
      "entity-envelope.schema.json",
      "component.schema.json",
      "api.schema.json",
      "resource.schema.json",
      "system.schema.json",
      "domain.schema.json",
      "group.schema.json",
      "requirement.schema.json",
      "decision.schema.json",
      "canonical-entity.schema.json",
      "exchange.schema.json",
      "capability.schema.json",
      "value-stream.schema.json",
      "mission.schema.json",
      "technology.schema.json",
      "system-interface.schema.json",
      "control.schema.json",
      "transition-plan.schema.json",
      "exception.schema.json",
    ];
    for (const file of expected) {
      expect(schemaFiles, `Missing schema: ${file}`).toContain(file);
    }
  });

  it("all schemas are valid JSON Schema", () => {
    for (const file of schemaFiles) {
      const schema = loadSchema(file);
      expect(schema.$schema, `${file} missing $schema`).toBeDefined();
      expect(schema.$id, `${file} missing $id`).toBeDefined();
    }
  });

  describe("entity-envelope schema validates correctly", () => {
    const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
    addFormats(ajv);

    // Load and register the envelope schema directly
    const envelopeSchema = loadSchema("entity-envelope.schema.json");
    const validate = ajv.compile(envelopeSchema);

    it("accepts a valid Component entity", () => {
      const entity = {
        apiVersion: "backstage.io/v1alpha1",
        kind: "Component",
        metadata: { name: "my-service" },
        spec: { type: "service", lifecycle: "production", owner: "team-a" },
      };
      const valid = validate(entity);
      expect(valid).toBe(true);
    });

    it("accepts a valid custom kind entity", () => {
      const entity = {
        apiVersion: "anchored-spec.dev/v1alpha1",
        kind: "Requirement",
        metadata: { name: "req-001", title: "Auth requirement" },
        spec: { status: "approved", owner: "security" },
      };
      const valid = validate(entity);
      expect(valid).toBe(true);
    });

    it("rejects entity without apiVersion", () => {
      const entity = {
        kind: "Component",
        metadata: { name: "test" },
        spec: {},
      };
      expect(validate(entity)).toBe(false);
    });

    it("rejects entity without kind", () => {
      const entity = {
        apiVersion: "backstage.io/v1alpha1",
        metadata: { name: "test" },
        spec: {},
      };
      expect(validate(entity)).toBe(false);
    });

    it("rejects entity without metadata", () => {
      const entity = {
        apiVersion: "backstage.io/v1alpha1",
        kind: "Component",
        spec: {},
      };
      expect(validate(entity)).toBe(false);
    });

    it("rejects entity without metadata.name", () => {
      const entity = {
        apiVersion: "backstage.io/v1alpha1",
        kind: "Component",
        metadata: { description: "no name" },
        spec: {},
      };
      expect(validate(entity)).toBe(false);
    });

    it("accepts entity with anchored-spec annotations", () => {
      const entity = {
        apiVersion: "backstage.io/v1alpha1",
        kind: "Component",
        metadata: {
          name: "annotated-svc",
          annotations: {
            "anchored-spec.dev/confidence": "0.85",
            "anchored-spec.dev/risk": "moderate",
            "anchored-spec.dev/source": "src/main.ts",
          },
        },
        spec: {},
      };
      expect(validate(entity)).toBe(true);
    });

    it("accepts entity with tags and links", () => {
      const entity = {
        apiVersion: "backstage.io/v1alpha1",
        kind: "Component",
        metadata: {
          name: "rich-svc",
          tags: ["typescript", "grpc"],
          links: [
            { url: "https://example.com/docs", title: "Docs" },
          ],
        },
        spec: {},
      };
      expect(validate(entity)).toBe(true);
    });
  });
});
