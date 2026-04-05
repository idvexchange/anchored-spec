/**
 * anchored-spec ea transition
 *
 * Advance an EA entity to a new lifecycle status.
 * Validates lifecycle gates before allowing transitions.
 *
 * EA replacement for the core `transition` command.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { EaRoot } from "../../ea/loader.js";
import {
  getEntityDescription,
  extractMarkdownBody,
  getEntityId,
  getEntityOwners,
  getEntitySpecRelations,
  getEntityStatus,
  parseBackstageYaml,
  parseFrontmatterEntity,
  resolveConfigV1,
  writeBackstageFrontmatter,
  writeBackstageManifest,
  writeBackstageYaml,
} from "../../ea/index.js";
import type { EntityStatus } from "../../ea/types.js";
import type { BackstageEntity } from "../../ea/index.js";
import { BACKSTAGE_API_VERSION } from "../../ea/index.js";
import { buildEntityLookup, formatEntityDisplay, suggestEntities } from "../entity-ref.js";
import { CliError } from "../errors.js";

const STATUS_ORDER: EntityStatus[] = [
  "draft",
  "planned",
  "active",
  "shipped",
  "deprecated",
  "retired",
];

function getNextStatus(current: EntityStatus): EntityStatus | null {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx === -1 || idx >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[idx + 1]!;
}

function validateTransition(
  entity: BackstageEntity,
  targetStatus: EntityStatus,
  _eaRoot: EaRoot,
): string[] {
  const errors: string[] = [];
  const currentStatus = getEntityStatus(entity);
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  const targetIndex = STATUS_ORDER.indexOf(targetStatus);

  if (targetIndex === -1) {
    errors.push(`Invalid target status "${targetStatus}". Valid: ${STATUS_ORDER.join(", ")}`);
    return errors;
  }

  if (targetIndex <= currentIndex && targetStatus !== "deprecated" && targetStatus !== "retired") {
    errors.push(`Cannot move backward from "${currentStatus}" to "${targetStatus}".`);
    return errors;
  }

  // Gate: active requires owner
  if (targetStatus === "active") {
    if (getEntityOwners(entity).length === 0) {
      errors.push("Cannot activate: entity has no owners.");
    }
    if (getEntityDescription(entity).trim().length < 10) {
      errors.push("Cannot activate: entity needs a meaningful description (>=10 chars).");
    }
  }

  // Gate: shipped requires at least one relation
  if (targetStatus === "shipped") {
    const relationCount = getEntitySpecRelations(entity).reduce(
      (count, relation) => count + relation.targets.length,
      0,
    );
    if (relationCount === 0) {
      errors.push("Cannot ship: entity has no relations. Link it to other entities first.");
    }
  }

  return errors;
}

function mapStatusToLifecycle(status: EntityStatus): string {
  const map: Record<EntityStatus, string> = {
    draft: "experimental",
    planned: "development",
    active: "production",
    shipped: "production",
    deprecated: "deprecated",
    retired: "retired",
    deferred: "experimental",
  };
  return map[status] ?? "production";
}

function sameEntityRef(left: BackstageEntity, right: BackstageEntity): boolean {
  return left.kind === right.kind &&
    left.metadata.name === right.metadata.name &&
    (left.metadata.namespace ?? "default") === (right.metadata.namespace ?? "default");
}

function updateAuthoredStatus(
  entity: BackstageEntity,
  targetStatus: EntityStatus,
): BackstageEntity {
  const spec = entity.spec && typeof entity.spec === "object" && !Array.isArray(entity.spec)
    ? { ...entity.spec }
    : {};

  if (entity.apiVersion === BACKSTAGE_API_VERSION) {
    spec.lifecycle = mapStatusToLifecycle(targetStatus);
    delete spec.status;
  } else {
    spec.status = targetStatus;
  }

  return { ...entity, spec };
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
    writeFileSync(filePath, writeBackstageFrontmatter(updatedEntity, extractMarkdownBody(raw)), "utf-8");
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
    writeFileSync(filePath, JSON.stringify(updatedEntity, null, 2) + "\n");
    return;
  }

  throw new CliError(`Unsupported entity file type: ${filePath}`, 1);
}

export function eaTransitionCommand(): Command {
  return new Command("transition")
    .description("Advance an entity to a new lifecycle status")
    .argument("<entity-ref>", "Entity ref to transition")
    .option("--to <status>", "Target status (default: next in lifecycle)")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--force", "Skip gate validation")
    .option("--dry-run", "Show what would happen without writing")
    .action(async (entityInput: string, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const eaRoot = new EaRoot(cwd, eaConfig);

      if (!eaRoot.isInitialized()) {
        throw new CliError("Error: EA not initialized. Run 'anchored-spec init' first.");
      }

      const loadResult = await eaRoot.loadEntities();
      const lookup = buildEntityLookup(loadResult.entities);
      const targetEntity = lookup.byInput.get(entityInput);
      const resolvedEntityRef = targetEntity ? getEntityId(targetEntity) : undefined;
      const detail = loadResult.details.find((d) => {
        const entity = d.entity ?? d.authoredEntity;
        if (!entity) return false;
        return getEntityId(entity) === resolvedEntityRef;
      });

      if (!detail?.entity && !detail?.authoredEntity) {
        const similar = suggestEntities(entityInput, loadResult.entities);
        const hint = similar.length > 0 ? `\n  Did you mean: ${similar.join(", ")}?` : "";
        throw new CliError(`Error: Entity "${entityInput}" not found.${hint}`);
      }

      const runtimeEntity = detail.entity ?? detail.authoredEntity!;
      const displayId = targetEntity
        ? formatEntityDisplay(targetEntity)
        : detail.entity
          ? getEntityId(detail.entity)
          : entityInput;
      const currentStatus = getEntityStatus(runtimeEntity);
      const targetStatus = (options.to as EntityStatus) ?? getNextStatus(currentStatus);

      if (!targetStatus) {
        console.log(chalk.yellow(`Entity "${displayId}" is already at terminal status "${currentStatus}".`));
        return;
      }

      console.log(chalk.blue(`🔄 Transition: ${displayId}`));
      console.log(chalk.dim(`  ${currentStatus} → ${targetStatus}`));

      if (!options.force) {
        const errors = validateTransition(runtimeEntity, targetStatus, eaRoot);
        if (errors.length > 0) {
          console.log(chalk.red("\n  ✗ Gate validation failed:"));
          for (const err of errors) {
            console.log(chalk.red(`    • ${err}`));
          }
          console.log(chalk.dim("\n  Use --force to skip validation."));
          throw new CliError("", 1);
        }
      }

      if (options.dryRun) {
        console.log(chalk.yellow(`\n  [DRY RUN] Would update status to "${targetStatus}".`));
        return;
      }

      const authoredSourceEntity = detail.authoredEntity ?? detail.entity;
      if (!authoredSourceEntity) {
        throw new CliError(`Entity "${entityInput}" could not be resolved for editing.`, 1);
      }

      const updatedEntity = updateAuthoredStatus(authoredSourceEntity, targetStatus);

      // Read, update, and write the file
      const filePath = detail.filePath;
      const content = readFileSync(filePath, "utf-8");
      persistUpdatedEntity(filePath, content, authoredSourceEntity, updatedEntity);

      console.log(chalk.green(`\n  ✓ Status updated: ${currentStatus} → ${targetStatus}`));
      console.log(chalk.dim(`  File: ${relative(cwd, filePath)}`));

      const next = getNextStatus(targetStatus);
      if (next) {
        console.log(chalk.dim(`\n  Next status: ${next}`));
      } else {
        console.log(chalk.dim(`\n  This entity is now at terminal status.`));
      }
    });
}
