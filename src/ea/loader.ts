/**
 * Anchored Spec — Entity Loader
 *
 * Entity-first project loading built on Backstage-aligned storage modes.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { parse as parseYaml } from "yaml";

import {
  loadBackstageEntities,
  type BackstageEntityLoadResult,
  type BackstageEntityLoadDetail,
} from "./backstage/loader.js";
import type { BackstageEntity } from "./backstage/types.js";
import {
  getEntityDomain,
  getEntityKind,
  getEntitySchema,
  getEntitySpecRelations,
  getEntityStatus,
} from "./backstage/accessors.js";
import type { EaDomain } from "./types.js";
import {
  loadProjectConfig,
  getVerificationSearchDirs,
  type AnchoredSpecConfigV1,
} from "./config.js";
import { type EaValidationError } from "./validate.js";

export interface EaLoadedEntity {
  entity?: BackstageEntity;
  authoredEntity?: BackstageEntity;
  filePath: string;
  relativePath: string;
  domain: EaDomain;
  errors: EaValidationError[];
}

export interface EaEntityLoadResult {
  entities: BackstageEntity[];
  details: EaLoadedEntity[];
  errors: EaValidationError[];
}

export interface EaEntitySummary {
  totalEntities: number;
  byDomain: Record<string, number>;
  byKind: Record<string, number>;
  bySchema: Record<string, number>;
  byStatus: Record<string, number>;
  errorCount: number;
  relationCount: number;
}

const CONFIG_FILE = ".anchored-spec/config.json";

export class EaRoot {
  readonly projectRoot: string;
  readonly v1Config: AnchoredSpecConfigV1;

  private loaded: EaEntityLoadResult | null = null;

  constructor(projectRoot: string, config: AnchoredSpecConfigV1) {
    this.projectRoot = resolve(projectRoot);
    this.v1Config = config;
  }

  static findProjectRoot(startDir: string): string | null {
    let current = resolve(startDir);

    while (true) {
      if (
        existsSync(join(current, CONFIG_FILE)) ||
        existsSync(join(current, "catalog-info.yaml")) ||
        existsSync(join(current, "catalog"))
      ) {
        return current;
      }

      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }

    return null;
  }

  static resolveProjectConfig(projectRoot: string): AnchoredSpecConfigV1 {
    return loadProjectConfig(projectRoot);
  }

  static fromDirectory(startDir: string): EaRoot | null {
    const projectRoot = EaRoot.findProjectRoot(startDir);
    if (!projectRoot) return null;
    return new EaRoot(projectRoot, EaRoot.resolveProjectConfig(projectRoot));
  }

  private toEaLoadedEntities(result: BackstageEntityLoadResult): EaLoadedEntity[] {
    return result.details.map((detail: BackstageEntityLoadDetail) => ({
      entity: detail.entity,
      authoredEntity: detail.authoredEntity,
      filePath: detail.filePath,
      relativePath: detail.relativePath,
      domain: detail.domain,
      errors: detail.errors,
    }));
  }

  private toEntityLoadResult(details: EaLoadedEntity[]): EaEntityLoadResult {
    const entities = details.flatMap((detail) => (detail.entity ? [detail.entity] : []));
    const errors = details.flatMap((detail) => detail.errors);
    return { entities, details, errors };
  }

  private countManifestFiles(): number {
    let total = 0;

    const manifestPath = join(this.projectRoot, this.v1Config.manifestPath ?? "catalog-info.yaml");
    if (existsSync(manifestPath)) total += 1;

    if (this.v1Config.catalogDir) {
      total += countFilesWithExtensions(
        join(this.projectRoot, this.v1Config.catalogDir),
        new Set([".yaml", ".yml"]),
      );
    }

    return total;
  }

  isInitialized(): boolean {
    if (this.v1Config.entityMode === "inline") {
      const dirs = this.v1Config.inlineDocDirs ?? [this.v1Config.rootDir];
      return dirs.some((dir) => existsSync(join(this.projectRoot, dir)));
    }

    return this.countManifestFiles() > 0;
  }

  get workflowPolicyPath(): string {
    return join(
      this.projectRoot,
      this.v1Config.workflowPolicyPath ?? `${this.v1Config.rootDir}/workflow-policy.yaml`,
    );
  }

  async loadEntities(): Promise<EaEntityLoadResult> {
    const result = this.toEntityLoadResult(
      this.toEaLoadedEntities(
        await loadBackstageEntities(this.v1Config, this.projectRoot),
      ),
    );
    this.loaded = result;
    return result;
  }

  async loadEntityDomain(domain: EaDomain): Promise<EaEntityLoadResult> {
    const result = await this.loadEntities();
    return this.toEntityLoadResult(result.details.filter((detail) => detail.domain === domain));
  }

  loadPolicy(): Record<string, unknown> | null {
    const policyPath = this.workflowPolicyPath;
    if (!existsSync(policyPath)) return null;

    try {
      const content = readFileSync(policyPath, "utf-8");
      const ext = extname(policyPath).toLowerCase();
      if (ext === ".yaml" || ext === ".yml") {
        return parseYaml(content) as Record<string, unknown>;
      }
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  loadVerifications(): Record<string, unknown>[] {
    const verifications: Record<string, unknown>[] = [];
    for (const relativeDir of getVerificationSearchDirs(this.v1Config)) {
      const transitionsDir = join(this.projectRoot, relativeDir);
      if (!existsSync(transitionsDir)) continue;

      try {
        const entries = readdirSync(transitionsDir);
        for (const entry of entries) {
          const fullPath = join(transitionsDir, entry);
          if (!statSync(fullPath).isDirectory()) continue;

          const verifyJson = join(fullPath, "verification.json");
          if (existsSync(verifyJson)) {
            verifications.push(JSON.parse(readFileSync(verifyJson, "utf-8")) as Record<string, unknown>);
          }

          const verifyYaml = join(fullPath, "verification.yaml");
          if (existsSync(verifyYaml)) {
            verifications.push(parseYaml(readFileSync(verifyYaml, "utf-8")) as Record<string, unknown>);
          }
        }
      } catch {
        return verifications;
      }
    }

    return verifications;
  }

  getSummary(): EaEntitySummary {
    const entities = this.loaded?.entities ?? [];
    const errors = this.loaded?.errors ?? [];

    const byDomain: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    const bySchema: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let relationCount = 0;

    for (const entity of entities) {
      const domain = getEntityDomain(entity) ?? "unknown";
      const kind = getEntityKind(entity);
      const schema = getEntitySchema(entity);
      const status = getEntityStatus(entity);
      byDomain[domain] = (byDomain[domain] ?? 0) + 1;
      byKind[kind] = (byKind[kind] ?? 0) + 1;
      bySchema[schema] = (bySchema[schema] ?? 0) + 1;
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      relationCount += getEntitySpecRelations(entity).reduce((count, relation) => count + relation.targets.length, 0);
    }

    return {
      totalEntities: entities.length,
      byDomain,
      byKind,
      bySchema,
      byStatus,
      errorCount: errors.length,
      relationCount,
    };
  }

  getQuickSummary(): {
    initialized: boolean;
    fileCountByDomain: Record<string, number>;
    totalFiles: number;
    hasPolicy: boolean;
  } {
    if (!this.isInitialized()) {
      return { initialized: false, fileCountByDomain: {}, totalFiles: 0, hasPolicy: false };
    }

    const totalFiles = this.v1Config.entityMode === "inline"
      ? (this.v1Config.inlineDocDirs ?? [this.v1Config.rootDir]).reduce(
          (sum, dir) => sum + countFilesWithExtensions(join(this.projectRoot, dir), new Set([".md", ".markdown"])),
          0,
        )
      : this.countManifestFiles();

    return {
      initialized: true,
      fileCountByDomain: {},
      totalFiles,
      hasPolicy: existsSync(this.workflowPolicyPath),
    };
  }
}

function countFilesWithExtensions(dir: string, extensions: Set<string>): number {
  if (!existsSync(dir)) return 0;

  let count = 0;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        count += countFilesWithExtensions(fullPath, extensions);
      } else if (stat.isFile() && extensions.has(extname(entry).toLowerCase())) {
        count += 1;
      }
    }
  } catch {
    return count;
  }

  return count;
}
