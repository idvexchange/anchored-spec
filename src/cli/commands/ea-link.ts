/**
 * anchored-spec link <from> <to>
 *
 * Create a relation between two EA entities.
 * Updates the source entity file to add the relation entry.
 */

import { Command } from "commander";
import chalk from "chalk";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EaRoot } from "../../ea/loader.js";
import type { EaLoadedEntity } from "../../ea/loader.js";
import {
  extractMarkdownBody,
  getEntityId,
  getEntitySpecRelations,
  relationTypeToSpecEntry,
  parseBackstageYaml,
  parseFrontmatterEntity,
  resolveConfigV1,
  writeBackstageFrontmatter,
  writeBackstageManifest,
  writeBackstageYaml,
} from "../../ea/index.js";
import type { BackstageEntity } from "../../ea/index.js";
import { buildEntityLookup, formatEntityDisplay, resolveEntityInput, suggestEntities } from "../entity-ref.js";
import { CliError } from "../errors.js";

export function eaLinkCommand(): Command {
  return new Command("link")
    .description("Create a relation between two EA entities")
    .argument("<from>", "Source entity ref")
    .argument("<to>", "Target entity ref")
    .option("--type <type>", "Relation type (e.g., uses, ownedBy, implements)", "uses")
    .option("--description <desc>", "Optional description of the relationship")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--dry-run", "Show what would change without writing")
    .action(async (from: string, to: string, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir as string });
      const root = new EaRoot(cwd, eaConfig);
      const loadResult = await root.loadEntities();

      const lookup = buildEntityLookup(loadResult.entities);
      const sourceEntity = resolveEntityInput(from, lookup);
      if (!sourceEntity) {
        const similar = suggestEntities(from, loadResult.entities);
        const hint = similar.length > 0 ? `\n  Did you mean: ${similar.join(", ")}?` : "";
        throw new CliError(`Entity "${from}" not found.${hint}`, 1);
      }
      const sourceDetail: EaLoadedEntity | undefined = loadResult.details.find(
        (d: EaLoadedEntity) => getEntityId(d.entity ?? d.authoredEntity ?? sourceEntity) === getEntityId(sourceEntity),
      );
      if (!sourceDetail?.entity && !sourceDetail?.authoredEntity) {
        throw new CliError(`Entity "${from}" could not be resolved for editing.`, 1);
      }

      // Verify target exists
      const targetEntity = resolveEntityInput(to, lookup);
      if (!targetEntity) {
        const similar = suggestEntities(to, loadResult.entities);
        const hint = similar.length > 0 ? `\n  Did you mean: ${similar.join(", ")}?` : "";
        throw new CliError(`Target entity "${to}" not found.${hint}`, 1);
      }
      const targetEntityRef = getEntityId(targetEntity);

      // Check for duplicate relation
      const existingRelations = getEntitySpecRelations(sourceEntity);
      const duplicate = existingRelations.find(
        (r) =>
          r.type === options.type &&
          r.targets.some((target) => target === targetEntityRef),
      );
      if (duplicate) {
        console.log(chalk.yellow(`⚠ Relation already exists: ${formatEntityDisplay(sourceEntity)} --[${options.type}]--> ${formatEntityDisplay(targetEntity)}`));
        return;
      }

      if (options.description) {
        throw new CliError(
          "Backstage-native authored relations do not support per-link descriptions. Remove --description and retry.",
          1,
        );
      }

      if (options.dryRun) {
        console.log(chalk.blue("Dry run — would add:"));
        console.log(chalk.dim(`  ${formatEntityDisplay(sourceEntity)} --[${options.type}]--> ${formatEntityDisplay(targetEntity)}`));
        return;
      }

      const authoredSourceEntity = sourceDetail.authoredEntity ?? sourceDetail.entity;
      if (!authoredSourceEntity) {
        throw new CliError(`Source entity "${from}" could not be resolved for editing.`, 1);
      }

      const updatedEntity = withAuthoredRelation(
        authoredSourceEntity,
        options.type as string,
        targetEntityRef,
      );

      // Read and update the entity file
      const filePath = join(cwd, sourceDetail.relativePath);
      const raw = readFileSync(filePath, "utf-8");
      persistUpdatedEntity(filePath, raw, authoredSourceEntity, updatedEntity);

      console.log(chalk.green(`✓ Linked: ${formatEntityDisplay(sourceEntity)} --[${options.type}]--> ${formatEntityDisplay(targetEntity)}`));
      console.log(chalk.dim(`  Updated: ${sourceDetail.relativePath}`));
    });
}

function withAuthoredRelation(
  entity: BackstageEntity,
  relationType: string,
  targetEntityRef: string,
): BackstageEntity {
  const specEntry = relationTypeToSpecEntry(relationType, targetEntityRef);
  if (!specEntry) {
    throw new CliError(
      `Relation type "${relationType}" is not supported as authored Backstage YAML. Use a supported relation that maps to standard spec fields.`,
      1,
    );
  }

  const spec = entity.spec && typeof entity.spec === "object" && !Array.isArray(entity.spec)
    ? { ...entity.spec }
    : {};

  if (specEntry.specField === "owner") {
    spec.owner = targetEntityRef;
    return { ...entity, spec };
  }

  const existing = Array.isArray(spec[specEntry.specField])
    ? (spec[specEntry.specField] as unknown[]).filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  spec[specEntry.specField] = existing.includes(targetEntityRef)
    ? existing
    : [...existing, targetEntityRef];

  return { ...entity, spec };
}

function sameEntityRef(
  left: BackstageEntity,
  right: BackstageEntity,
): boolean {
  return left.kind === right.kind &&
    left.metadata.name === right.metadata.name &&
    (left.metadata.namespace ?? "default") === (right.metadata.namespace ?? "default");
}

function persistUpdatedEntity(
  filePath: string,
  raw: string,
  originalEntity: BackstageEntity,
  updatedEntity: BackstageEntity,
): void {
  if (filePath.endsWith(".md") || filePath.endsWith(".mdx")) {
    const parseResult = parseFrontmatterEntity(raw, filePath);
    const parsedEntity = parseResult.entities[0]?.entity;
    if (!parsedEntity || !sameEntityRef(parsedEntity, originalEntity)) {
      throw new CliError(`Could not match the source entity in ${filePath}.`, 1);
    }
    const body = extractMarkdownBody(raw);
    writeFileSync(
      filePath,
      writeBackstageFrontmatter(updatedEntity, body),
      "utf-8",
    );
    return;
  }

  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    const parseResult = parseBackstageYaml(raw, filePath);
    const entities = parseResult.entities.map(({ entity }) =>
      sameEntityRef(entity, originalEntity) ? updatedEntity : entity,
    );

    if (!entities.some((entity) => sameEntityRef(entity, updatedEntity))) {
      throw new CliError(`Could not match the source entity in ${filePath}.`, 1);
    }

    const output = entities.length > 1 || raw.trimStart().startsWith("---")
      ? writeBackstageManifest(entities)
      : writeBackstageYaml(entities[0]!);

    writeFileSync(filePath, output, "utf-8");
    return;
  }

  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(raw) as BackstageEntity;
    if (!sameEntityRef(parsed, originalEntity)) {
      throw new CliError(`Could not match the source entity in ${filePath}.`, 1);
    }
    writeFileSync(filePath, JSON.stringify(updatedEntity, null, 2) + "\n", "utf-8");
    return;
  }

  throw new CliError(`Unsupported entity file type: ${filePath}`, 1);
}
