/**
 * Anchored Spec — EA Generator Framework
 *
 * Pipeline for generating implementation entities from EA specs.
 * Generators transform EA entities (e.g., api-contract → OpenAPI stub,
 * canonical-entity → JSON Schema) and detect generation drift.
 *
 * Design reference: docs/delivery/discovery-drift-generation.md (Generator Interface)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ResolverLogger } from "../resolvers/types.js";
import type { BackstageEntity } from "../backstage/types.js";
import { getEntityId, getEntitySchema } from "../backstage/accessors.js";

// ─── Generator Types ────────────────────────────────────────────────────────────

/** Context passed to generator methods. */
export interface EaGeneratorContext {
  /** Absolute path to the project root. */
  projectRoot: string;
  /** All loaded entities (for cross-reference). */
  entities: BackstageEntity[];
  /** Output directory for generated files. */
  outputDir: string;
  /** Logger. */
  logger: ResolverLogger;
  /** Optional generator-specific options from config. */
  options?: Record<string, unknown>;
}

/** A single generated output. */
export interface GeneratedOutput {
  /** Relative path where this output should be written. */
  relativePath: string;
  /** The generated content. */
  content: string;
  /** Content type for logging/display. */
  contentType: "yaml" | "json" | "hcl" | "markdown" | "typescript" | "sql" | "other";
  /** The EA entity ID this was generated from. */
  sourceEntityRef: string;
  /** Human-readable description of what was generated. */
  description: string;
  /** Whether this output should overwrite existing files. */
  overwrite: boolean;
}

/** Drift detected between generated file and current spec. */
export interface GenerationDrift {
  /** Path to the generated file that has drifted. */
  filePath: string;
  /** The EA entity that should govern this file. */
  sourceEntityRef: string;
  /** Description of the drift. */
  message: string;
  /** Suggested action. */
  suggestion: "regenerate" | "update-spec" | "review";
}

/**
 * Generator plugin interface.
 *
 * Each generator declares which schema profiles it handles and provides
 * generate() and optional diff() methods.
 */
export interface EaGenerator {
  /** Unique generator name. */
  name: string;
  /** Which schema profiles this generator processes. */
  schemas: string[];
  /** Output format identifier. */
  outputFormat: string;

  /**
   * Generate implementation entities from an EA entity.
   * Returns one or more generated outputs.
   */
  generate(
    entity: BackstageEntity,
    ctx: EaGeneratorContext,
  ): GeneratedOutput[];

  /**
     * Compare current generated output against the EA entity to detect drift.
   * Returns findings for cases where the generated file has been manually modified.
   */
  diff?(
    currentOutput: string,
    entity: BackstageEntity,
    ctx: EaGeneratorContext,
  ): GenerationDrift[];
}

// ─── Generator Config ───────────────────────────────────────────────────────────

/** Configuration for a generator in the EA config. */
export interface GeneratorConfig {
  /** Generator name (for built-in) or path (for external). */
  name: string;
  /** Output directory for this generator's files. */
  outputDir?: string;
  /** Generator-specific options. */
  options?: Record<string, unknown>;
}

// ─── Generator Pipeline ─────────────────────────────────────────────────────────

/** Options for the generator pipeline. */
export interface EaGeneratorOptions {
  /** All loaded entities. */
  entities: BackstageEntity[];
  /** Configured generators to run. */
  generators: EaGenerator[];
  /** Generator configs (for output dirs and options). */
  generatorConfigs: GeneratorConfig[];
  /** Project root directory. */
  projectRoot: string;
  /** Default output directory. */
  outputDir: string;
  /** Logger. */
  logger: ResolverLogger;
  /** If true, only check for drift (don't generate). */
  checkOnly?: boolean;
  /** If true, show what would be generated without writing. */
  dryRun?: boolean;
  /** Filter to specific schema profiles. */
  schemas?: string[];
  /** Filter to specific generator name. */
  generatorName?: string;
}

/** Report from a generator run. */
export interface GenerationReport {
  /** ISO 8601 timestamp. */
  generatedAt: string;
  /** All generated outputs. */
  outputs: GeneratedOutput[];
  /** All generation drift findings. */
  drifts: GenerationDrift[];
  /** Summary statistics. */
  summary: {
    generatorsRun: number;
    entitiesProcessed: number;
    filesGenerated: number;
    filesWritten: number;
    filesSkipped: number;
    driftsDetected: number;
  };
}

/**
 * Run the generator pipeline.
 *
 * 1. For each generator, find matching entities by schema
 * 2. In check mode: compare existing output vs what would be generated
 * 3. In generate mode: produce outputs and write files
 */
export function runGenerators(options: EaGeneratorOptions): GenerationReport {
  const {
    entities,
    generators,
    generatorConfigs,
    projectRoot,
    outputDir,
    logger,
    checkOnly,
    dryRun,
    schemas,
    generatorName,
  } = options;

  const outputs: GeneratedOutput[] = [];
  const drifts: GenerationDrift[] = [];
  let generatorsRun = 0;
  let entitiesProcessed = 0;
  let filesWritten = 0;
  let filesSkipped = 0;

  // Filter generators by name if specified
  const activeGenerators = generatorName
    ? generators.filter((g) => g.name === generatorName)
    : generators;

  for (const generator of activeGenerators) {
    const config = generatorConfigs.find((c) => c.name === generator.name);
    const genOutputDir = config?.outputDir ?? outputDir;
    const genOptions = config?.options;

      const ctx: EaGeneratorContext = {
        projectRoot,
        entities,
      outputDir: genOutputDir,
      logger,
      options: genOptions,
    };

    // Find matching entities for the generator's schema profiles.
    let matchingEntities = entities.filter((entity) =>
      generator.schemas.includes(getEntitySchema(entity)),
    );
    if (schemas && schemas.length > 0) {
      matchingEntities = matchingEntities.filter((entity) =>
        schemas.includes(getEntitySchema(entity)),
      );
    }

    if (matchingEntities.length === 0) {
      logger.debug(`Generator ${generator.name}: no matching entities`);
      continue;
    }

    generatorsRun++;
    logger.info(`Running generator: ${generator.name}`, {
      entities: matchingEntities.length,
      outputDir: genOutputDir,
    });

    for (const entity of matchingEntities) {
      entitiesProcessed++;

      if (checkOnly && generator.diff) {
        // Check mode: compare existing vs what would be generated
        const generated = generator.generate(entity, ctx);
        for (const output of generated) {
          const fullPath = join(projectRoot, genOutputDir, output.relativePath);
          if (existsSync(fullPath)) {
            const existing = readFileSync(fullPath, "utf-8");
            const genDrifts = generator.diff(existing, entity, ctx);
            drifts.push(...genDrifts);
          } else {
            drifts.push({
              filePath: join(genOutputDir, output.relativePath),
              sourceEntityRef: getEntityId(entity),
              message: `Generated file does not exist: ${output.relativePath}`,
              suggestion: "regenerate",
            });
          }
        }
      } else {
        // Generate mode
        const generated = generator.generate(entity, ctx);
        outputs.push(...generated);

        // Write files unless dry-run or check-only
        if (!dryRun && !checkOnly) {
          for (const output of generated) {
            const fullPath = join(projectRoot, genOutputDir, output.relativePath);

            if (existsSync(fullPath) && !output.overwrite) {
              filesSkipped++;
              logger.debug(`Skipping existing file: ${output.relativePath}`);
              continue;
            }

            mkdirSync(dirname(fullPath), { recursive: true });
            writeFileSync(fullPath, output.content);
            filesWritten++;
            logger.info(`Generated: ${output.relativePath}`, {
              from: getEntityId(entity),
              type: output.contentType,
            });
          }
        }
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    outputs,
    drifts,
    summary: {
      generatorsRun,
      entitiesProcessed,
      filesGenerated: outputs.length,
      filesWritten,
      filesSkipped,
      driftsDetected: drifts.length,
    },
  };
}

// ─── Report Rendering ───────────────────────────────────────────────────────────

/** Render a generation report as markdown. */
export function renderGenerationReportMarkdown(report: GenerationReport): string {
  const lines: string[] = [
    "# EA Generation Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `| Metric | Count |`,
    `| --- | --- |`,
    `| Generators run | ${report.summary.generatorsRun} |`,
    `| Entities processed | ${report.summary.entitiesProcessed} |`,
    `| Files generated | ${report.summary.filesGenerated} |`,
    `| Files written | ${report.summary.filesWritten} |`,
    `| Files skipped | ${report.summary.filesSkipped} |`,
    `| Drifts detected | ${report.summary.driftsDetected} |`,
    "",
  ];

  if (report.outputs.length > 0) {
    lines.push("## Generated Files", "");
    for (const output of report.outputs) {
      lines.push(`- **${output.relativePath}** (${output.contentType}) — ${output.description}`);
      lines.push(`  Source: \`${output.sourceEntityRef}\``);
    }
    lines.push("");
  }

  if (report.drifts.length > 0) {
    lines.push("## Generation Drift", "");
    for (const drift of report.drifts) {
      lines.push(`- **${drift.filePath}** [${drift.suggestion}]`);
      lines.push(`  ${drift.message}`);
      lines.push(`  Source: \`${drift.sourceEntityRef}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Built-in Generator Registry ────────────────────────────────────────────────

/** Registry of built-in generators. */
const BUILTIN_GENERATORS = new Map<string, () => EaGenerator>();

/** Register a built-in generator. */
export function registerGenerator(name: string, factory: () => EaGenerator): void {
  BUILTIN_GENERATORS.set(name, factory);
}

/** Get a built-in generator by name. */
export function getGenerator(name: string): EaGenerator | undefined {
  const factory = BUILTIN_GENERATORS.get(name);
  return factory ? factory() : undefined;
}

/** List all registered generator names. */
export function listGenerators(): string[] {
  return [...BUILTIN_GENERATORS.keys()];
}

/** Resolve generators from config — looks up built-in generators by name. */
export function resolveGenerators(configs: GeneratorConfig[]): EaGenerator[] {
  const generators: EaGenerator[] = [];
  for (const config of configs) {
    const gen = getGenerator(config.name);
    if (gen) {
      generators.push(gen);
    }
  }
  return generators;
}

// ─── Built-in Generator Exports ─────────────────────────────────────────────────

export { openapiGenerator } from "./openapi.js";
export { jsonSchemaGenerator } from "./jsonschema.js";

// ─── Auto-Register Built-in Generators ──────────────────────────────────────────

import { openapiGenerator } from "./openapi.js";
import { jsonSchemaGenerator } from "./jsonschema.js";

registerGenerator("openapi", () => openapiGenerator);
registerGenerator("jsonschema", () => jsonSchemaGenerator);
