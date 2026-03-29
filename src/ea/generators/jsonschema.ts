/**
 * Anchored Spec — JSON Schema Generator
 *
 * Generates JSON Schema from `canonical-entity` EA artifacts.
 * Maps attributes to JSON Schema properties with type mapping,
 * required array, and links back to the source artifact.
 *
 * Design reference: docs/ea-phase2f-drift-generators-subsumption.md (JSON Schema Generator)
 */

import type { EaArtifactBase } from "../types.js";
import type {
  EaGenerator,
  EaGeneratorContext,
  GeneratedOutput,
  GenerationDrift,
} from "./index.js";

/** Shape of a canonical-entity's attributes. */
interface CanonicalEntityFields {
  attributes?: Array<{
    name: string;
    type: string;
    required?: boolean;
    description?: string;
    classification?: string;
    example?: string;
  }>;
  entityVersion?: string;
}

/** Map EA attribute types to JSON Schema types and formats. */
const TYPE_MAP: Record<string, { type: string; format?: string }> = {
  uuid: { type: "string", format: "uuid" },
  string: { type: "string" },
  text: { type: "string" },
  email: { type: "string", format: "email" },
  url: { type: "string", format: "uri" },
  uri: { type: "string", format: "uri" },
  date: { type: "string", format: "date" },
  datetime: { type: "string", format: "date-time" },
  timestamp: { type: "string", format: "date-time" },
  integer: { type: "integer" },
  int: { type: "integer" },
  number: { type: "number" },
  float: { type: "number" },
  double: { type: "number" },
  decimal: { type: "number" },
  boolean: { type: "boolean" },
  bool: { type: "boolean" },
  array: { type: "array" },
  object: { type: "object" },
  json: { type: "object" },
  binary: { type: "string", format: "binary" },
  enum: { type: "string" },
};

/**
 * JSON Schema Generator — generates JSON Schema from canonical-entity artifacts.
 *
 * - Maps each attribute to a JSON Schema property
 * - Maps attribute type fields to JSON Schema types
 * - Sets required array from attributes with required: true
 * - Adds title and description from artifact fields
 * - Links back via $comment
 */
export const jsonSchemaGenerator: EaGenerator = {
  name: "jsonschema",
  kinds: ["canonical-entity"],
  outputFormat: "json-schema",

  generate(artifact: EaArtifactBase, ctx: EaGeneratorContext): GeneratedOutput[] {
    const fields = artifact as EaArtifactBase & CanonicalEntityFields;
    const attributes = fields.attributes ?? [];

    // Build JSON Schema
    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];

    for (const attr of attributes) {
      const mapped = TYPE_MAP[attr.type.toLowerCase()] ?? { type: "string" };
      const prop: Record<string, unknown> = { type: mapped.type };

      if (mapped.format) prop.format = mapped.format;
      if (attr.description) prop.description = attr.description;
      if (attr.example !== undefined) prop.examples = [attr.example];
      if (attr.classification) prop["x-classification"] = attr.classification;

      properties[attr.name] = prop;

      if (attr.required) {
        required.push(attr.name);
      }
    }

    const schema: Record<string, unknown> = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: `https://anchored-spec.dev/schemas/entities/${slugify(artifact.id)}.schema.json`,
      title: artifact.title,
      description: artifact.summary ?? "",
      $comment: `Generated from EA artifact: ${artifact.id}`,
      type: "object",
      properties,
    };

    if (required.length > 0) {
      schema.required = required;
    }

    schema.additionalProperties = false;

    const content = JSON.stringify(schema, null, 2) + "\n";
    const slug = artifact.id.replace(/\//g, "-");

    return [
      {
        relativePath: `${slug}.schema.json`,
        content,
        contentType: "json",
        sourceArtifactId: artifact.id,
        description: `JSON Schema for ${artifact.title}`,
        overwrite: true,
      },
    ];
  },

  diff(currentOutput: string, artifact: EaArtifactBase, ctx: EaGeneratorContext): GenerationDrift[] {
    const drifts: GenerationDrift[] = [];
    const generated = this.generate(artifact, ctx);
    if (generated.length === 0) return [];

    const slug = artifact.id.replace(/\//g, "-");

    try {
      const currentParsed = JSON.parse(currentOutput);
      const expectedParsed = JSON.parse(generated[0]!.content);

      // Compare key structural elements
      const currentProps = Object.keys(currentParsed.properties ?? {}).sort();
      const expectedProps = Object.keys(expectedParsed.properties ?? {}).sort();

      if (JSON.stringify(currentProps) !== JSON.stringify(expectedProps)) {
        drifts.push({
          filePath: `${slug}.schema.json`,
          sourceArtifactId: artifact.id,
          message: `Schema properties differ: expected [${expectedProps.join(", ")}], found [${currentProps.join(", ")}]`,
          suggestion: "review",
        });
      }

      if (JSON.stringify(currentParsed.required?.sort()) !== JSON.stringify(expectedParsed.required?.sort())) {
        drifts.push({
          filePath: `${slug}.schema.json`,
          sourceArtifactId: artifact.id,
          message: "Schema required fields differ from spec",
          suggestion: "review",
        });
      }
    } catch {
      drifts.push({
        filePath: `${slug}.schema.json`,
        sourceArtifactId: artifact.id,
        message: "Cannot parse existing schema as JSON",
        suggestion: "regenerate",
      });
    }

    return drifts;
  },
};

function slugify(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
