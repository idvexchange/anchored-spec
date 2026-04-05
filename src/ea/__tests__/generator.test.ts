import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { silentLogger } from "../resolvers/types.js";
import { getEntityId, getEntityTitle } from "../backstage/accessors.js";
import { entityRefToFilenameSlug } from "../backstage/ref-utils.js";
import type { EaGenerator, EaGeneratorContext, GeneratedOutput, GenerationDrift, } from "../generators/index.js";
import { makeEntity } from "./helpers/make-entity.js";
import { runGenerators, renderGenerationReportMarkdown, registerGenerator, getGenerator, listGenerators, resolveGenerators, } from "../generators/index.js";
const TEST_ROOT = join(tmpdir(), `ea-gen-test-${Date.now()}`);
// ─── Test Generator ─────────────────────────────────────────────────────────────
function makeTestGenerator(overrides?: Partial<EaGenerator>): EaGenerator {
    return {
        name: "test-gen",
        schemas: ["api-contract"],
        outputFormat: "json",
        generate(entity, _ctx: EaGeneratorContext): GeneratedOutput[] {
            return [
                {
                    relativePath: `${entityRefToFilenameSlug(getEntityId(entity))}.json`,
                    content: JSON.stringify({ title: getEntityTitle(entity), generated: true }, null, 2),
                    contentType: "json",
                    sourceEntityRef: getEntityId(entity),
                    description: `Generated from ${getEntityTitle(entity)}`,
                    overwrite: true,
                },
            ];
        },
        ...overrides
    };
}
function makeGeneratorEntity(overrides: Record<string, unknown> = {}) {
    return makeEntity({
        ref: "api:orders",
        kind: "API",
        type: "openapi",
        title: "Orders API",
        status: "active",
        owners: ["team-commerce"],
        anchors: { apis: ["GET /orders", "POST /orders"] },
        ...overrides
    });
}
// ─── runGenerators ──────────────────────────────────────────────────────────────
describe("runGenerators", () => {
    afterEach(() => {
        if (existsSync(TEST_ROOT)) {
            rmSync(TEST_ROOT, { recursive: true, force: true });
        }
    });
    it("should generate outputs for matching entities", () => {
        const generator = makeTestGenerator();
        const entity = makeGeneratorEntity();
        const report = runGenerators({
            entities: [entity],
            generators: [generator],
            generatorConfigs: [{ name: "test-gen" }],
            projectRoot: TEST_ROOT,
            outputDir: "generated",
            logger: silentLogger,
            dryRun: true
        });
        expect(report.outputs.length).toBe(1);
        expect(report.outputs[0]!.sourceEntityRef).toBe("api:default/orders");
        expect(report.summary.generatorsRun).toBe(1);
        expect(report.summary.entitiesProcessed).toBe(1);
        expect(report.summary.filesGenerated).toBe(1);
    });
    it("should skip non-matching schema profiles", () => {
        const generator = makeTestGenerator({ schemas: ["deployment"] });
        const entity = makeGeneratorEntity({ kind: "API", type: "openapi" });
        const report = runGenerators({
            entities: [entity],
            generators: [generator],
            generatorConfigs: [{ name: "test-gen" }],
            projectRoot: TEST_ROOT,
            outputDir: "generated",
            logger: silentLogger,
            dryRun: true
        });
        expect(report.outputs.length).toBe(0);
        expect(report.summary.generatorsRun).toBe(0);
    });
    it("should write files in generate mode", () => {
        mkdirSync(TEST_ROOT, { recursive: true });
        const generator = makeTestGenerator();
        const entity = makeGeneratorEntity();
        const report = runGenerators({
            entities: [entity],
            generators: [generator],
            generatorConfigs: [{ name: "test-gen" }],
            projectRoot: TEST_ROOT,
            outputDir: "generated",
            logger: silentLogger
        });
        expect(report.summary.filesWritten).toBe(1);
        const outputPath = join(TEST_ROOT, "generated", "api-orders.json");
        expect(existsSync(outputPath)).toBe(true);
        const content = JSON.parse(readFileSync(outputPath, "utf-8"));
        expect(content.title).toBe("Orders API");
        expect(content.generated).toBe(true);
    });
    it("should not write files in dry-run mode", () => {
        mkdirSync(TEST_ROOT, { recursive: true });
        const generator = makeTestGenerator();
        const entity = makeGeneratorEntity();
        const report = runGenerators({
            entities: [entity],
            generators: [generator],
            generatorConfigs: [{ name: "test-gen" }],
            projectRoot: TEST_ROOT,
            outputDir: "generated",
            logger: silentLogger,
            dryRun: true
        });
        expect(report.summary.filesWritten).toBe(0);
        expect(report.summary.filesGenerated).toBe(1);
        expect(existsSync(join(TEST_ROOT, "generated"))).toBe(false);
    });
    it("should skip existing files when overwrite is false", () => {
        mkdirSync(join(TEST_ROOT, "generated"), { recursive: true });
        writeFileSync(join(TEST_ROOT, "generated", "api-orders.json"), "existing");
        const generator = makeTestGenerator({
            generate(entity) {
                return [
                    {
                        relativePath: `${entityRefToFilenameSlug(getEntityId(entity))}.json`,
                        content: "new content",
                        contentType: "json",
                        sourceEntityRef: getEntityId(entity),
                        description: "test",
                        overwrite: false,
                    },
                ];
            }
        });
        const report = runGenerators({
            entities: [makeGeneratorEntity()],
            generators: [generator],
            generatorConfigs: [{ name: "test-gen" }],
            projectRoot: TEST_ROOT,
            outputDir: "generated",
            logger: silentLogger
        });
        expect(report.summary.filesSkipped).toBe(1);
        expect(report.summary.filesWritten).toBe(0);
        expect(readFileSync(join(TEST_ROOT, "generated", "api-orders.json"), "utf-8")).toBe("existing");
    });
    it("should filter by generator name", () => {
        const gen1 = makeTestGenerator({ name: "gen1" });
        const gen2 = makeTestGenerator({ name: "gen2" });
        const report = runGenerators({
            entities: [makeGeneratorEntity()],
            generators: [gen1, gen2],
            generatorConfigs: [{ name: "gen1" }, { name: "gen2" }],
            projectRoot: TEST_ROOT,
            outputDir: "generated",
            logger: silentLogger,
            dryRun: true,
            generatorName: "gen1"
        });
        expect(report.summary.generatorsRun).toBe(1);
    });
    it("should filter by schema profile", () => {
        const generator = makeTestGenerator({ schemas: ["api-contract", "deployment"] });
        const entities = [
            makeGeneratorEntity({ kind: "API", type: "openapi" }),
            makeGeneratorEntity({ ref: "resource:x", kind: "Resource", type: "deployment", title: "Deploy X" }),
        ];
        const report = runGenerators({
            entities,
            generators: [generator],
            generatorConfigs: [{ name: "test-gen" }],
            projectRoot: TEST_ROOT,
            outputDir: "generated",
            logger: silentLogger,
            dryRun: true,
            schemas: ["api-contract"]
        });
        expect(report.summary.entitiesProcessed).toBe(1);
    });
    it("should process multiple entities", () => {
        const generator = makeTestGenerator();
        const entities = [
            makeGeneratorEntity({ ref: "api:a", title: "A" }),
            makeGeneratorEntity({ ref: "api:b", title: "B" }),
            makeGeneratorEntity({ ref: "api:c", title: "C" }),
        ];
        const report = runGenerators({
            entities,
            generators: [generator],
            generatorConfigs: [{ name: "test-gen" }],
            projectRoot: TEST_ROOT,
            outputDir: "generated",
            logger: silentLogger,
            dryRun: true
        });
        expect(report.outputs.length).toBe(3);
        expect(report.summary.entitiesProcessed).toBe(3);
    });
});
// ─── Check Mode (Drift Detection) ──────────────────────────────────────────────
describe("runGenerators check mode", () => {
    afterEach(() => {
        if (existsSync(TEST_ROOT)) {
            rmSync(TEST_ROOT, { recursive: true, force: true });
        }
    });
    it("should detect missing generated files", () => {
        mkdirSync(TEST_ROOT, { recursive: true });
        const generator = makeTestGenerator({
            diff(_currentOutput, _artifact) {
                return [];
            }
        });
        const report = runGenerators({
            entities: [makeGeneratorEntity()],
            generators: [generator],
            generatorConfigs: [{ name: "test-gen" }],
            projectRoot: TEST_ROOT,
            outputDir: "generated",
            logger: silentLogger,
            checkOnly: true
        });
        expect(report.drifts.length).toBe(1);
        expect(report.drifts[0]!.suggestion).toBe("regenerate");
        expect(report.drifts[0]!.message).toContain("does not exist");
    });
    it("should detect drift in existing files", () => {
        mkdirSync(join(TEST_ROOT, "generated"), { recursive: true });
        writeFileSync(join(TEST_ROOT, "generated", "api-orders.json"), '{"manually": "modified"}');
        const generator = makeTestGenerator({
            diff(currentOutput, entity): GenerationDrift[] {
                if (currentOutput.includes("manually")) {
                    return [
                        {
                            filePath: `${entityRefToFilenameSlug(getEntityId(entity))}.json`,
                            sourceEntityRef: getEntityId(entity),
                            message: "File has been manually modified",
                            suggestion: "review",
                        },
                    ];
                }
                return [];
            }
        });
        const report = runGenerators({
            entities: [makeGeneratorEntity()],
            generators: [generator],
            generatorConfigs: [{ name: "test-gen" }],
            projectRoot: TEST_ROOT,
            outputDir: "generated",
            logger: silentLogger,
            checkOnly: true
        });
        expect(report.drifts.length).toBe(1);
        expect(report.drifts[0]!.suggestion).toBe("review");
    });
    it("should report no drift when files match", () => {
        mkdirSync(join(TEST_ROOT, "generated"), { recursive: true });
        writeFileSync(join(TEST_ROOT, "generated", "api-orders.json"), JSON.stringify({ title: "Orders API", generated: true }, null, 2));
        const generator = makeTestGenerator({
            diff(): GenerationDrift[] {
                return [];
            }
        });
        const report = runGenerators({
            entities: [makeGeneratorEntity()],
            generators: [generator],
            generatorConfigs: [{ name: "test-gen" }],
            projectRoot: TEST_ROOT,
            outputDir: "generated",
            logger: silentLogger,
            checkOnly: true
        });
        expect(report.drifts.length).toBe(0);
    });
});
// ─── renderGenerationReportMarkdown ─────────────────────────────────────────────
describe("renderGenerationReportMarkdown", () => {
    it("should render a report with outputs", () => {
        const md = renderGenerationReportMarkdown({
            generatedAt: "2024-01-01T00:00:00Z",
            outputs: [
                {
                    relativePath: "orders.json",
                    content: "{}",
                    contentType: "json",
                    sourceEntityRef: "api:default/orders",
                    description: "Orders API stub",
                    overwrite: true
                }
            ],
            drifts: [],
            summary: {
                generatorsRun: 1,
                entitiesProcessed: 1,
                filesGenerated: 1,
                filesWritten: 1,
                filesSkipped: 0,
                driftsDetected: 0
            }
        });
        expect(md).toContain("# EA Generation Report");
        expect(md).toContain("orders.json");
        expect(md).toContain("Orders API stub");
        expect(md).toContain("api:default/orders");
    });
    it("should render a report with drifts", () => {
        const md = renderGenerationReportMarkdown({
            generatedAt: "2024-01-01T00:00:00Z",
            outputs: [],
            drifts: [
                {
                    filePath: "orders.json",
                    sourceEntityRef: "api:default/orders",
                    message: "File manually modified",
                    suggestion: "review"
                }
            ],
            summary: {
                generatorsRun: 1,
                entitiesProcessed: 1,
                filesGenerated: 0,
                filesWritten: 0,
                filesSkipped: 0,
                driftsDetected: 1
            }
        });
        expect(md).toContain("Generation Drift");
        expect(md).toContain("[review]");
        expect(md).toContain("File manually modified");
    });
});
// ─── Generator Registry ─────────────────────────────────────────────────────────
describe("Generator Registry", () => {
    it("should register and retrieve generators", () => {
        registerGenerator("test-registry", () => makeTestGenerator({ name: "test-registry" }));
        const gen = getGenerator("test-registry");
        expect(gen).toBeDefined();
        expect(gen!.name).toBe("test-registry");
    });
    it("should return undefined for unknown generator", () => {
        expect(getGenerator("nonexistent")).toBeUndefined();
    });
    it("should list registered generators", () => {
        registerGenerator("list-test", () => makeTestGenerator({ name: "list-test" }));
        expect(listGenerators()).toContain("list-test");
    });
    it("should resolve generators from configs", () => {
        registerGenerator("resolve-test", () => makeTestGenerator({ name: "resolve-test" }));
        const generators = resolveGenerators([
            { name: "resolve-test" },
            { name: "nonexistent" },
        ]);
        expect(generators.length).toBe(1);
        expect(generators[0]!.name).toBe("resolve-test");
    });
});
