import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

import type { BackstageEntity } from "./backstage/types.js";
import {
  ANCHORED_SPEC_API_VERSION,
  ANNOTATION_KEYS,
  parseBackstageYaml,
  writeBackstageManifest,
} from "./backstage/index.js";
import {
  getEntityId,
  getEntityTitle,
} from "./backstage/accessors.js";
import {
  getCatalogBootstrapConfig,
  getConfiguredDocSections,
  type AnchoredSpecConfigV1,
  type CatalogBootstrapOutputMode,
  type CatalogBootstrapProfile,
} from "./config.js";
import { validateEntities, validateEaRelations } from "./validate.js";
import { createDefaultRegistry } from "./relation-registry.js";

export interface CatalogEvidenceRecord {
  source: string;
  kind: string;
  path?: string;
  title?: string;
  signals: string[];
  weight: number;
  confidence: number;
  detail?: string;
}

export interface CatalogPlannedEntity {
  entityRef: string;
  entity: BackstageEntity;
  confidence: number;
  reason: string;
  evidence: CatalogEvidenceRecord[];
}

export interface CatalogPlanAction {
  action: "create" | "skip-existing";
  entityRef: string;
  reason: string;
}

export interface CatalogSuppressedCandidate {
  candidateRef: string;
  reason: string;
}

export interface CatalogPlan {
  archetype: string;
  confidence: number;
  writeTarget: string;
  plannedEntities: CatalogPlannedEntity[];
  actions: CatalogPlanAction[];
  suppressed: CatalogSuppressedCandidate[];
  validation: {
    errors: string[];
    warnings: string[];
  };
}

export interface CatalogPlanOptions {
  profile?: CatalogBootstrapProfile;
  outputMode?: CatalogBootstrapOutputMode;
  include?: string[];
  sourceDirs?: string[];
  minConfidence?: number;
  maxTopLevelComponents?: number;
}

export interface CatalogApplyResult {
  filePath: string;
  entityCount: number;
  merged: boolean;
}

interface ParsedMarkdownDoc {
  path: string;
  relativePath: string;
  title: string;
  summary: string;
  sections: Map<string, string>;
}

interface RepoContext {
  projectRoot: string;
  config: AnchoredSpecConfigV1;
  packageJson?: Record<string, unknown>;
  existingEntities: BackstageEntity[];
  bootstrap: ReturnType<typeof getCatalogBootstrapConfig>;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  "build",
  ".next",
  ".turbo",
]);

export async function buildCatalogPlan(
  projectRoot: string,
  config: AnchoredSpecConfigV1,
  options: CatalogPlanOptions = {},
): Promise<CatalogPlan> {
  const ctx = buildRepoContext(projectRoot, config);
  const bootstrap = ctx.bootstrap;
  const outputMode = options.outputMode ?? bootstrap.outputMode ?? "curated";
  const minConfidence = options.minConfidence ?? bootstrap.minConfidence ?? 0.6;
  const maxTopLevelComponents =
    options.maxTopLevelComponents ?? bootstrap.maxTopLevelComponents ?? 8;
  const include = normalizeIncludeSet(options.include, bootstrap.include);
  const archetypeResult = detectRepoArchetype(ctx, options.profile ?? bootstrap.profile ?? "auto");

  const evidence: CatalogEvidenceRecord[] = [];
  evidence.push(...collectPackageEvidence(ctx));

  const existingByRef = new Map(ctx.existingEntities.map((entity) => [getEntityId(entity), entity]));
  const packageSlug = inferRepoSlug(ctx);
  const packageTitle = titleCase(packageSlug);
  const ownerEntity = selectOwnerEntity(ctx, packageSlug, packageTitle);
  const ownerRef = getEntityId(ownerEntity.entity);
  const domainEntity = selectDomainEntity(ctx, packageSlug, packageTitle, ownerRef);
  const domainRef = getEntityId(domainEntity.entity);
  const systemEntity = selectSystemEntity(ctx, packageSlug, packageTitle, ownerRef, domainRef, archetypeResult.archetype);
  const systemRef = getEntityId(systemEntity.entity);

  const planned: CatalogPlannedEntity[] = [];
  const suppressed: CatalogSuppressedCandidate[] = [];

  if (include.has("owners")) planned.push(ownerEntity);
  if (include.has("domain")) planned.push(domainEntity);
  if (include.has("system")) planned.push(systemEntity);

  const componentDocs = collectDocsForFamily(ctx, "component", options.sourceDirs);
  const apiDocs = collectDocsForFamily(ctx, "api", options.sourceDirs);
  const businessDocs = collectDocsForFamily(ctx, "capability", options.sourceDirs);
  const requirementDocs = collectDocsForFamily(ctx, "requirement", options.sourceDirs);
  const decisionDocs = collectDocsForFamily(ctx, "decision", options.sourceDirs);

  const components = include.has("components")
    ? synthesizeComponents(ctx, componentDocs, ownerRef, systemRef, outputMode, maxTopLevelComponents)
    : [];
  const topLevelComponents = components.filter((entry) => entry.entity.spec?.subcomponentOf == null);
  if (topLevelComponents.length > maxTopLevelComponents) {
    const overflow = topLevelComponents.slice(maxTopLevelComponents);
    for (const entity of overflow) {
      suppressed.push({
        candidateRef: entity.entityRef,
        reason: `suppressed because it exceeds the top-level component cap (${maxTopLevelComponents})`,
      });
    }
  }

  const allowedComponentRefs = new Set(
    topLevelComponents
      .slice(0, maxTopLevelComponents)
      .map((entry) => entry.entityRef),
  );

  for (const component of components) {
    const subcomponentOf = typeof component.entity.spec?.subcomponentOf === "string"
      ? component.entity.spec.subcomponentOf
      : undefined;
    if (!subcomponentOf || allowedComponentRefs.has(component.entityRef) || allowedComponentRefs.has(subcomponentOf)) {
      planned.push(component);
    } else {
      suppressed.push({
        candidateRef: component.entityRef,
        reason: "suppressed because its parent component was not selected",
      });
    }
  }

  const apis = include.has("apis")
    ? synthesizeApis(ctx, apiDocs, ownerRef, systemRef, planned.filter((entry) => entry.entity.kind === "Component"))
    : [];
  planned.push(...apis);

  const capabilities = include.has("capabilities")
    ? synthesizeCapabilities(
        ctx,
        businessDocs,
        ownerRef,
        planned.filter((entry) => entry.entity.kind === "Component" || entry.entity.kind === "API"),
      )
    : [];
  planned.push(...capabilities);

  const requirements = include.has("requirements")
    ? synthesizeRequirements(ctx, requirementDocs, ownerRef)
    : [];
  planned.push(...requirements);

  const decisions = include.has("decisions")
    ? synthesizeDecisions(ctx, decisionDocs, ownerRef)
    : [];
  planned.push(...decisions);

  const filtered = dedupePlannedEntities(planned)
    .filter((entry) => entry.confidence >= minConfidence);

  const actions: CatalogPlanAction[] = filtered.map((entry) => ({
    action: existingByRef.has(entry.entityRef) ? "skip-existing" : "create",
    entityRef: entry.entityRef,
    reason: existingByRef.has(entry.entityRef)
      ? "entity already exists in the catalog"
      : entry.reason,
  }));

  for (const entry of dedupePlannedEntities(planned)) {
    if (entry.confidence < minConfidence) {
      suppressed.push({
        candidateRef: entry.entityRef,
        reason: `suppressed because confidence ${entry.confidence.toFixed(2)} is below the threshold ${minConfidence.toFixed(2)}`,
      });
    }
  }

  const validation = validatePlannedEntities(filtered.map((entry) => entry.entity), config);

  return {
    archetype: archetypeResult.archetype,
    confidence: archetypeResult.confidence,
    writeTarget:
      bootstrap.writeTarget ??
      config.manifestPath ??
      "catalog-info.yaml",
    plannedEntities: filtered,
    actions,
    suppressed: dedupeSuppressed(suppressed),
    validation,
  };
}

export function renderCatalogPlanText(plan: CatalogPlan, options?: { explain?: boolean }): string {
  const lines: string[] = [];
  lines.push("Anchored Spec — Catalog Bootstrap");
  lines.push("");
  lines.push(`Archetype: ${plan.archetype}`);
  lines.push(`Confidence: ${plan.confidence.toFixed(2)}`);
  lines.push("");
  lines.push("Planned entities:");
  for (const planned of plan.plannedEntities) {
    lines.push(`  + ${planned.entity.kind.padEnd(10)} ${planned.entity.metadata.name}`);
    if (options?.explain) {
      lines.push(`    reason: ${planned.reason}`);
    }
  }
  if (plan.suppressed.length > 0) {
    lines.push("");
    lines.push("Suppressed candidates:");
    for (const suppressed of plan.suppressed) {
      lines.push(`  - ${suppressed.candidateRef}`);
      lines.push(`    reason: ${suppressed.reason}`);
    }
  }
  lines.push("");
  lines.push("Write target:");
  lines.push(`  ${plan.writeTarget}`);
  if (options?.explain && (plan.validation.errors.length > 0 || plan.validation.warnings.length > 0)) {
    lines.push("");
    lines.push("Validation:");
    for (const error of plan.validation.errors) lines.push(`  error: ${error}`);
    for (const warning of plan.validation.warnings) lines.push(`  warning: ${warning}`);
  }
  return `${lines.join("\n")}\n`;
}

export function planToManifestYaml(plan: CatalogPlan): string {
  return writeBackstageManifest(plan.plannedEntities.map((entry) => entry.entity));
}

export async function applyCatalogPlan(
  plan: CatalogPlan,
  projectRoot: string,
  config: AnchoredSpecConfigV1,
  options?: {
    merge?: boolean;
    force?: boolean;
    writePath?: string;
  },
): Promise<CatalogApplyResult> {
  if (plan.validation.errors.length > 0) {
    throw new Error(`Catalog plan has validation errors:\n${plan.validation.errors.join("\n")}`);
  }

  const writeTarget = resolve(projectRoot, options?.writePath ?? plan.writeTarget);
  const merged = options?.merge ?? false;
  const nextEntities = plan.plannedEntities.map((entry) => entry.entity);

  if (merged && existsSync(writeTarget)) {
    const existing = parseBackstageYaml(readFileSync(writeTarget, "utf-8"), writeTarget)
      .entities
      .map((entry) => entry.entity);
    const byRef = new Map(existing.map((entity) => [getEntityId(entity), entity]));
    for (const entity of nextEntities) {
      const ref = getEntityId(entity);
      if (!byRef.has(ref)) byRef.set(ref, entity);
    }
    writeFileSync(writeTarget, writeBackstageManifest([...byRef.values()]), "utf-8");
    return { filePath: writeTarget, entityCount: byRef.size, merged: true };
  }

  if (!merged && existsSync(writeTarget) && !options?.force) {
    throw new Error(
      `Refusing to overwrite existing manifest: ${relative(projectRoot, writeTarget)}. Use --merge or --force.`,
    );
  }

  writeFileSync(writeTarget, writeBackstageManifest(nextEntities), "utf-8");
  return { filePath: writeTarget, entityCount: nextEntities.length, merged: false };
}

export function explainCatalogPlanEntity(
  plan: CatalogPlan,
  entityRef: string,
): CatalogPlannedEntity | undefined {
  const normalized = entityRef.trim().toLowerCase();
  return plan.plannedEntities.find((entry) => entry.entityRef.toLowerCase() === normalized);
}

function buildRepoContext(
  projectRoot: string,
  config: AnchoredSpecConfigV1,
): RepoContext {
  const packageJsonPath = join(projectRoot, "package.json");
  const packageJson = existsSync(packageJsonPath)
    ? JSON.parse(readFileSync(packageJsonPath, "utf-8")) as Record<string, unknown>
    : undefined;
  const existingEntities = loadExistingEntities(projectRoot, config);
  return {
    projectRoot,
    config,
    packageJson,
    existingEntities,
    bootstrap: getCatalogBootstrapConfig(config),
  };
}

function loadExistingEntities(
  projectRoot: string,
  config: AnchoredSpecConfigV1,
): BackstageEntity[] {
  if (config.entityMode !== "manifest") return [];
  const manifestPath = resolve(projectRoot, config.manifestPath ?? "catalog-info.yaml");
  if (!existsSync(manifestPath)) return [];
  const parsed = parseBackstageYaml(readFileSync(manifestPath, "utf-8"), manifestPath);
  return parsed.entities.map((entry) => entry.entity);
}

function inferRepoSlug(ctx: RepoContext): string {
  const packageName = typeof ctx.packageJson?.name === "string"
    ? ctx.packageJson.name
    : basename(ctx.projectRoot);
  const leaf = packageName.split("/").pop() ?? packageName;
  return slugify(leaf);
}

function normalizeIncludeSet(
  include: string[] | undefined,
  defaults: NonNullable<ReturnType<typeof getCatalogBootstrapConfig>["include"]> | undefined,
): Set<string> {
  if (include && include.length > 0) return new Set(include.map((item) => item.trim()).filter(Boolean));
  const entries = Object.entries(defaults ?? {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
  return new Set(entries);
}

function collectPackageEvidence(ctx: RepoContext): CatalogEvidenceRecord[] {
  const evidence: CatalogEvidenceRecord[] = [];
  if (!ctx.packageJson) return evidence;

  if (typeof ctx.packageJson.name === "string") {
    evidence.push({
      source: "package-json",
      kind: "package-name",
      title: ctx.packageJson.name,
      signals: [String(ctx.packageJson.name)],
      weight: 1.0,
      confidence: 0.95,
    });
  }

  if (ctx.packageJson.bin && typeof ctx.packageJson.bin === "object") {
    evidence.push({
      source: "package-json",
      kind: "cli-surface",
      title: "CLI surface",
      signals: ["bin"],
      weight: 0.9,
      confidence: 0.9,
    });
  }

  if (ctx.packageJson.exports && typeof ctx.packageJson.exports === "object") {
    evidence.push({
      source: "package-json",
      kind: "node-exports",
      title: "Node exports",
      signals: ["exports"],
      weight: 0.9,
      confidence: 0.9,
    });
  }

  return evidence;
}

function detectRepoArchetype(
  ctx: RepoContext,
  requestedProfile: CatalogBootstrapProfile,
): { archetype: string; confidence: number; reasons: string[] } {
  if (requestedProfile && requestedProfile !== "auto") {
    return { archetype: requestedProfile, confidence: 1, reasons: ["explicit profile override"] };
  }

  const reasons: string[] = [];
  let cliScore = 0;
  let libraryScore = 0;
  let serviceScore = 0;
  let webappScore = 0;
  let workspaceScore = 0;

  if (ctx.packageJson?.bin) {
    cliScore += 2;
    reasons.push("package.json exposes a bin entry");
  }
  if (ctx.packageJson?.exports) {
    libraryScore += 2;
    reasons.push("package.json exposes module exports");
  }

  if (existsSync(join(ctx.projectRoot, "src", "cli"))) {
    cliScore += 1.5;
    reasons.push("src/cli exists");
  }
  if (existsSync(join(ctx.projectRoot, "src", "ea")) || existsSync(join(ctx.projectRoot, "src", "lib"))) {
    libraryScore += 1.5;
    reasons.push("runtime library source directory exists");
  }
  if (existsSync(join(ctx.projectRoot, "Dockerfile")) || existsSync(join(ctx.projectRoot, "src", "server"))) {
    serviceScore += 1.2;
    reasons.push("service runtime files exist");
  }
  if (
    existsSync(join(ctx.projectRoot, "next.config.js")) ||
    existsSync(join(ctx.projectRoot, "next.config.mjs")) ||
    existsSync(join(ctx.projectRoot, "vite.config.ts")) ||
    existsSync(join(ctx.projectRoot, "src", "app")) ||
    existsSync(join(ctx.projectRoot, "src", "routes"))
  ) {
    webappScore += 1.2;
    reasons.push("web application scaffolding exists");
  }
  if (ctx.packageJson?.workspaces || existsSync(join(ctx.projectRoot, "pnpm-workspace.yaml"))) {
    workspaceScore += 1.2;
    reasons.push("workspace configuration exists");
  }

  const parts: string[] = [];
  if (cliScore >= 1.5) parts.push("cli");
  if (libraryScore >= 1.5) parts.push("library");
  if (serviceScore >= 1.2) parts.push("service");
  if (webappScore >= 1.2) parts.push("webapp");
  if (workspaceScore >= 1.2) parts.push("workspace");
  if (parts.length === 0) parts.push("library");

  const maxScore = Math.max(cliScore, libraryScore, serviceScore, webappScore, workspaceScore, 1);
  return {
    archetype: parts.join("+"),
    confidence: Math.min(0.99, 0.55 + maxScore / 5),
    reasons,
  };
}

function selectOwnerEntity(
  ctx: RepoContext,
  packageSlug: string,
  packageTitle: string,
): CatalogPlannedEntity {
  const existingGroup = ctx.existingEntities.find((entity) => entity.kind === "Group");
  if (existingGroup) {
    return {
      entityRef: getEntityId(existingGroup),
      entity: existingGroup,
      confidence: 1,
      reason: "existing group entity reused as the catalog owner",
      evidence: [{
        source: "catalog",
        kind: "existing-group",
        title: getEntityTitle(existingGroup),
        signals: [getEntityId(existingGroup)],
        weight: 1,
        confidence: 1,
      }],
    };
  }

  const name = `${packageSlug}-maintainers`;
  const entity = makeEntity("backstage.io/v1alpha1", "Group", name, {
    title: `${packageTitle} Maintainers`,
    description: `Team accountable for the ${packageTitle} repository and framework lifecycle.`,
    tags: ["team", "catalog-bootstrap"],
    spec: {
      type: ctx.bootstrap.defaults?.ownerType ?? "team",
      unitType: ctx.bootstrap.defaults?.ownerUnitType ?? "team",
      status: "active",
      children: [],
      profile: {
        displayName: `${packageTitle} Maintainers`,
      },
    },
  });
  return {
    entityRef: getEntityId(entity),
    entity,
    confidence: 0.92,
    reason: "derived owner group from repository identity",
    evidence: [{
      source: "package-json",
      kind: "owner-group",
      title: entity.metadata.title,
      signals: [packageSlug],
      weight: 0.9,
      confidence: 0.92,
    }],
  };
}

function selectDomainEntity(
  ctx: RepoContext,
  packageSlug: string,
  packageTitle: string,
  ownerRef: string,
): CatalogPlannedEntity {
  const existingDomain = ctx.existingEntities.find((entity) => entity.kind === "Domain");
  if (existingDomain) {
    return {
      entityRef: getEntityId(existingDomain),
      entity: existingDomain,
      confidence: 1,
      reason: "existing domain entity reused",
      evidence: [{
        source: "catalog",
        kind: "existing-domain",
        title: getEntityTitle(existingDomain),
        signals: [getEntityId(existingDomain)],
        weight: 1,
        confidence: 1,
      }],
    };
  }

  const entity = makeEntity("backstage.io/v1alpha1", "Domain", packageSlug, {
    title: packageTitle,
    description: `${packageTitle} domain synthesized from the repository identity and authored architecture docs.`,
    tags: ["domain", "catalog-bootstrap"],
    spec: {
      owner: ownerRef,
      status: "active",
    },
  });
  return {
    entityRef: getEntityId(entity),
    entity,
    confidence: 0.9,
    reason: "derived domain from repository package identity",
    evidence: [{
      source: "package-json",
      kind: "domain",
      title: entity.metadata.title,
      signals: [packageSlug],
      weight: 0.85,
      confidence: 0.9,
    }],
  };
}

function selectSystemEntity(
  ctx: RepoContext,
  packageSlug: string,
  packageTitle: string,
  ownerRef: string,
  domainRef: string,
  archetype: string,
): CatalogPlannedEntity {
  const existingSystem = ctx.existingEntities.find((entity) => entity.kind === "System");
  if (existingSystem) {
    return {
      entityRef: getEntityId(existingSystem),
      entity: existingSystem,
      confidence: 1,
      reason: "existing system entity reused",
      evidence: [{
        source: "catalog",
        kind: "existing-system",
        title: getEntityTitle(existingSystem),
        signals: [getEntityId(existingSystem)],
        weight: 1,
        confidence: 1,
      }],
    };
  }

  let systemName = packageSlug;
  if (archetype.includes("cli") && archetype.includes("library")) {
    systemName = `${packageSlug}-framework`;
  } else if (archetype.includes("workspace")) {
    systemName = `${packageSlug}-workspace`;
  }

  const entity = makeEntity("backstage.io/v1alpha1", "System", systemName, {
    title: titleCase(systemName),
    description: `${packageTitle} system synthesized from repository structure and public surfaces.`,
    tags: ["system", "catalog-bootstrap"],
    spec: {
      owner: ownerRef,
      domain: domainRef,
      status: "active",
    },
  });
  return {
    entityRef: getEntityId(entity),
    entity,
    confidence: 0.92,
    reason: "derived system from repository archetype and package identity",
    evidence: [{
      source: "package-json",
      kind: "system",
      title: entity.metadata.title,
      signals: [archetype, packageSlug],
      weight: 0.9,
      confidence: 0.92,
    }],
  };
}

function synthesizeComponents(
  ctx: RepoContext,
  docs: ParsedMarkdownDoc[],
  ownerRef: string,
  systemRef: string,
  outputMode: CatalogBootstrapOutputMode,
  maxTopLevelComponents: number,
): CatalogPlannedEntity[] {
  const planned: CatalogPlannedEntity[] = [];
  const lifecycle = ctx.bootstrap.defaults?.componentLifecycle ?? "production";
  const topLevel = docs.length > 0
    ? docs.slice(0, maxTopLevelComponents)
    : inferFallbackComponents(ctx);

  for (const doc of topLevel) {
    const title = doc.title || titleCase(slugify(basename(doc.relativePath, ".md")));
    const name = slugify(title);
    const type = inferComponentType(title, doc.summary, ctx);
    const codeLocation = inferComponentCodeLocation(ctx, doc, type);
    const entity = makeEntity("backstage.io/v1alpha1", "Component", name, {
      title,
      description: doc.summary || `${title} synthesized from component-level repository evidence.`,
      tags: ["component", type],
      annotations: {
        ...(doc.path ? { [ANNOTATION_KEYS.SOURCE]: doc.relativePath } : {}),
        ...(codeLocation ? { [ANNOTATION_KEYS.CODE_LOCATION]: codeLocation } : {}),
      },
      spec: {
        type,
        lifecycle,
        owner: ownerRef,
        system: systemRef,
      },
    });
    planned.push({
      entityRef: getEntityId(entity),
      entity,
      confidence: doc.path ? 0.95 : 0.72,
      reason: doc.path
        ? `component documentation found at ${doc.relativePath}`
        : "component inferred from repository archetype",
      evidence: [{
        source: doc.path ? "docs" : "archetype",
        kind: "component",
        path: doc.relativePath,
        title,
        signals: [type, title],
        weight: doc.path ? 1 : 0.7,
        confidence: doc.path ? 0.95 : 0.72,
      }],
    });

    if (outputMode === "expanded" && doc.sections.has("Key Components")) {
      const subheadings = getSectionSubheadings(doc.sections.get("Key Components") ?? "");
      for (const sub of subheadings) {
        const childName = slugify(sub.heading);
        const childEntity = makeEntity("backstage.io/v1alpha1", "Component", childName, {
          title: sub.heading,
          description: getFirstParagraph(sub.body) || `${sub.heading} synthesized from the Key Components section in ${doc.relativePath}.`,
          tags: ["component", "subcomponent"],
          annotations: {
            [ANNOTATION_KEYS.SOURCE]: doc.relativePath,
          },
          spec: {
            type: "library",
            lifecycle,
            owner: ownerRef,
            system: systemRef,
            subcomponentOf: getEntityId(entity),
          },
        });
        planned.push({
          entityRef: getEntityId(childEntity),
          entity: childEntity,
          confidence: 0.88,
          reason: `subcomponent synthesized from the Key Components section in ${doc.relativePath}`,
          evidence: [{
            source: "docs",
            kind: "subcomponent",
            path: doc.relativePath,
            title: sub.heading,
            signals: ["key-components", sub.heading],
            weight: 0.9,
            confidence: 0.88,
          }],
        });
      }
    }
  }

  return planned;
}

function synthesizeApis(
  ctx: RepoContext,
  docs: ParsedMarkdownDoc[],
  ownerRef: string,
  systemRef: string,
  components: CatalogPlannedEntity[],
): CatalogPlannedEntity[] {
  const planned: CatalogPlannedEntity[] = [];
  const lifecycle = ctx.bootstrap.defaults?.apiLifecycle ?? "production";
  const repoSlug = inferRepoSlug(ctx);

  for (const doc of docs) {
    if (!looksLikeApiDoc(doc)) continue;
    const title = doc.title;
    const rawName = slugify(title);
    const name = rawName.startsWith(repoSlug) ? rawName : `${repoSlug}-${rawName}`;
    const type = inferApiType(title, doc.summary);
    const entity = makeEntity("backstage.io/v1alpha1", "API", name, {
      title,
      description: doc.summary || `${title} synthesized from API documentation.`,
      tags: ["api", type],
      annotations: {
        [ANNOTATION_KEYS.SOURCE]: doc.relativePath,
      },
      spec: {
        type,
        lifecycle,
        owner: ownerRef,
        system: systemRef,
        definition: doc.relativePath,
      },
    });

    const entityRef = getEntityId(entity);
    planned.push({
      entityRef,
      entity,
      confidence: 0.95,
      reason: `API documentation found at ${doc.relativePath}`,
      evidence: [{
        source: "docs",
        kind: "api",
        path: doc.relativePath,
        title,
        signals: [type, title],
        weight: 1,
        confidence: 0.95,
      }],
    });

    const ownerComponent = matchApiToComponent(doc, components);
    if (ownerComponent) {
      const providesApis = Array.isArray(ownerComponent.entity.spec?.providesApis)
        ? [...ownerComponent.entity.spec.providesApis as string[], entityRef]
        : [entityRef];
      ownerComponent.entity = {
        ...ownerComponent.entity,
        spec: {
          ...ownerComponent.entity.spec,
          providesApis,
        },
      };
    }
  }

  return planned;
}

function synthesizeCapabilities(
  ctx: RepoContext,
  docs: ParsedMarkdownDoc[],
  ownerRef: string,
  supporters: CatalogPlannedEntity[],
): CatalogPlannedEntity[] {
  const planned: CatalogPlannedEntity[] = [];
  const items = new Set<string>();

  for (const doc of docs) {
    const section = doc.sections.get("Capability Stack");
    if (!section) continue;
    for (const bullet of extractBulletList(section)) items.add(bullet);
  }

  let previousRef: string | undefined;
  for (const item of items) {
    const name = slugify(item);
    const supportedBy = inferCapabilitySupport(item, supporters);
    const entity = makeEntity(ANCHORED_SPEC_API_VERSION, "Capability", name, {
      title: titleCase(item),
      description: `${titleCase(item)} synthesized from the repository business architecture.`,
      tags: ["capability"],
      spec: {
        owner: ownerRef,
        status: "active",
        level: ctx.bootstrap.defaults?.capabilityLevel ?? 1,
        ...(supportedBy.length > 0 ? { supportedBy } : {}),
        ...(previousRef ? { dependsOn: [previousRef] } : {}),
      },
    });
    const entityRef = getEntityId(entity);
    planned.push({
      entityRef,
      entity,
      confidence: 0.92,
      reason: "capability extracted from a Capability Stack section",
      evidence: [{
        source: "docs",
        kind: "capability",
        title: item,
        signals: supportedBy,
        weight: 0.95,
        confidence: 0.92,
      }],
    });
    previousRef = entityRef;
  }

  return planned;
}

function synthesizeRequirements(
  ctx: RepoContext,
  docs: ParsedMarkdownDoc[],
  ownerRef: string,
): CatalogPlannedEntity[] {
  const planned: CatalogPlannedEntity[] = [];
  let previousRef: string | undefined;

  for (const doc of docs) {
    const name = slugify(basename(doc.relativePath, ".md"));
    const category = inferRequirementType(doc);
    const requirementSummary = doc.sections.get("Requirement") ?? doc.summary;
    const explicitRefs = extractDocumentRefs(doc, "REQ");
    const dependsOn = explicitRefs.length > 0
      ? explicitRefs
      : previousRef
        ? [previousRef]
        : [];
    const entity = makeEntity(ANCHORED_SPEC_API_VERSION, "Requirement", name, {
      title: normalizeLeadingIdentifier(doc.title, "REQ"),
      description: getFirstParagraph(requirementSummary) || doc.summary,
      tags: ["requirement", category],
      annotations: {
        [ANNOTATION_KEYS.SOURCE]: doc.relativePath,
      },
      spec: {
        type: category,
        status: "implemented",
        owner: ownerRef,
        ...(dependsOn.length > 0 ? { dependsOn } : {}),
      },
    });
    const entityRef = getEntityId(entity);
    planned.push({
      entityRef,
      entity,
      confidence: 0.94,
      reason: `requirement document found at ${doc.relativePath}`,
      evidence: [{
        source: "docs",
        kind: "requirement",
        path: doc.relativePath,
        title: doc.title,
        signals: [category],
        weight: 1,
        confidence: 0.94,
      }],
    });
    previousRef = entityRef;
  }

  return planned;
}

function synthesizeDecisions(
  ctx: RepoContext,
  docs: ParsedMarkdownDoc[],
  ownerRef: string,
): CatalogPlannedEntity[] {
  const planned: CatalogPlannedEntity[] = [];
  let previousRef: string | undefined;

  for (const doc of docs) {
    const status = (getFirstParagraph(doc.sections.get("Status") ?? "proposed").toLowerCase().split(/\s+/)[0] || "proposed")
      .replace(/[^\w-]/g, "");
    const explicitRefs = extractDocumentRefs(doc, "ADR");
    const dependsOn = explicitRefs.length > 0
      ? explicitRefs
      : previousRef
        ? [previousRef]
        : [];
    const entity = makeEntity(ANCHORED_SPEC_API_VERSION, "Decision", slugify(basename(doc.relativePath, ".md")), {
      title: normalizeLeadingIdentifier(doc.title, "ADR"),
      description: getFirstParagraph(doc.sections.get("Decision") ?? doc.summary) || doc.summary,
      tags: ["decision", status],
      annotations: {
        [ANNOTATION_KEYS.SOURCE]: doc.relativePath,
      },
      spec: {
        status: normalizeDecisionStatus(status),
        owner: ownerRef,
        decision: getFirstParagraph(doc.sections.get("Decision") ?? ""),
        context: getFirstParagraph(doc.sections.get("Context") ?? ""),
        rationale: getFirstParagraph(doc.sections.get("Consequences") ?? ""),
        ...(dependsOn.length > 0 ? { dependsOn } : {}),
      },
    });
    const entityRef = getEntityId(entity);
    planned.push({
      entityRef,
      entity,
      confidence: 0.94,
      reason: `decision record found at ${doc.relativePath}`,
      evidence: [{
        source: "docs",
        kind: "decision",
        path: doc.relativePath,
        title: doc.title,
        signals: [status],
        weight: 1,
        confidence: 0.94,
      }],
    });
    previousRef = entityRef;
  }

  return planned;
}

function collectDocsForFamily(
  ctx: RepoContext,
  family: "component" | "api" | "capability" | "requirement" | "decision",
  extraDirs?: string[],
): ParsedMarkdownDoc[] {
  const docs: ParsedMarkdownDoc[] = [];
  const sections = getConfiguredDocSections(ctx.config);
  const seen = new Set<string>();

  for (const section of sections) {
    if (!matchesSectionFamily(section, family)) continue;
    const absDir = resolve(ctx.projectRoot, section.path);
    for (const filePath of walkMarkdown(absDir)) {
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      docs.push(parseMarkdownDoc(ctx.projectRoot, filePath));
    }
  }

  for (const dir of extraDirs ?? []) {
    const absDir = resolve(ctx.projectRoot, dir);
    for (const filePath of walkMarkdown(absDir)) {
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      docs.push(parseMarkdownDoc(ctx.projectRoot, filePath));
    }
  }

  return docs.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function matchesSectionFamily(
  section: { id: string; title: string; path: string; kind: string; domains?: string[] },
  family: "component" | "api" | "capability" | "requirement" | "decision",
): boolean {
  const id = section.id.toLowerCase();
  const title = section.title.toLowerCase();
  const path = section.path.toLowerCase();
  switch (family) {
    case "decision":
      return section.kind === "decision-record" || id.includes("adr") || title.includes("decision");
    case "requirement":
      return section.kind === "requirement" || id.includes("req") || title.includes("requirement");
    case "component":
      return id.includes("component") || title.includes("component") || path.includes("component");
    case "api":
      return id === "api" || id.includes("api") || title.includes("api") || path.includes("/06-api");
    case "capability":
      return (
        id.includes("business") ||
        title.includes("business") ||
        section.domains?.includes("business") === true
      );
  }
}

function inferFallbackComponents(ctx: RepoContext): ParsedMarkdownDoc[] {
  const docs: ParsedMarkdownDoc[] = [];
  if (ctx.packageJson?.bin || existsSync(join(ctx.projectRoot, "src", "cli"))) {
    docs.push({
      path: "",
      relativePath: "src/cli",
      title: `${titleCase(inferRepoSlug(ctx))} CLI`,
      summary: "CLI component inferred from package metadata and source structure.",
      sections: new Map(),
    });
  }
  if (ctx.packageJson?.exports || existsSync(join(ctx.projectRoot, "src", "ea")) || existsSync(join(ctx.projectRoot, "src", "lib"))) {
    docs.push({
      path: "",
      relativePath: existsSync(join(ctx.projectRoot, "src", "ea")) ? "src/ea" : "src/lib",
      title: `${titleCase(inferRepoSlug(ctx))} Runtime`,
      summary: "Runtime or library component inferred from source structure and package exports.",
      sections: new Map(),
    });
  }
  if (docs.length === 0) {
    docs.push({
      path: "",
      relativePath: "src",
      title: titleCase(inferRepoSlug(ctx)),
      summary: "Primary repository runtime inferred from the package identity.",
      sections: new Map(),
    });
  }
  return docs;
}

function inferComponentType(title: string, summary: string, ctx: RepoContext): string {
  const haystack = `${title} ${summary}`.toLowerCase();
  if (haystack.includes("cli") || haystack.includes("command")) return "tool";
  if (haystack.includes("runtime") || haystack.includes("library") || haystack.includes("sdk")) return "library";
  if (haystack.includes("website") || haystack.includes("webapp")) return "website";
  if (haystack.includes("worker")) return "worker";
  if (ctx.packageJson?.exports && !ctx.packageJson?.bin) return "library";
  return "service";
}

function inferComponentCodeLocation(
  ctx: RepoContext,
  doc: ParsedMarkdownDoc,
  componentType: string,
): string | undefined {
  const directLocation = normalizeCodeLocationPath(ctx, doc.relativePath);
  if (directLocation?.startsWith("src/")) return directLocation;

  const titleTokens = new Set(tokenize(`${doc.title} ${doc.summary}`));
  const topLevelSourceDir = pickTopLevelSourceDir(ctx, titleTokens);
  if (topLevelSourceDir) return topLevelSourceDir;

  const haystack = `${doc.title} ${doc.summary}`.toLowerCase();
  if ((haystack.includes("cli") || haystack.includes("command")) && existsSync(join(ctx.projectRoot, "src", "cli"))) {
    return "src/cli/";
  }
  if ((haystack.includes("runtime") || haystack.includes("library") || componentType === "library")) {
    const runtimeDir = existsSync(join(ctx.projectRoot, "src", "ea"))
      ? "src/ea/"
      : existsSync(join(ctx.projectRoot, "src", "lib"))
        ? "src/lib/"
        : undefined;
    if (runtimeDir) return runtimeDir;
  }
  if ((haystack.includes("web") || haystack.includes("frontend") || haystack.includes("ui")) && existsSync(join(ctx.projectRoot, "src", "app"))) {
    return "src/app/";
  }
  if ((haystack.includes("web") || haystack.includes("frontend") || haystack.includes("ui")) && existsSync(join(ctx.projectRoot, "src", "routes"))) {
    return "src/routes/";
  }
  if ((haystack.includes("server") || haystack.includes("service")) && existsSync(join(ctx.projectRoot, "src", "server"))) {
    return "src/server/";
  }

  return normalizeCodeLocationPath(ctx, "src");
}

function pickTopLevelSourceDir(ctx: RepoContext, titleTokens: Set<string>): string | undefined {
  const srcDir = join(ctx.projectRoot, "src");
  if (!existsSync(srcDir)) return undefined;

  let bestMatch: { path: string; score: number } | undefined;
  for (const entry of readdirSync(srcDir)) {
    const candidate = join(srcDir, entry);
    if (!statSync(candidate).isDirectory()) continue;
    const candidateTokens = tokenize(entry);
    const score = candidateTokens.filter((token) => titleTokens.has(token)).length;
    if (score === 0) continue;
    const path = normalizeCodeLocationPath(ctx, join("src", entry));
    if (!path) continue;
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { path, score };
    }
  }

  return bestMatch?.path;
}

function normalizeCodeLocationPath(ctx: RepoContext, repoRelativePath: string): string | undefined {
  const normalized = repoRelativePath.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (!normalized) return undefined;
  const absPath = resolve(ctx.projectRoot, normalized);
  if (!existsSync(absPath)) return undefined;
  return statSync(absPath).isDirectory() ? `${normalized}/` : normalized;
}

function looksLikeApiDoc(doc: ParsedMarkdownDoc): boolean {
  const lowerTitle = doc.title.toLowerCase();
  const fileName = basename(doc.relativePath).toLowerCase();
  if (fileName.includes("error-codes")) return false;
  return lowerTitle.includes("api") || fileName.includes("-api");
}

function inferApiType(title: string, summary: string): string {
  const haystack = `${title} ${summary}`.toLowerCase();
  if (haystack.includes("cli")) return "cli";
  if (haystack.includes("node") || haystack.includes("typescript") || haystack.includes("javascript")) return "typescript";
  if (haystack.includes("webhook")) return "asyncapi";
  if (haystack.includes("rest") || haystack.includes("openapi")) return "openapi";
  return "openapi";
}

function matchApiToComponent(
  apiDoc: ParsedMarkdownDoc,
  components: CatalogPlannedEntity[],
): CatalogPlannedEntity | undefined {
  const title = apiDoc.title.toLowerCase();
  if (title.includes("cli")) {
    return components.find((entry) => entry.entity.metadata.title?.toLowerCase().includes("cli"));
  }
  if (title.includes("node") || title.includes("typescript")) {
    return components.find((entry) => {
      const componentTitle = entry.entity.metadata.title?.toLowerCase() ?? "";
      return componentTitle.includes("runtime") || componentTitle.includes("library");
    });
  }
  return components[0];
}

function inferCapabilitySupport(
  capability: string,
  supporters: CatalogPlannedEntity[],
): string[] {
  const tokens = tokenize(capability);
  const refs: string[] = [];

  for (const supporter of supporters) {
    const supporterText = `${supporter.entity.metadata.title ?? ""} ${supporter.entity.metadata.description ?? ""} ${(supporter.entity.metadata.tags ?? []).join(" ")}`.toLowerCase();
    const overlap = tokens.some((token) => supporterText.includes(token));
    if (overlap) refs.push(supporter.entityRef);
  }

  if (refs.length > 0) return refs;

  const genericKeywordMap: Array<{ keywords: string[]; matches: string[] }> = [
    { keywords: ["discover", "bootstrap", "observed"], matches: ["discover", "cli"] },
    { keywords: ["drift"], matches: ["discover", "report"] },
    { keywords: ["govern", "policy", "semantic"], matches: ["govern", "cli", "report"] },
    { keywords: ["document", "review", "context", "agent", "ai"], matches: ["docs", "trace", "report", "cli"] },
    { keywords: ["artifact", "derive", "generate"], matches: ["generate", "report", "api"] },
    { keywords: ["author", "architecture", "model"], matches: ["model", "runtime", "api", "cli"] },
  ];

  const matchWords = genericKeywordMap.find((entry) => entry.keywords.some((keyword) => capability.toLowerCase().includes(keyword)))?.matches ?? [];
  for (const supporter of supporters) {
    const text = `${supporter.entity.metadata.title ?? ""} ${supporter.entity.metadata.description ?? ""} ${(supporter.entity.metadata.tags ?? []).join(" ")}`.toLowerCase();
    if (matchWords.some((match) => text.includes(match))) refs.push(supporter.entityRef);
  }

  return [...new Set(refs)];
}

function inferRequirementType(doc: ParsedMarkdownDoc): string {
  const haystack = `${doc.title} ${doc.summary} ${doc.sections.get("Requirement") ?? ""}`.toLowerCase();
  if (haystack.includes("security")) return "security";
  if (haystack.includes("information")) return "information";
  if (haystack.includes("data")) return "data";
  if (haystack.includes("functional")) return "functional";
  return "technical";
}

function normalizeDecisionStatus(status: string): string {
  switch (status) {
    case "accepted":
      return "accepted";
    case "deprecated":
      return "deprecated";
    case "superseded":
      return "superseded";
    default:
      return "proposed";
  }
}

function extractDocumentRefs(doc: ParsedMarkdownDoc, prefix: "ADR" | "REQ"): string[] {
  const refs = new Set<string>();
  const regex = new RegExp(`${prefix}-\\d+`, "g");
  const selfMatch = doc.title.match(new RegExp(`^${prefix}-(\\d+)`, "i"));
  const selfRef = selfMatch
    ? `${prefix === "ADR" ? "decision" : "requirement"}:default/${slugify(`${prefix}-${selfMatch[1]}`)}`
    : undefined;
  for (const match of `${doc.title}\n${doc.summary}\n${[...doc.sections.values()].join("\n")}`.match(regex) ?? []) {
    refs.add(`${prefix === "ADR" ? "decision" : "requirement"}:default/${slugify(match)}`);
  }
  return [...refs].filter((ref) => ref !== selfRef);
}

function validatePlannedEntities(
  entities: BackstageEntity[],
  config: AnchoredSpecConfigV1,
): { errors: string[]; warnings: string[] } {
  const quality = validateEntities(entities, { quality: config.quality });
  const relations = validateEaRelations(entities, createDefaultRegistry(), { quality: config.quality });
  return {
    errors: [...quality.errors, ...relations.errors].map((entry) => `${entry.path}: ${entry.message}`),
    warnings: [...quality.warnings, ...relations.warnings].map((entry) => `${entry.path}: ${entry.message}`),
  };
}

function dedupePlannedEntities(entries: CatalogPlannedEntity[]): CatalogPlannedEntity[] {
  const map = new Map<string, CatalogPlannedEntity>();
  for (const entry of entries) {
    const existing = map.get(entry.entityRef);
    if (!existing || existing.confidence < entry.confidence) {
      map.set(entry.entityRef, entry);
    }
  }
  return [...map.values()];
}

function dedupeSuppressed(entries: CatalogSuppressedCandidate[]): CatalogSuppressedCandidate[] {
  const map = new Map<string, CatalogSuppressedCandidate>();
  for (const entry of entries) {
    map.set(`${entry.candidateRef}:${entry.reason}`, entry);
  }
  return [...map.values()];
}

function makeEntity(
  apiVersion: string,
  kind: string,
  name: string,
  input: {
    title?: string;
    description?: string;
    tags?: string[];
    annotations?: Record<string, string>;
    spec: Record<string, unknown>;
  },
): BackstageEntity {
  return {
    apiVersion,
    kind,
    metadata: {
      name,
      ...(input.title ? { title: input.title } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.tags && input.tags.length > 0 ? { tags: input.tags } : {}),
      ...(input.annotations && Object.keys(input.annotations).length > 0
        ? { annotations: input.annotations }
        : {}),
    },
    spec: input.spec,
  } as BackstageEntity;
}

function walkMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const filePath = join(dir, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      results.push(...walkMarkdown(filePath));
    } else if (stat.isFile() && filePath.endsWith(".md")) {
      results.push(filePath);
    }
  }
  return results;
}

function parseMarkdownDoc(projectRoot: string, filePath: string): ParsedMarkdownDoc {
  const content = readFileSync(filePath, "utf-8");
  const title = getFirstHeading(content, 1) ?? titleCase(slugify(basename(filePath, ".md")));
  const sections = extractSections(content);
  return {
    path: filePath,
    relativePath: relative(projectRoot, filePath),
    title,
    summary: getLeadParagraph(content),
    sections,
  };
}

function getFirstHeading(content: string, level: number): string | undefined {
  const regex = new RegExp(`^${"#".repeat(level)}\\s+(.+)$`, "m");
  return regex.exec(content)?.[1]?.trim();
}

function getLeadParagraph(content: string): string {
  const body = content
    .replace(/^# .+\n+/m, "")
    .split(/\n##\s+/)[0] ?? "";
  return getFirstParagraph(body);
}

function extractSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  let current: string | null = null;
  const buffer: string[] = [];

  const flush = () => {
    if (current != null) sections.set(current, buffer.join("\n").trim());
    buffer.length = 0;
  };

  for (const line of lines) {
    const match = /^##\s+(.+)$/.exec(line);
    if (match) {
      flush();
      current = match[1]!.trim();
      continue;
    }
    if (current != null) buffer.push(line);
  }
  flush();
  return sections;
}

function getSectionSubheadings(content: string): Array<{ heading: string; body: string }> {
  const results: Array<{ heading: string; body: string }> = [];
  const lines = content.split(/\r?\n/);
  let current: string | null = null;
  const buffer: string[] = [];

  const flush = () => {
    if (current != null) {
      results.push({ heading: current, body: buffer.join("\n").trim() });
    }
    buffer.length = 0;
  };

  for (const line of lines) {
    const match = /^###\s+(.+)$/.exec(line);
    if (match) {
      flush();
      current = match[1]!.trim();
      continue;
    }
    if (current != null) buffer.push(line);
  }
  flush();
  return results;
}

function extractBulletList(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => /^-\s+(.+)$/.exec(line)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function getFirstParagraph(content: string): string {
  return content
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0 && !part.startsWith("#")) ?? "";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((part) => part.length >= 3);
}

function normalizeLeadingIdentifier(title: string, prefix: "ADR" | "REQ"): string {
  return title
    .replace(new RegExp(`^${prefix}-\\d+:\\s*`, "i"), `${prefix}-`)
    .replace(/:\s*/, " ");
}
