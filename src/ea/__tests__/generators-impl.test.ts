import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { silentLogger } from "../resolvers/types.js";
import type { EaArtifactBase } from "../types.js";
import type { EaGeneratorContext } from "../generators/index.js";
import { openapiGenerator } from "../generators/openapi.js";
import { jsonSchemaGenerator } from "../generators/jsonschema.js";
import { runGenerators, getGenerator } from "../generators/index.js";

const TEST_ROOT = join(tmpdir(), `ea-genimpl-test-${Date.now()}`);

function makeCtx(overrides?: Partial<EaGeneratorContext>): EaGeneratorContext {
  return {
    projectRoot: TEST_ROOT,
    artifacts: [],
    outputDir: "generated",
    logger: silentLogger,
    ...overrides,
  };
}

// ─── OpenAPI Generator ──────────────────────────────────────────────────────────

describe("openapiGenerator", () => {
  it("should have correct metadata", () => {
    expect(openapiGenerator.name).toBe("openapi");
    expect(openapiGenerator.kinds).toEqual(["api-contract"]);
    expect(openapiGenerator.outputFormat).toBe("openapi");
  });

  it("should generate OpenAPI YAML from api-contract", () => {
    const artifact = {
      id: "systems/API-orders",
      kind: "api-contract",
      title: "Orders API",
      summary: "Order management API",
      status: "active",
      owners: ["team-commerce"],
      anchors: { apis: ["GET /orders", "POST /orders", "GET /orders/{orderId}"] },
      version: "2.0.0",
    } as EaArtifactBase & { version: string };

    const outputs = openapiGenerator.generate(artifact, makeCtx());
    expect(outputs.length).toBe(1);

    const output = outputs[0]!;
    expect(output.relativePath).toBe("systems-API-orders.openapi.yaml");
    expect(output.contentType).toBe("yaml");
    expect(output.sourceArtifactId).toBe("systems/API-orders");
    expect(output.overwrite).toBe(true);

    // Check content
    const content = output.content;
    expect(content).toContain('openapi: "3.1.0"');
    expect(content).toContain('title: "Orders API"');
    expect(content).toContain('version: "2.0.0"');
    expect(content).toContain('x-anchored-spec-artifact: "systems/API-orders"');
    expect(content).toContain("paths:");
    expect(content).toContain("  /orders:");
    expect(content).toContain("    get:");
    expect(content).toContain("    post:");
    expect(content).toContain("  /orders/{orderId}:");
  });

  it("should skip non-REST protocols", () => {
    const artifact = {
      id: "systems/API-graphql",
      kind: "api-contract",
      title: "GraphQL API",
      status: "active",
      owners: ["team"],
      anchors: {},
      protocol: "graphql",
    } as EaArtifactBase & { protocol: string };

    const outputs = openapiGenerator.generate(artifact, makeCtx());
    expect(outputs.length).toBe(0);
  });

  it("should skip non-openapi spec formats", () => {
    const artifact = {
      id: "systems/API-grpc",
      kind: "api-contract",
      title: "gRPC API",
      status: "active",
      owners: ["team"],
      anchors: {},
      specFormat: "protobuf",
    } as EaArtifactBase & { specFormat: string };

    const outputs = openapiGenerator.generate(artifact, makeCtx());
    expect(outputs.length).toBe(0);
  });

  it("should generate empty paths when no apis anchors", () => {
    const artifact = {
      id: "systems/API-empty",
      kind: "api-contract",
      title: "Empty API",
      status: "active",
      owners: ["team"],
      anchors: {},
    } as EaArtifactBase;

    const outputs = openapiGenerator.generate(artifact, makeCtx());
    expect(outputs.length).toBe(1);
    expect(outputs[0]!.content).toContain("paths: {}");
  });

  it("should be idempotent", () => {
    const artifact = {
      id: "systems/API-test",
      kind: "api-contract",
      title: "Test API",
      status: "active",
      owners: ["team"],
      anchors: { apis: ["GET /users", "POST /users"] },
      version: "1.0.0",
    } as EaArtifactBase & { version: string };

    const ctx = makeCtx();
    const output1 = openapiGenerator.generate(artifact, ctx)[0]!.content;
    const output2 = openapiGenerator.generate(artifact, ctx)[0]!.content;
    expect(output1).toBe(output2);
  });

  it("should generate operationIds", () => {
    const artifact = {
      id: "systems/API-test",
      kind: "api-contract",
      title: "Test API",
      status: "active",
      owners: ["team"],
      anchors: { apis: ["GET /users/{userId}"] },
    } as EaArtifactBase;

    const output = openapiGenerator.generate(artifact, makeCtx())[0]!;
    expect(output.content).toContain("operationId:");
  });

  it("should detect drift when content differs", () => {
    const artifact = {
      id: "systems/API-orders",
      kind: "api-contract",
      title: "Orders API",
      status: "active",
      owners: ["team"],
      anchors: { apis: ["GET /orders"] },
    } as EaArtifactBase;

    const drifts = openapiGenerator.diff!("manually modified content", artifact, makeCtx());
    expect(drifts.length).toBe(1);
    expect(drifts[0]!.suggestion).toBe("review");
  });

  it("should report no drift when content matches", () => {
    const artifact = {
      id: "systems/API-orders",
      kind: "api-contract",
      title: "Orders API",
      status: "active",
      owners: ["team"],
      anchors: { apis: ["GET /orders"] },
    } as EaArtifactBase;

    const generated = openapiGenerator.generate(artifact, makeCtx())[0]!.content;
    const drifts = openapiGenerator.diff!(generated, artifact, makeCtx());
    expect(drifts.length).toBe(0);
  });
});

// ─── JSON Schema Generator ──────────────────────────────────────────────────────

describe("jsonSchemaGenerator", () => {
  it("should have correct metadata", () => {
    expect(jsonSchemaGenerator.name).toBe("jsonschema");
    expect(jsonSchemaGenerator.kinds).toEqual(["canonical-entity"]);
    expect(jsonSchemaGenerator.outputFormat).toBe("json-schema");
  });

  it("should generate JSON Schema from canonical-entity", () => {
    const artifact = {
      id: "information/CE-user",
      kind: "canonical-entity",
      title: "User",
      summary: "User entity",
      status: "active",
      owners: ["team-data"],
      anchors: {},
      attributes: [
        { name: "id", type: "uuid", required: true, description: "User ID" },
        { name: "email", type: "email", required: true, description: "Email address" },
        { name: "name", type: "string", required: false, description: "Full name" },
        { name: "age", type: "integer", description: "User age" },
        { name: "score", type: "decimal", description: "User score" },
        { name: "active", type: "boolean", required: true },
        { name: "createdAt", type: "datetime", description: "Registration date" },
      ],
    } as EaArtifactBase & { attributes: Array<Record<string, unknown>> };

    const outputs = jsonSchemaGenerator.generate(artifact, makeCtx());
    expect(outputs.length).toBe(1);

    const output = outputs[0]!;
    expect(output.relativePath).toBe("information-CE-user.schema.json");
    expect(output.contentType).toBe("json");

    const schema = JSON.parse(output.content);
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.title).toBe("User");
    expect(schema.type).toBe("object");
    expect(schema.$comment).toContain("information/CE-user");

    // Check property types
    expect(schema.properties.id.type).toBe("string");
    expect(schema.properties.id.format).toBe("uuid");
    expect(schema.properties.email.format).toBe("email");
    expect(schema.properties.name.type).toBe("string");
    expect(schema.properties.age.type).toBe("integer");
    expect(schema.properties.score.type).toBe("number");
    expect(schema.properties.active.type).toBe("boolean");
    expect(schema.properties.createdAt.format).toBe("date-time");

    // Check required
    expect(schema.required).toEqual(["id", "email", "active"]);
    expect(schema.additionalProperties).toBe(false);
  });

  it("should handle entity with no attributes", () => {
    const artifact = {
      id: "information/CE-empty",
      kind: "canonical-entity",
      title: "Empty Entity",
      status: "active",
      owners: ["team"],
      anchors: {},
    } as EaArtifactBase;

    const outputs = jsonSchemaGenerator.generate(artifact, makeCtx());
    expect(outputs.length).toBe(1);
    const schema = JSON.parse(outputs[0]!.content);
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });

  it("should map unknown types to string", () => {
    const artifact = {
      id: "information/CE-custom",
      kind: "canonical-entity",
      title: "Custom",
      status: "active",
      owners: ["team"],
      anchors: {},
      attributes: [{ name: "custom", type: "my-custom-type" }],
    } as EaArtifactBase & { attributes: Array<Record<string, unknown>> };

    const outputs = jsonSchemaGenerator.generate(artifact, makeCtx());
    const schema = JSON.parse(outputs[0]!.content);
    expect(schema.properties.custom.type).toBe("string");
  });

  it("should be idempotent", () => {
    const artifact = {
      id: "information/CE-order",
      kind: "canonical-entity",
      title: "Order",
      status: "active",
      owners: ["team"],
      anchors: {},
      attributes: [
        { name: "id", type: "uuid", required: true },
        { name: "total", type: "decimal" },
      ],
    } as EaArtifactBase & { attributes: Array<Record<string, unknown>> };

    const ctx = makeCtx();
    const out1 = jsonSchemaGenerator.generate(artifact, ctx)[0]!.content;
    const out2 = jsonSchemaGenerator.generate(artifact, ctx)[0]!.content;
    expect(out1).toBe(out2);
  });

  it("should include x-classification from attribute", () => {
    const artifact = {
      id: "information/CE-pii",
      kind: "canonical-entity",
      title: "PII Entity",
      status: "active",
      owners: ["team"],
      anchors: {},
      attributes: [{ name: "ssn", type: "string", classification: "pii" }],
    } as EaArtifactBase & { attributes: Array<Record<string, unknown>> };

    const outputs = jsonSchemaGenerator.generate(artifact, makeCtx());
    const schema = JSON.parse(outputs[0]!.content);
    expect(schema.properties.ssn["x-classification"]).toBe("pii");
  });

  it("should detect drift when properties differ", () => {
    const artifact = {
      id: "information/CE-user",
      kind: "canonical-entity",
      title: "User",
      status: "active",
      owners: ["team"],
      anchors: {},
      attributes: [{ name: "id", type: "uuid", required: true }],
    } as EaArtifactBase & { attributes: Array<Record<string, unknown>> };

    const modified = JSON.stringify({
      properties: { id: { type: "string" }, extra: { type: "string" } },
      required: ["id"],
    });

    const drifts = jsonSchemaGenerator.diff!(modified, artifact, makeCtx());
    expect(drifts.length).toBeGreaterThan(0);
  });

  it("should report no drift when schema matches", () => {
    const artifact = {
      id: "information/CE-user",
      kind: "canonical-entity",
      title: "User",
      status: "active",
      owners: ["team"],
      anchors: {},
      attributes: [{ name: "id", type: "uuid", required: true }],
    } as EaArtifactBase & { attributes: Array<Record<string, unknown>> };

    const generated = jsonSchemaGenerator.generate(artifact, makeCtx())[0]!.content;
    const drifts = jsonSchemaGenerator.diff!(generated, artifact, makeCtx());
    expect(drifts.length).toBe(0);
  });
});

// ─── Integration: Pipeline with Built-in Generators ─────────────────────────────

describe("Generator pipeline integration", () => {
  afterEach(() => {
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it("should run both generators on mixed artifacts", () => {
    const artifacts = [
      {
        id: "systems/API-orders",
        kind: "api-contract",
        title: "Orders API",
        status: "active",
        owners: ["team"],
        anchors: { apis: ["GET /orders"] },
      },
      {
        id: "information/CE-user",
        kind: "canonical-entity",
        title: "User",
        status: "active",
        owners: ["team"],
        anchors: {},
        attributes: [{ name: "id", type: "uuid", required: true }],
      },
    ] as EaArtifactBase[];

    const report = runGenerators({
      artifacts,
      generators: [openapiGenerator, jsonSchemaGenerator],
      generatorConfigs: [{ name: "openapi" }, { name: "jsonschema" }],
      projectRoot: TEST_ROOT,
      outputDir: "generated",
      logger: silentLogger,
      dryRun: true,
    });

    expect(report.outputs.length).toBe(2);
    expect(report.summary.generatorsRun).toBe(2);
    expect(report.summary.artifactsProcessed).toBe(2);
  });

  it("should write files in generate mode", () => {
    mkdirSync(TEST_ROOT, { recursive: true });

    const artifacts = [
      {
        id: "systems/API-test",
        kind: "api-contract",
        title: "Test API",
        status: "active",
        owners: ["team"],
        anchors: { apis: ["GET /test"] },
      },
    ] as EaArtifactBase[];

    const report = runGenerators({
      artifacts,
      generators: [openapiGenerator],
      generatorConfigs: [{ name: "openapi" }],
      projectRoot: TEST_ROOT,
      outputDir: "generated",
      logger: silentLogger,
    });

    expect(report.summary.filesWritten).toBe(1);
    const path = join(TEST_ROOT, "generated", "systems-API-test.openapi.yaml");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toContain('openapi: "3.1.0"');
  });

  it("should be resolvable from registry", () => {
    const openapi = getGenerator("openapi");
    const jsonschema = getGenerator("jsonschema");
    expect(openapi).toBeDefined();
    expect(openapi!.name).toBe("openapi");
    expect(jsonschema).toBeDefined();
    expect(jsonschema!.name).toBe("jsonschema");
  });

  it("should detect drift in check mode", () => {
    mkdirSync(join(TEST_ROOT, "generated"), { recursive: true });
    writeFileSync(
      join(TEST_ROOT, "generated", "systems-API-test.openapi.yaml"),
      "manually modified",
    );

    const artifacts = [
      {
        id: "systems/API-test",
        kind: "api-contract",
        title: "Test API",
        status: "active",
        owners: ["team"],
        anchors: { apis: ["GET /test"] },
      },
    ] as EaArtifactBase[];

    const report = runGenerators({
      artifacts,
      generators: [openapiGenerator],
      generatorConfigs: [{ name: "openapi" }],
      projectRoot: TEST_ROOT,
      outputDir: "generated",
      logger: silentLogger,
      checkOnly: true,
    });

    expect(report.drifts.length).toBe(1);
    expect(report.drifts[0]!.suggestion).toBe("review");
  });
});
