/**
 * Anchored Spec — EA Generator Framework
 *
 * Pipeline for generating implementation artifacts from EA specs.
 * Generators transform EA artifacts (e.g., api-contract → OpenAPI stub,
 * canonical-entity → JSON Schema) and detect generation drift.
 *
 * Design reference: docs/ea-drift-resolvers-generators.md (Generator Interface)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { EaArtifactBase } from "../types.js";
import type { ResolverLogger } from "../resolvers/types.js";

// ─── Generator Types ────────────────────────────────────────────────────────────

/** Context passed to generator methods. */
export interface EaGeneratorContext {
  /** Absolute path to the project root. */
  projectRoot: string;
  /** All loaded EA artifacts (for cross-reference). */
  artifacts: EaArtifactBase[];
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
  /** The EA artifact ID this was generated from. */
  sourceArtifactId: string;
  /** Human-readable description of what was generated. */
  description: string;
  /** Whether this output should overwrite existing files. */
  overwrite: boolean;
}

/** Drift detected between generated file and current spec. */
export interface GenerationDrift {
  /** Path to the generated file that has drifted. */
  filePath: string;
  /** The EA artifact that should govern this file. */
  sourceArtifactId: string;
  /** Description of the drift. */
  message: string;
  /** Suggested action. */
  suggestion: "regenerate" | "update-spec" | "review";
}

/**
 * Generator plugin interface.
 *
 * Each generator declares which artifact kinds it handles and provides
 * generate() and optional diff() methods.
 */
export interface EaGenerator {
  /** Unique generator name. */
  name: string;
  /** Which artifact kinds this generator processes. */
  kinds: string[];
  /** Output format identifier. */
  outputFormat: string;

  /**
   * Generate implementation artifacts from an EA artifact.
   * Returns one or more generated outputs.
   */
  generate(
    artifact: EaArtifactBase,
    ctx: EaGeneratorContext,
  ): GeneratedOutput[];

  /**
   * Compare current generated output against the EA artifact to detect drift.
   * Returns findings for cases where the generated file has been manually modified.
   */
  diff?(
    currentOutput: string,
    artifact: EaArtifactBase,
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
  /** All loaded EA artifacts. */
  artifacts: EaArtifactBase[];
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
  /** Filter to specific artifact kinds. */
  kinds?: string[];
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
    artifactsProcessed: number;
    filesGenerated: number;
    filesWritten: number;
    filesSkipped: number;
    driftsDetected: number;
  };
}

/**
 * Run the generator pipeline.
 *
 * 1. For each generator, find matching artifacts by kind
 * 2. In check mode: compare existing output vs what would be generated
 * 3. In generate mode: produce outputs and write files
 */
export function runGenerators(options: EaGeneratorOptions): GenerationReport {
  const {
    artifacts,
    generators,
    generatorConfigs,
    projectRoot,
    outputDir,
    logger,
    checkOnly,
    dryRun,
    kinds,
    generatorName,
  } = options;

  const outputs: GeneratedOutput[] = [];
  const drifts: GenerationDrift[] = [];
  let generatorsRun = 0;
  let artifactsProcessed = 0;
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
      artifacts,
      outputDir: genOutputDir,
      logger,
      options: genOptions,
    };

    // Find matching artifacts
    let matchingArtifacts = artifacts.filter((a) => generator.kinds.includes(a.kind));
    if (kinds && kinds.length > 0) {
      matchingArtifacts = matchingArtifacts.filter((a) => kinds.includes(a.kind));
    }

    if (matchingArtifacts.length === 0) {
      logger.debug(`Generator ${generator.name}: no matching artifacts`);
      continue;
    }

    generatorsRun++;
    logger.info(`Running generator: ${generator.name}`, {
      artifacts: matchingArtifacts.length,
      outputDir: genOutputDir,
    });

    for (const artifact of matchingArtifacts) {
      artifactsProcessed++;

      if (checkOnly && generator.diff) {
        // Check mode: compare existing vs what would be generated
        const generated = generator.generate(artifact, ctx);
        for (const output of generated) {
          const fullPath = join(projectRoot, genOutputDir, output.relativePath);
          if (existsSync(fullPath)) {
            const existing = readFileSync(fullPath, "utf-8");
            const genDrifts = generator.diff(existing, artifact, ctx);
            drifts.push(...genDrifts);
          } else {
            drifts.push({
              filePath: join(genOutputDir, output.relativePath),
              sourceArtifactId: artifact.id,
              message: `Generated file does not exist: ${output.relativePath}`,
              suggestion: "regenerate",
            });
          }
        }
      } else {
        // Generate mode
        const generated = generator.generate(artifact, ctx);
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
              from: artifact.id,
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
      artifactsProcessed,
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
    `| Artifacts processed | ${report.summary.artifactsProcessed} |`,
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
      lines.push(`  Source: \`${output.sourceArtifactId}\``);
    }
    lines.push("");
  }

  if (report.drifts.length > 0) {
    lines.push("## Generation Drift", "");
    for (const drift of report.drifts) {
      lines.push(`- **${drift.filePath}** [${drift.suggestion}]`);
      lines.push(`  ${drift.message}`);
      lines.push(`  Source: \`${drift.sourceArtifactId}\``);
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
