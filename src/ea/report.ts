/**
 * Anchored Spec — EA Reports
 *
 * Report generators that produce cross-reference matrices and summaries
 * from loaded EA artifacts.
 */

import type { BackstageEntity } from "./backstage/types.js";
import { getEntityDomain, getEntityId, getEntityLegacyKind, getEntityTitle, getEntityStatus, getEntitySpecRelations, getEntityTraceRefs, getSpecField } from "./backstage/accessors.js";
import { EA_DOMAINS } from "./types.js";
import { evaluateEaDrift } from "./drift.js";
import type { DomainDriftSummary } from "./drift.js";
import { detectEaDrift } from "./drift.js";

function getFlatRelations(entity: BackstageEntity): Array<{ type: string; target: string }> {
  return getEntitySpecRelations(entity).flatMap((r) =>
    r.targets.map((t) => ({ type: r.legacyType, target: t })),
  );
}

// ─── System-Data Matrix ─────────────────────────────────────────────────────────

/** A single cell in the system-data matrix. */
export interface SystemDataCell {
  applicationId: string;
  applicationTitle: string;
  dataStoreId: string;
  dataStoreTitle: string;
  relationType: string;
  logicalModels: Array<{
    id: string;
    title: string;
    classifications: string[];
  }>;
}

/** Full system-data matrix report output. */
export interface SystemDataMatrixReport {
  applications: Array<{ id: string; title: string; status: string }>;
  dataStores: Array<{ id: string; title: string; technology?: string; status: string }>;
  matrix: SystemDataCell[];
  classifications: string[];
  summary: {
    applicationCount: number;
    dataStoreCount: number;
    connectionCount: number;
    classificationCount: number;
  };
}

/**
 * Build a system-data matrix showing applications → data stores → logical models → classifications.
 *
 * Walks:
 *  1. All `application` artifacts
 *  2. Their `uses` relations targeting `data-store` artifacts
 *  3. Each data-store's `stores` relations targeting `logical-data-model` artifacts
 *  4. Each LDM's attributes' `classification` fields
 */
export function buildSystemDataMatrix(entities: BackstageEntity[]): SystemDataMatrixReport {
  const byId = new Map<string, BackstageEntity>();
  for (const a of entities) {
    byId.set(getEntityId(a), a);
  }

  const apps = entities.filter((a) => getEntityLegacyKind(a) === "application");
  const stores = entities.filter((a) => getEntityLegacyKind(a) === "data-store");
  const ldms = entities.filter((a) => getEntityLegacyKind(a) === "logical-data-model");

  // Build store → LDMs index
  const storeToLdms = new Map<string, BackstageEntity[]>();
  for (const store of stores) {
    for (const rel of getFlatRelations(store)) {
      if (rel.type === "stores") {
        const target = byId.get(rel.target);
        if (target && getEntityLegacyKind(target) === "logical-data-model") {
          const list = storeToLdms.get(getEntityId(store)) ?? [];
          list.push(target);
          storeToLdms.set(getEntityId(store), list);
        }
      }
    }
  }

  // Also check LDMs with implementedBy → data-store
  for (const ldm of ldms) {
    for (const rel of getFlatRelations(ldm)) {
      if (rel.type === "implementedBy") {
        const target = byId.get(rel.target);
        if (target && getEntityLegacyKind(target) === "data-store") {
          const list = storeToLdms.get(getEntityId(target)) ?? [];
          if (!list.some((l) => getEntityId(l) === getEntityId(ldm))) {
            list.push(ldm);
            storeToLdms.set(getEntityId(target), list);
          }
        }
      }
    }
  }

  const allClassifications = new Set<string>();
  const matrix: SystemDataCell[] = [];

  for (const app of apps) {
    for (const rel of getFlatRelations(app)) {
      if (rel.type !== "uses") continue;
      const store = byId.get(rel.target);
      if (!store || getEntityLegacyKind(store) !== "data-store") continue;

      const linkedLdms = storeToLdms.get(getEntityId(store)) ?? [];
      const logicalModels = linkedLdms.map((ldm) => {
        const attributes = getSpecField<Array<{ classification?: string }>>(ldm, "attributes") ?? [];
        const classifications = attributes
          .map((attr) => attr.classification)
          .filter((c): c is string => !!c);
        for (const c of classifications) allClassifications.add(c);
        return {
          id: getEntityId(ldm),
          title: getEntityTitle(ldm),
          classifications: [...new Set(classifications)],
        };
      });

      matrix.push({
        applicationId: getEntityId(app),
        applicationTitle: getEntityTitle(app),
        dataStoreId: getEntityId(store),
        dataStoreTitle: getEntityTitle(store),
        relationType: rel.type,
        logicalModels,
      });
    }
  }

  return {
    applications: apps.map((a) => ({ id: getEntityId(a), title: getEntityTitle(a), status: getEntityStatus(a) })),
    dataStores: stores.map((s) => {
      const tech = getSpecField<{ engine?: string }>(s, "technology");
      return {
        id: getEntityId(s),
        title: getEntityTitle(s),
        technology: tech?.engine,
        status: getEntityStatus(s),
      };
    }),
    matrix,
    classifications: [...allClassifications].sort(),
    summary: {
      applicationCount: apps.length,
      dataStoreCount: stores.length,
      connectionCount: matrix.length,
      classificationCount: allClassifications.size,
    },
  };
}

/**
 * Render a system-data matrix report as a Markdown table.
 */
export function renderSystemDataMatrixMarkdown(report: SystemDataMatrixReport): string {
  const lines: string[] = [];

  lines.push("# System-Data Matrix");
  lines.push("");
  lines.push(`> ${report.summary.applicationCount} applications, ${report.summary.dataStoreCount} data stores, ${report.summary.connectionCount} connections`);
  lines.push("");

  if (report.matrix.length === 0) {
    lines.push("_No application → data-store connections found._");
    return lines.join("\n") + "\n";
  }

  // Table header
  lines.push("| Application | Data Store | Technology | Logical Models | Classifications |");
  lines.push("|-------------|------------|------------|----------------|-----------------|");

  for (const cell of report.matrix) {
    const store = report.dataStores.find((s) => s.id === cell.dataStoreId);
    const tech = store?.technology ?? "—";
    const models = cell.logicalModels.length > 0
      ? cell.logicalModels.map((m) => m.title).join(", ")
      : "—";
    const classifs = cell.logicalModels.length > 0
      ? [...new Set(cell.logicalModels.flatMap((m) => m.classifications))].join(", ") || "—"
      : "—";

    lines.push(`| ${cell.applicationTitle} | ${cell.dataStoreTitle} | ${tech} | ${models} | ${classifs} |`);
  }

  if (report.classifications.length > 0) {
    lines.push("");
    lines.push("## Data Classifications");
    lines.push("");
    for (const c of report.classifications) {
      lines.push(`- ${c}`);
    }
  }

  return lines.join("\n") + "\n";
}

// ─── Classification Coverage Report ─────────────────────────────────────────────

/** An entity covered by a classification. */
export interface ClassifiedEntity {
  entityId: string;
  entityTitle: string;
  kind: string;
}

/** A store that should enforce a classification. */
export interface ClassificationStore {
  storeId: string;
  storeTitle: string;
  enforced: boolean;
}

/** Per-classification coverage entry. */
export interface ClassificationCoverageEntry {
  classificationId: string;
  classificationTitle: string;
  level: string;
  coveredEntities: ClassifiedEntity[];
  stores: ClassificationStore[];
  exchanges: Array<{
    exchangeId: string;
    exchangeTitle: string;
    declaresClassification: boolean;
  }>;
  enforcementGaps: string[];
}

/** Full classification coverage report. */
export interface ClassificationCoverageReport {
  classifications: ClassificationCoverageEntry[];
  summary: {
    classificationCount: number;
    coveredEntityCount: number;
    totalStoreCount: number;
    enforcedStoreCount: number;
    gapCount: number;
    exchangeCount: number;
    exchangeGapCount: number;
  };
}

/**
 * Build a classification coverage report.
 *
 * For each classification:
 *  1. Find all entities/artifacts with classifiedAs → this classification
 *  2. For each entity, find downstream stores (via implementedBy or stores relation)
 *  3. Check if each store also carries classifiedAs → same classification
 *  4. Find exchanges that carry classified entities and check classificationLevel
 *  5. Report enforcement gaps
 */
export function buildClassificationCoverage(entities: BackstageEntity[]): ClassificationCoverageReport {
  const byId = new Map<string, BackstageEntity>();
  for (const a of entities) {
    byId.set(getEntityId(a), a);
  }

  const classifications = entities.filter((a) => getEntityLegacyKind(a) === "classification");
  const entries: ClassificationCoverageEntry[] = [];

  let totalCoveredEntities = 0;
  let totalStores = 0;
  let totalEnforced = 0;
  let totalGaps = 0;
  let totalExchanges = 0;
  let totalExchangeGaps = 0;

  for (const cls of classifications) {
    const clsLevel = getSpecField<string>(cls, "level") ?? "";

    // Find all artifacts that classifiedAs this classification
    const coveredEntities: ClassifiedEntity[] = [];
    for (const a of entities) {
      const hasClassification = getFlatRelations(a).some(
        (r) => r.type === "classifiedAs" && r.target === getEntityId(cls)
      );
      if (hasClassification) {
        coveredEntities.push({
          entityId: getEntityId(a),
          entityTitle: getEntityTitle(a),
          kind: getEntityLegacyKind(a),
        });
      }
    }

    // Find downstream stores for each covered entity
    const storeMap = new Map<string, ClassificationStore>();
    for (const entity of coveredEntities) {
      const entityArt = byId.get(entity.entityId);
      if (!entityArt) continue;

      // Find stores via entity's implementedBy relations
      for (const r of getFlatRelations(entityArt)) {
        if (r.type === "implementedBy") {
          const target = byId.get(r.target);
          if (target && (getEntityLegacyKind(target) === "data-store" || getEntityLegacyKind(target) === "physical-schema") && !storeMap.has(getEntityId(target))) {
            const enforced = getFlatRelations(target).some(
              (tr) => tr.type === "classifiedAs" && tr.target === getEntityId(cls)
            );
            storeMap.set(getEntityId(target), {
              storeId: getEntityId(target),
              storeTitle: getEntityTitle(target),
              enforced,
            });
          }
        }
      }

      // Find stores that reference this entity via stores relation
      for (const a of entities) {
        const storesEntity = getFlatRelations(a).some(
          (r) => r.type === "stores" && r.target === entity.entityId
        );
        if (storesEntity && !storeMap.has(getEntityId(a))) {
          const enforced = getFlatRelations(a).some(
            (r) => r.type === "classifiedAs" && r.target === getEntityId(cls)
          );
          storeMap.set(getEntityId(a), {
            storeId: getEntityId(a),
            storeTitle: getEntityTitle(a),
            enforced,
          });
        }
      }
    }

    // Find exchanges carrying classified entities
    const exchanges: ClassificationCoverageEntry["exchanges"] = [];
    for (const a of entities) {
      if (getEntityLegacyKind(a) !== "information-exchange") continue;
      const exchangedEntities = getSpecField<string[]>(a, "exchangedEntities");
      if (!exchangedEntities) continue;

      const carriesClassifiedEntity = exchangedEntities.some((eid) =>
        coveredEntities.some((ce) => ce.entityId === eid)
      );
      if (carriesClassifiedEntity) {
        const classificationLevel = getSpecField<string>(a, "classificationLevel");
        exchanges.push({
          exchangeId: getEntityId(a),
          exchangeTitle: getEntityTitle(a),
          declaresClassification: classificationLevel === getEntityId(cls),
        });
      }
    }

    const stores = [...storeMap.values()];
    const enforcementGaps = stores
      .filter((s) => !s.enforced)
      .map((s) => s.storeId);

    totalCoveredEntities += coveredEntities.length;
    totalStores += stores.length;
    totalEnforced += stores.filter((s) => s.enforced).length;
    totalGaps += enforcementGaps.length;
    totalExchanges += exchanges.length;
    totalExchangeGaps += exchanges.filter((e) => !e.declaresClassification).length;

    entries.push({
      classificationId: getEntityId(cls),
      classificationTitle: getEntityTitle(cls),
      level: clsLevel,
      coveredEntities,
      stores,
      exchanges,
      enforcementGaps,
    });
  }

  return {
    classifications: entries,
    summary: {
      classificationCount: entries.length,
      coveredEntityCount: totalCoveredEntities,
      totalStoreCount: totalStores,
      enforcedStoreCount: totalEnforced,
      gapCount: totalGaps,
      exchangeCount: totalExchanges,
      exchangeGapCount: totalExchangeGaps,
    },
  };
}

/**
 * Render a classification coverage report as Markdown.
 */
export function renderClassificationCoverageMarkdown(report: ClassificationCoverageReport): string {
  const lines: string[] = [];

  lines.push("# Classification Coverage Report");
  lines.push("");
  lines.push(`> ${report.summary.classificationCount} classifications, ${report.summary.coveredEntityCount} classified artifacts, ${report.summary.gapCount} enforcement gaps`);
  lines.push("");

  if (report.classifications.length === 0) {
    lines.push("_No classifications found._");
    return lines.join("\n") + "\n";
  }

  for (const cls of report.classifications) {
    lines.push(`## ${cls.classificationTitle} (\`${cls.classificationId}\`)`);
    lines.push("");
    lines.push(`**Level:** ${cls.level}`);
    lines.push("");

    // Covered entities
    lines.push("### Classified Artifacts");
    lines.push("");
    if (cls.coveredEntities.length === 0) {
      lines.push("_No artifacts carry this classification._");
    } else {
      lines.push("| Artifact | Kind |");
      lines.push("|----------|------|");
      for (const e of cls.coveredEntities) {
        lines.push(`| ${e.entityTitle} (\`${e.entityId}\`) | ${e.kind} |`);
      }
    }
    lines.push("");

    // Stores
    if (cls.stores.length > 0) {
      lines.push("### Downstream Stores");
      lines.push("");
      lines.push("| Store | Enforced |");
      lines.push("|-------|----------|");
      for (const s of cls.stores) {
        const icon = s.enforced ? "✅" : "❌";
        lines.push(`| ${s.storeTitle} (\`${s.storeId}\`) | ${icon} |`);
      }
      lines.push("");
    }

    // Exchanges
    if (cls.exchanges.length > 0) {
      lines.push("### Information Exchanges");
      lines.push("");
      lines.push("| Exchange | Declares Classification |");
      lines.push("|----------|------------------------|");
      for (const ex of cls.exchanges) {
        const icon = ex.declaresClassification ? "✅" : "❌";
        lines.push(`| ${ex.exchangeTitle} (\`${ex.exchangeId}\`) | ${icon} |`);
      }
      lines.push("");
    }

    // Gaps
    if (cls.enforcementGaps.length > 0) {
      lines.push("### ⚠️ Enforcement Gaps");
      lines.push("");
      for (const g of cls.enforcementGaps) {
        const store = report.classifications
          .flatMap((c) => c.stores)
          .find((s) => s.storeId === g);
        lines.push(`- **${store?.storeTitle ?? g}** (\`${g}\`) — does not carry \`classifiedAs → ${cls.classificationId}\``);
      }
      lines.push("");
    }
  }

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Classifications | ${report.summary.classificationCount} |`);
  lines.push(`| Classified artifacts | ${report.summary.coveredEntityCount} |`);
  lines.push(`| Downstream stores | ${report.summary.totalStoreCount} |`);
  lines.push(`| Stores enforcing | ${report.summary.enforcedStoreCount} |`);
  lines.push(`| Enforcement gaps | ${report.summary.gapCount} |`);
  lines.push(`| Exchanges | ${report.summary.exchangeCount} |`);
  lines.push(`| Exchange gaps | ${report.summary.exchangeGapCount} |`);

  return lines.join("\n") + "\n";
}

// ─── Capability Map Report ──────────────────────────────────────────────────────

/** A capability node in the capability map tree. */
export interface CapabilityMapNode {
  id: string;
  title: string;
  level: number;
  parent?: string;
  maturity?: string;
  strategicImportance?: string;
  investmentProfile?: string;
  heatMap?: {
    businessValue?: string;
    technicalHealth?: string;
    risk?: string;
  };
  realizingSystems: string[];
  processes: string[];
  controls: string[];
  owningOrg?: string;
  driftSummary: { errors: number; warnings: number };
  children: CapabilityMapNode[];
}

/** A mission entry with its capability tree. */
export interface CapabilityMapMission {
  id: string;
  title: string;
  capabilities: CapabilityMapNode[];
}

/** Full capability map report output. */
export interface CapabilityMapReport {
  generatedAt: string;
  missions: CapabilityMapMission[];
  unmappedCapabilities: CapabilityMapNode[];
  summary: {
    missionCount: number;
    capabilityCount: number;
    maxDepth: number;
    realizingSystemCount: number;
    driftErrorCount: number;
    driftWarningCount: number;
  };
}

/**
 * Build a capability map report showing mission → capability hierarchy
 * enriched with realizing systems, processes, controls, and drift.
 */
export function buildCapabilityMap(entities: BackstageEntity[]): CapabilityMapReport {
  const byId = new Map<string, BackstageEntity>();
  for (const a of entities) byId.set(getEntityId(a), a);

  const capabilities = entities.filter((a) => getEntityLegacyKind(a) === "capability");
  const missionArtifacts = entities.filter((a) => getEntityLegacyKind(a) === "mission");

  // Build reverse indexes
  const realizesMap = new Map<string, string[]>();
  const supportsMap = new Map<string, string[]>();
  const ownsReverseMap = new Map<string, string>(); // target → org-unit
  const governedByMap = new Map<string, string[]>();

  for (const a of entities) {
    for (const rel of getFlatRelations(a)) {
      if (rel.type === "realizes") {
        const list = realizesMap.get(rel.target) ?? [];
        list.push(getEntityId(a));
        realizesMap.set(rel.target, list);
      }
      if (rel.type === "supports") {
        const list = supportsMap.get(getEntityId(a)) ?? [];
        list.push(rel.target);
        supportsMap.set(getEntityId(a), list);
      }
      if (rel.type === "owns") {
        ownsReverseMap.set(rel.target, getEntityId(a));
      }
      if (rel.type === "ownedBy") {
        ownsReverseMap.set(getEntityId(a), rel.target);
      }
      if (rel.type === "governedBy") {
        const list = governedByMap.get(getEntityId(a)) ?? [];
        list.push(rel.target);
        governedByMap.set(getEntityId(a), list);
      }
    }
  }

  // Run drift to get per-artifact summaries
  const driftResult = evaluateEaDrift(entities);
  const driftByCap = new Map<string, { errors: number; warnings: number }>();
  for (const e of driftResult.errors) {
    if (!e.path) continue;
    const entry = driftByCap.get(e.path) ?? { errors: 0, warnings: 0 };
    entry.errors++;
    driftByCap.set(e.path, entry);
  }
  for (const w of driftResult.warnings) {
    if (!w.path) continue;
    const entry = driftByCap.get(w.path) ?? { errors: 0, warnings: 0 };
    entry.warnings++;
    driftByCap.set(w.path, entry);
  }

  // Find processes related to each capability (via realizes or supports)
  const capProcesses = new Map<string, string[]>();
  const processArtifacts = entities.filter((a) => getEntityLegacyKind(a) === "process");
  for (const proc of processArtifacts) {
    for (const rel of getFlatRelations(proc)) {
      if (rel.type === "realizes" || rel.type === "supports") {
        const target = byId.get(rel.target);
        if (target && getEntityLegacyKind(target) === "capability") {
          const list = capProcesses.get(rel.target) ?? [];
          if (!list.includes(getEntityId(proc))) list.push(getEntityId(proc));
          capProcesses.set(rel.target, list);
        }
      }
    }
  }

  // Find controls related to each capability (via governedBy on the capability)
  const capControls = new Map<string, string[]>();
  for (const cap of capabilities) {
    const governed = governedByMap.get(getEntityId(cap)) ?? [];
    const controls: string[] = [];
    for (const gId of governed) {
      const target = byId.get(gId);
      if (target && getEntityLegacyKind(target) === "control") {
        controls.push(getEntityId(target));
      }
    }
    if (controls.length > 0) {
      capControls.set(getEntityId(cap), controls);
    }
  }

  // Build capability nodes
  function buildNode(cap: BackstageEntity): CapabilityMapNode {
    const capId = getEntityId(cap);
    const heatMapRaw = cap.spec?.heatMap as Record<string, string> | undefined;
    return {
      id: capId,
      title: getEntityTitle(cap),
      level: (cap.spec?.level as number) ?? 1,
      parent: cap.spec?.parentCapability as string | undefined,
      maturity: cap.spec?.maturity as string | undefined,
      strategicImportance: cap.spec?.strategicImportance as string | undefined,
      investmentProfile: cap.spec?.investmentProfile as string | undefined,
      heatMap: heatMapRaw ? { ...heatMapRaw } : undefined,
      realizingSystems: realizesMap.get(capId) ?? [],
      processes: capProcesses.get(capId) ?? [],
      controls: capControls.get(capId) ?? [],
      owningOrg: ownsReverseMap.get(capId),
      driftSummary: driftByCap.get(capId) ?? { errors: 0, warnings: 0 },
      children: [],
    };
  }

  // Build tree: group capabilities by parent
  const nodeMap = new Map<string, CapabilityMapNode>();
  for (const cap of capabilities) {
    nodeMap.set(getEntityId(cap), buildNode(cap));
  }

  // Attach children to parents
  const roots: CapabilityMapNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parent && nodeMap.has(node.parent)) {
      nodeMap.get(node.parent)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by level then title
  function sortTree(nodes: CapabilityMapNode[]): void {
    nodes.sort((a, b) => a.level - b.level || a.title.localeCompare(b.title));
    for (const n of nodes) sortTree(n.children);
  }
  sortTree(roots);

  // Map capabilities to missions via supports relation
  const missionCaps = new Map<string, Set<string>>();
  for (const cap of capabilities) {
    const targets = supportsMap.get(getEntityId(cap)) ?? [];
    for (const t of targets) {
      const target = byId.get(t);
      if (target && getEntityLegacyKind(target) === "mission") {
        const set = missionCaps.get(t) ?? new Set();
        set.add(getEntityId(cap));
        missionCaps.set(t, set);
      }
    }
  }

  // Build mission entries with their capability trees
  const mappedCapIds = new Set<string>();
  const missionEntries: CapabilityMapMission[] = [];

  for (const mission of missionArtifacts) {
    const directCapIds = missionCaps.get(getEntityId(mission)) ?? new Set();
    const missionRoots: CapabilityMapNode[] = [];

    // Include root capabilities that support this mission
    for (const root of roots) {
      if (directCapIds.has(root.id)) {
        missionRoots.push(root);
        collectIds(root, mappedCapIds);
      }
    }

    // Include non-root capabilities that directly support this mission
    for (const capId of directCapIds) {
      if (!mappedCapIds.has(capId)) {
        const node = nodeMap.get(capId);
        if (node) {
          missionRoots.push(node);
          collectIds(node, mappedCapIds);
        }
      }
    }

    if (missionRoots.length > 0) {
      sortTree(missionRoots);
      missionEntries.push({
        id: getEntityId(mission),
        title: getEntityTitle(mission),
        capabilities: missionRoots,
      });
    }
  }

  // Unmapped capabilities: roots not assigned to any mission
  const unmapped = roots.filter((r) => !mappedCapIds.has(r.id));

  // Compute summary
  let maxDepth = 0;
  const allRealizingSystems = new Set<string>();
  let totalDriftErrors = 0;
  let totalDriftWarnings = 0;

  function walkNodes(nodes: CapabilityMapNode[], depth: number): void {
    for (const n of nodes) {
      if (depth > maxDepth) maxDepth = depth;
      for (const s of n.realizingSystems) allRealizingSystems.add(s);
      totalDriftErrors += n.driftSummary.errors;
      totalDriftWarnings += n.driftSummary.warnings;
      walkNodes(n.children, depth + 1);
    }
  }
  walkNodes(roots, 1);

  return {
    generatedAt: new Date().toISOString(),
    missions: missionEntries,
    unmappedCapabilities: unmapped,
    summary: {
      missionCount: missionEntries.length,
      capabilityCount: capabilities.length,
      maxDepth,
      realizingSystemCount: allRealizingSystems.size,
      driftErrorCount: totalDriftErrors,
      driftWarningCount: totalDriftWarnings,
    },
  };
}

function collectIds(node: CapabilityMapNode, set: Set<string>): void {
  set.add(node.id);
  for (const child of node.children) collectIds(child, set);
}

/**
 * Render a capability map report as Markdown.
 */
export function renderCapabilityMapMarkdown(report: CapabilityMapReport): string {
  const lines: string[] = [];

  lines.push("# Capability Map");
  lines.push("");
  lines.push(`> ${report.summary.capabilityCount} capabilities, ${report.summary.realizingSystemCount} realizing systems, ${report.summary.missionCount} missions`);
  lines.push("");

  if (report.summary.capabilityCount === 0) {
    lines.push("_No capabilities found._");
    return lines.join("\n") + "\n";
  }

  for (const mission of report.missions) {
    lines.push(`## Mission: ${mission.title} (\`${mission.id}\`)`);
    lines.push("");
    renderCapabilityTree(lines, mission.capabilities, 0);
    lines.push("");
  }

  if (report.unmappedCapabilities.length > 0) {
    lines.push("## Unmapped Capabilities");
    lines.push("");
    renderCapabilityTree(lines, report.unmappedCapabilities, 0);
    lines.push("");
  }

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Missions | ${report.summary.missionCount} |`);
  lines.push(`| Capabilities | ${report.summary.capabilityCount} |`);
  lines.push(`| Max depth | ${report.summary.maxDepth} |`);
  lines.push(`| Realizing systems | ${report.summary.realizingSystemCount} |`);
  lines.push(`| Drift errors | ${report.summary.driftErrorCount} |`);
  lines.push(`| Drift warnings | ${report.summary.driftWarningCount} |`);

  return lines.join("\n") + "\n";
}

function renderCapabilityTree(lines: string[], nodes: CapabilityMapNode[], indent: number): void {
  const prefix = "  ".repeat(indent);
  for (const node of nodes) {
    const tags: string[] = [];
    if (node.strategicImportance) tags.push(node.strategicImportance);
    if (node.investmentProfile) tags.push(node.investmentProfile);
    if (node.maturity) tags.push(`maturity: ${node.maturity}`);
    const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";

    lines.push(`${prefix}- **L${node.level}: ${node.title}**${tagStr}`);

    if (node.realizingSystems.length > 0) {
      lines.push(`${prefix}  - Realized by: ${node.realizingSystems.map((s) => `\`${s}\``).join(", ")}`);
    }
    if (node.processes.length > 0) {
      lines.push(`${prefix}  - Processes: ${node.processes.map((p) => `\`${p}\``).join(", ")}`);
    }
    if (node.controls.length > 0) {
      lines.push(`${prefix}  - Controls: ${node.controls.map((c) => `\`${c}\``).join(", ")}`);
    }
    if (node.owningOrg) {
      lines.push(`${prefix}  - Owner: \`${node.owningOrg}\``);
    }
    if (node.heatMap) {
      const parts: string[] = [];
      if (node.heatMap.businessValue) parts.push(`Business value: ${node.heatMap.businessValue}`);
      if (node.heatMap.technicalHealth) parts.push(`Technical health: ${node.heatMap.technicalHealth}`);
      if (node.heatMap.risk) parts.push(`Risk: ${node.heatMap.risk}`);
      if (parts.length > 0) {
        lines.push(`${prefix}  - ${parts.join(" | ")}`);
      }
    }
    const driftParts: string[] = [];
    if (node.driftSummary.errors > 0) driftParts.push(`${node.driftSummary.errors} error${node.driftSummary.errors > 1 ? "s" : ""}`);
    if (node.driftSummary.warnings > 0) driftParts.push(`${node.driftSummary.warnings} warning${node.driftSummary.warnings > 1 ? "s" : ""}`);
    if (driftParts.length > 0) {
      lines.push(`${prefix}  - ⚠️ Drift: ${driftParts.join(", ")}`);
    }

    if (node.children.length > 0) {
      renderCapabilityTree(lines, node.children, indent + 1);
    }
  }
}

// ─── Target Gap Analysis Report ─────────────────────────────────────────────────

/** An artifact classified as new work (in target but not baseline). */
export interface GapNewWorkItem {
  artifactId: string;
  status: string;
  milestone?: string;
  wave?: string;
}

/** An artifact classified for retirement (in baseline but not target). */
export interface GapRetirementItem {
  artifactId: string;
  currentStatus: string;
  dependedOnBy: string[];
  milestone?: string;
  blocked: boolean;
  blockedReason?: string;
}

/** Milestone progress summary. */
export interface GapMilestoneStatus {
  id: string;
  title: string;
  status: string;
  deliverables: { total: number; complete: number; inProgress: number; pending: number };
  atRisk: boolean;
}

/** Success metric from the target. */
export interface GapSuccessMetric {
  id: string;
  metric: string;
  target: string;
  currentValue?: string;
}

/** Full gap analysis report. */
export interface GapAnalysisReport {
  generatedAt: string;
  baseline: { id: string; capturedAt: string };
  target: { id: string; effectiveBy: string };
  summary: {
    newWork: number;
    retirements: number;
    continuing: number;
    blockedRetirements: number;
    unplannedGaps: number;
    atRiskMilestones: number;
  };
  newWork: GapNewWorkItem[];
  retirements: GapRetirementItem[];
  milestones: GapMilestoneStatus[];
  successMetrics: GapSuccessMetric[];
}

/**
 * Build a target gap analysis report comparing baseline vs target architecture.
 *
 * Requires a baseline ID and target ID. Optionally accepts a transition plan ID
 * to include milestone/wave tracking.
 */
export function buildGapAnalysis(
  entities: BackstageEntity[],
  options: { baselineId: string; targetId: string; planId?: string },
): GapAnalysisReport {
  const byId = new Map<string, BackstageEntity>();
  for (const a of entities) byId.set(getEntityId(a), a);

  const baselineArt = byId.get(options.baselineId);
  const targetArt = byId.get(options.targetId);

  if (!baselineArt || getEntityLegacyKind(baselineArt) !== "baseline") {
    return emptyGapReport(options);
  }
  if (!targetArt || getEntityLegacyKind(targetArt) !== "target") {
    return emptyGapReport(options);
  }

  const baselineSet = new Set(getSpecField<string[]>(baselineArt, "artifactRefs") ?? []);
  const targetSet = new Set(getSpecField<string[]>(targetArt, "artifactRefs") ?? []);

  // Classify artifacts
  const newWorkIds = [...targetSet].filter((id) => !baselineSet.has(id));
  const retirementIds = [...baselineSet].filter((id) => !targetSet.has(id));
  const continuingIds = [...baselineSet].filter((id) => targetSet.has(id));

  // Find transition plan and waves
  const planEntity = options.planId
    ? byId.get(options.planId)
    : undefined;

  const waves = entities
    .filter((a) => getEntityLegacyKind(a) === "migration-wave")
    .filter((w) => !options.planId || getSpecField<string>(w, "transitionPlan") === options.planId)
    .sort((a, b) => (getSpecField<number>(a, "sequenceOrder") ?? 0) - (getSpecField<number>(b, "sequenceOrder") ?? 0));

  // Build milestone deliverable index
  const milestoneDeliverables = new Map<string, string>();
  if (planEntity) {
    const planMilestonesForIndex = getSpecField<Array<{ id: string; title: string; status?: string; deliverables?: string[] }>>(planEntity, "milestones") ?? [];
    for (const ms of planMilestonesForIndex) {
      for (const d of ms.deliverables ?? []) {
        milestoneDeliverables.set(d, ms.id);
      }
    }
  }

  // Build wave scope index
  const waveCreates = new Map<string, string>();
  const waveRetires = new Map<string, string>();
  for (const wave of waves) {
    const scope = getSpecField<{ create?: string[]; retire?: string[] }>(wave, "scope");
    for (const id of scope?.create ?? []) waveCreates.set(id, getEntityId(wave));
    for (const id of scope?.retire ?? []) waveRetires.set(id, getEntityId(wave));
  }

  // Build reverse dependency index: target → [sources that depend on it]
  const dependedOnByMap = new Map<string, string[]>();
  for (const a of entities) {
    for (const rel of getFlatRelations(a)) {
      if (rel.type === "dependsOn" || rel.type === "uses" || rel.type === "realizes") {
        const list = dependedOnByMap.get(rel.target) ?? [];
        list.push(getEntityId(a));
        dependedOnByMap.set(rel.target, list);
      }
    }
  }

  // New work items
  const newWork: GapNewWorkItem[] = newWorkIds.map((id) => {
    const art = byId.get(id);
    return {
      artifactId: id,
      status: art ? getEntityStatus(art) : "unknown",
      milestone: milestoneDeliverables.get(id),
      wave: waveCreates.get(id),
    };
  });

  // Retirement items
  const retirements: GapRetirementItem[] = retirementIds.map((id) => {
    const art = byId.get(id);
    const deps = (dependedOnByMap.get(id) ?? []).filter((depId) => {
      const depArt = byId.get(depId);
      return depArt && getEntityStatus(depArt) !== "retired" && continuingIds.includes(depId);
    });
    const blocked = deps.length > 0;
    return {
      artifactId: id,
      currentStatus: art ? getEntityStatus(art) : "unknown",
      dependedOnBy: deps,
      milestone: milestoneDeliverables.get(id),
      blocked,
      blockedReason: blocked
        ? `${deps.join(", ")} still ${deps.length === 1 ? "depends" : "depend"} on this artifact`
        : undefined,
    };
  });

  // Milestone status
  const milestones: GapMilestoneStatus[] = [];
  if (planEntity) {
    const planMilestones = getSpecField<Array<{ id: string; title: string; status?: string; deliverables?: string[] }>>(planEntity, "milestones") ?? [];
    for (const ms of planMilestones) {
      let complete = 0;
      let inProgress = 0;
      let pending = 0;
      for (const d of ms.deliverables ?? []) {
        const art = byId.get(d);
        if (!art) { pending++; continue; }
        const artStatus = getEntityStatus(art);
        if (artStatus === "active" || artStatus === "retired") complete++;
        else if (artStatus === "draft") inProgress++;
        else pending++;
      }
      const total = ms.deliverables?.length ?? 0;
      const status = ms.status ?? (complete === total && total > 0 ? "complete" : pending === total ? "pending" : "in-progress");
      const atRisk = retirements.some((r) => r.blocked && ms.deliverables?.includes(r.artifactId));
      milestones.push({ id: ms.id, title: ms.title, status, deliverables: { total, complete, inProgress, pending }, atRisk });
    }
  }

  // Success metrics
  const targetSuccessMetrics = getSpecField<Array<{ id: string; metric: string; target: string; currentValue?: string }>>(targetArt, "successMetrics") ?? [];
  const successMetrics: GapSuccessMetric[] = targetSuccessMetrics.map((sm) => ({
    id: sm.id,
    metric: sm.metric,
    target: sm.target,
    currentValue: sm.currentValue,
  }));

  const unplannedGaps = newWork.filter((n) => !n.milestone && !n.wave).length;
  const blockedRetirements = retirements.filter((r) => r.blocked).length;
  const atRiskMilestones = milestones.filter((m) => m.atRisk).length;

  return {
    generatedAt: new Date().toISOString(),
    baseline: { id: getEntityId(baselineArt), capturedAt: getSpecField<string>(baselineArt, "capturedAt") ?? "" },
    target: { id: getEntityId(targetArt), effectiveBy: getSpecField<string>(targetArt, "effectiveBy") ?? "" },
    summary: {
      newWork: newWork.length,
      retirements: retirements.length,
      continuing: continuingIds.length,
      blockedRetirements,
      unplannedGaps,
      atRiskMilestones,
    },
    newWork,
    retirements,
    milestones,
    successMetrics,
  };
}

function emptyGapReport(options: { baselineId: string; targetId: string }): GapAnalysisReport {
  return {
    generatedAt: new Date().toISOString(),
    baseline: { id: options.baselineId, capturedAt: "" },
    target: { id: options.targetId, effectiveBy: "" },
    summary: { newWork: 0, retirements: 0, continuing: 0, blockedRetirements: 0, unplannedGaps: 0, atRiskMilestones: 0 },
    newWork: [],
    retirements: [],
    milestones: [],
    successMetrics: [],
  };
}

/**
 * Render a gap analysis report as Markdown.
 */
export function renderGapAnalysisMarkdown(report: GapAnalysisReport): string {
  const lines: string[] = [];

  lines.push("# Target Gap Analysis");
  lines.push("");
  lines.push(`> Baseline: \`${report.baseline.id}\` (captured: ${report.baseline.capturedAt || "—"})`);
  lines.push(`> Target: \`${report.target.id}\` (effective by: ${report.target.effectiveBy || "—"})`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| New work | ${report.summary.newWork} |`);
  lines.push(`| Retirements | ${report.summary.retirements} |`);
  lines.push(`| Continuing | ${report.summary.continuing} |`);
  lines.push(`| Blocked retirements | ${report.summary.blockedRetirements} |`);
  lines.push(`| Unplanned gaps | ${report.summary.unplannedGaps} |`);
  lines.push(`| At-risk milestones | ${report.summary.atRiskMilestones} |`);
  lines.push("");

  // New work
  if (report.newWork.length > 0) {
    lines.push("## New Work");
    lines.push("");
    lines.push("| Artifact | Status | Milestone | Wave |");
    lines.push("|----------|--------|-----------|------|");
    for (const item of report.newWork) {
      const ms = item.milestone ?? "—";
      const wave = item.wave ?? "—";
      const gap = !item.milestone && !item.wave ? " ⚠️" : "";
      lines.push(`| \`${item.artifactId}\` | ${item.status} | ${ms} | ${wave} |${gap}`);
    }
    lines.push("");
  }

  // Retirements
  if (report.retirements.length > 0) {
    lines.push("## Retirements");
    lines.push("");
    lines.push("| Artifact | Status | Blocked | Reason |");
    lines.push("|----------|--------|---------|--------|");
    for (const item of report.retirements) {
      const blocked = item.blocked ? "🔴 Yes" : "✅ No";
      const reason = item.blockedReason ?? "—";
      lines.push(`| \`${item.artifactId}\` | ${item.currentStatus} | ${blocked} | ${reason} |`);
    }
    lines.push("");
  }

  // Milestones
  if (report.milestones.length > 0) {
    lines.push("## Milestones");
    lines.push("");
    lines.push("| Milestone | Status | Deliverables | At Risk |");
    lines.push("|-----------|--------|--------------|---------|");
    for (const ms of report.milestones) {
      const d = `${ms.deliverables.complete}/${ms.deliverables.total} complete`;
      const risk = ms.atRisk ? "⚠️ Yes" : "No";
      lines.push(`| ${ms.title} (\`${ms.id}\`) | ${ms.status} | ${d} | ${risk} |`);
    }
    lines.push("");
  }

  // Success metrics
  if (report.successMetrics.length > 0) {
    lines.push("## Success Metrics");
    lines.push("");
    lines.push("| Metric | Target | Current |");
    lines.push("|--------|--------|---------|");
    for (const sm of report.successMetrics) {
      lines.push(`| ${sm.metric} | ${sm.target} | ${sm.currentValue ?? "—"} |`);
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

// ─── Exception Report ───────────────────────────────────────────────────────────

/** Status classification for an exception. */
export type ExceptionStatus = "active" | "expired" | "expiring-soon";

/** A row in the exception report. */
export interface ExceptionReportEntry {
  id: string;
  name: string;
  status: ExceptionStatus;
  reason: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  daysRemaining: number;
  scopeArtifactCount: number;
  scopeRuleCount: number;
  scopeDomainCount: number;
  reviewSchedule: string | null;
}

/** Full exception report output. */
export interface ExceptionReport {
  generatedAt: string;
  summary: {
    total: number;
    active: number;
    expired: number;
    expiringSoon: number;
  };
  exceptions: ExceptionReportEntry[];
}

/**
 * Build an exception report from loaded artifacts.
 *
 * Classifies exceptions as:
 * - **expired**: expiresAt is in the past
 * - **expiring-soon**: expiresAt is within threshold (default 30 days)
 * - **active**: valid and not expiring soon
 */
export function buildExceptionReport(
  entities: BackstageEntity[],
  options?: { expiringThresholdDays?: number },
): ExceptionReport {
  const now = Date.now();
  const thresholdMs = (options?.expiringThresholdDays ?? 30) * 24 * 60 * 60 * 1000;

  const exceptions = entities.filter(
    (a) => getEntityLegacyKind(a) === "exception",
  );

  const entries: ExceptionReportEntry[] = exceptions.map((exc) => {
    const expiresAt = getSpecField<string>(exc, "expiresAt") ?? "";
    const expiresMs = new Date(expiresAt).getTime();
    const daysRemaining = Math.ceil((expiresMs - now) / (24 * 60 * 60 * 1000));

    let status: ExceptionStatus;
    if (isNaN(expiresMs) || expiresMs < now) {
      status = "expired";
    } else if (expiresMs - now < thresholdMs) {
      status = "expiring-soon";
    } else {
      status = "active";
    }

    const scope = getSpecField<{ artifactIds?: string[]; rules?: string[]; domains?: string[] }>(exc, "scope") ?? {};

    return {
      id: getEntityId(exc),
      name: getEntityTitle(exc),
      status,
      reason: getSpecField<string>(exc, "reason") ?? "",
      approvedBy: getSpecField<string>(exc, "approvedBy") ?? "",
      approvedAt: getSpecField<string>(exc, "approvedAt") ?? "",
      expiresAt,
      daysRemaining,
      scopeArtifactCount: scope.artifactIds?.length ?? 0,
      scopeRuleCount: scope.rules?.length ?? 0,
      scopeDomainCount: scope.domains?.length ?? 0,
      reviewSchedule: getSpecField<string>(exc, "reviewSchedule") ?? null,
    };
  });

  // Sort: expired first, then expiring-soon, then active (by daysRemaining ascending)
  entries.sort((a, b) => {
    const order: Record<ExceptionStatus, number> = { expired: 0, "expiring-soon": 1, active: 2 };
    const diff = order[a.status] - order[b.status];
    if (diff !== 0) return diff;
    return a.daysRemaining - b.daysRemaining;
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: entries.length,
      active: entries.filter((e) => e.status === "active").length,
      expired: entries.filter((e) => e.status === "expired").length,
      expiringSoon: entries.filter((e) => e.status === "expiring-soon").length,
    },
    exceptions: entries,
  };
}

/**
 * Render an exception report as Markdown.
 */
export function renderExceptionReportMarkdown(report: ExceptionReport): string {
  const lines: string[] = [];

  lines.push("# Exception Report");
  lines.push("");
  lines.push(`> Generated: ${report.generatedAt}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push("| Status | Count |");
  lines.push("|--------|-------|");
  lines.push(`| Active | ${report.summary.active} |`);
  lines.push(`| Expiring soon | ${report.summary.expiringSoon} |`);
  lines.push(`| Expired | ${report.summary.expired} |`);
  lines.push(`| **Total** | **${report.summary.total}** |`);
  lines.push("");

  if (report.exceptions.length === 0) {
    lines.push("_No exceptions found._");
    lines.push("");
    return lines.join("\n") + "\n";
  }

  // Exceptions table
  lines.push("## Exceptions");
  lines.push("");
  lines.push("| ID | Name | Status | Expires | Days Left | Approved By | Scope | Review |");
  lines.push("|-----|------|--------|---------|-----------|-------------|-------|--------|");

  for (const exc of report.exceptions) {
    const statusIcon = exc.status === "expired" ? "❌" : exc.status === "expiring-soon" ? "⚠️" : "✅";
    const scopeParts: string[] = [];
    if (exc.scopeArtifactCount > 0) scopeParts.push(`${exc.scopeArtifactCount} artifacts`);
    if (exc.scopeRuleCount > 0) scopeParts.push(`${exc.scopeRuleCount} rules`);
    if (exc.scopeDomainCount > 0) scopeParts.push(`${exc.scopeDomainCount} domains`);
    const scope = scopeParts.length > 0 ? scopeParts.join(", ") : "—";

    lines.push(
      `| \`${exc.id}\` | ${exc.name} | ${statusIcon} ${exc.status} | ${exc.expiresAt} | ${exc.daysRemaining} | ${exc.approvedBy} | ${scope} | ${exc.reviewSchedule ?? "—"} |`,
    );
  }
  lines.push("");

  return lines.join("\n") + "\n";
}

// ─── Report Registry & Index ────────────────────────────────────────────────────

/** Metadata for a report in the index. */
export interface ReportIndexEntry {
  name: string;
  description: string;
  stats: Record<string, number>;
}

/** Full report index. */
export interface ReportIndex {
  generatedAt: string;
  reports: ReportIndexEntry[];
  summary: {
    totalArtifacts: number;
    byDomain: Record<string, number>;
  };
}

/** Available report view names. */
export const REPORT_VIEWS = [
  "system-data-matrix",
  "classification-coverage",
  "capability-map",
  "gap-analysis",
  "exceptions",
  "drift-heatmap",
  "traceability-index",
] as const;

export type ReportView = (typeof REPORT_VIEWS)[number];

/**
 * Build a report index by generating all available reports.
 *
 * Gap analysis is skipped in --all mode since it requires specific
 * baseline/target IDs.
 */
export function buildReportIndex(entities: BackstageEntity[]): ReportIndex {
  const byDomain: Record<string, number> = {};
  for (const a of entities) {
    const domain = getEntityDomain(a) ?? "unknown";
    byDomain[domain] = (byDomain[domain] ?? 0) + 1;
  }

  const reports: ReportIndexEntry[] = [];

  // System-data matrix
  const sdm = buildSystemDataMatrix(entities);
  reports.push({
    name: "system-data-matrix",
    description: "Applications → data stores → models → classifications",
    stats: { connections: sdm.matrix.length },
  });

  // Classification coverage
  const cc = buildClassificationCoverage(entities);
  reports.push({
    name: "classification-coverage",
    description: "Classifications → entities → enforcement gaps",
    stats: { classifications: cc.classifications.length },
  });

  // Capability map
  const cm = buildCapabilityMap(entities);
  reports.push({
    name: "capability-map",
    description: "Mission → capability → system hierarchy",
    stats: { missions: cm.missions.length, capabilities: cm.missions.reduce((sum, m) => sum + m.capabilities.length, 0) },
  });

  // Exception report
  const er = buildExceptionReport(entities);
  reports.push({
    name: "exceptions",
    description: "Active/expired architecture exceptions",
    stats: {
      total: er.summary.total,
      active: er.summary.active,
      expired: er.summary.expired,
      expiringSoon: er.summary.expiringSoon,
    },
  });

  // Drift heatmap
  const dh = buildDriftHeatmap(entities);
  reports.push({
    name: "drift-heatmap",
    description: "Drift findings by domain and severity",
    stats: {
      errors: dh.summary.errors,
      warnings: dh.summary.warnings,
      suppressed: dh.summary.suppressed,
    },
  });

  // Traceability index
  const ti = buildTraceabilityIndex(entities);
  reports.push({
    name: "traceability-index",
    description: "Inverted traceRef index — documents → referencing artifacts",
    stats: {
      documents: ti.summary.totalDocuments,
      traceRefs: ti.summary.totalTraceRefs,
      artifacts: ti.summary.totalArtifacts,
    },
  });

  return {
    generatedAt: new Date().toISOString(),
    reports,
    summary: {
      totalArtifacts: entities.length,
      byDomain,
    },
  };
}

// ─── Drift Heatmap Report ───────────────────────────────────────────────────────


/** Full drift heatmap report. */
export interface DriftHeatmapReport {
  generatedAt: string;
  passed: boolean;
  summary: {
    errors: number;
    warnings: number;
    info: number;
    suppressed: number;
  };
  heatmap: Record<string, DomainDriftSummary>;
  topRules: Array<{ rule: string; count: number }>;
}

/**
 * Build a drift heatmap report from loaded artifacts.
 */
export function buildDriftHeatmap(
  entities: BackstageEntity[],
  options?: { ruleOverrides?: Record<string, "error" | "warning" | "info" | "off"> },
): DriftHeatmapReport {
  // Collect exceptions
  const exceptions = entities.filter(
    (a) => getEntityLegacyKind(a) === "exception",
  );

  const report = detectEaDrift({
    artifacts: entities,
    exceptions,
    ruleOverrides: options?.ruleOverrides,
  });

  // Ensure all domains appear in heatmap (even if 0)
  const heatmap: Record<string, DomainDriftSummary> = {};
  for (const d of EA_DOMAINS) {
    heatmap[d] = report.byDomain[d] ?? { errors: 0, warnings: 0, info: 0 };
  }

  return {
    generatedAt: new Date().toISOString(),
    passed: report.passed,
    summary: {
      errors: report.summary.errors,
      warnings: report.summary.warnings,
      info: report.summary.info,
      suppressed: report.summary.suppressed,
    },
    heatmap,
    topRules: report.topRules,
  };
}

/**
 * Render a drift heatmap report as Markdown.
 */
export function renderDriftHeatmapMarkdown(report: DriftHeatmapReport): string {
  const lines: string[] = [];

  lines.push("# Drift Heatmap");
  lines.push("");
  lines.push(`> Generated: ${report.generatedAt}`);
  lines.push(`> Status: ${report.passed ? "✅ PASSED" : "❌ FAILED"}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|--------|-------|");
  lines.push(`| Errors | ${report.summary.errors} |`);
  lines.push(`| Warnings | ${report.summary.warnings} |`);
  lines.push(`| Info | ${report.summary.info} |`);
  lines.push(`| Suppressed | ${report.summary.suppressed} |`);
  lines.push("");

  // Heatmap table
  lines.push("## By Domain");
  lines.push("");
  lines.push("| Domain | Errors | Warnings | Info |");
  lines.push("|--------|--------|----------|------|");

  for (const [domain, counts] of Object.entries(report.heatmap)) {
    const emoji = counts.errors > 0 ? "🔴" : counts.warnings > 0 ? "🟡" : "🟢";
    lines.push(`| ${emoji} ${domain} | ${counts.errors} | ${counts.warnings} | ${counts.info} |`);
  }
  lines.push("");

  // Top rules
  if (report.topRules.length > 0) {
    lines.push("## Top Rules");
    lines.push("");
    lines.push("| Rule | Findings |");
    lines.push("|------|----------|");
    for (const { rule, count } of report.topRules.slice(0, 10)) {
      lines.push(`| \`${rule}\` | ${count} |`);
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

// ─── Traceability Index Report ──────────────────────────────────────────────────

/** A single artifact reference within a traceability document group. */
export interface TraceabilityIndexEntry {
  artifactId: string;
  kind: string;
  domain: string;
  role: string;
  label: string | null;
}

/** A document with all artifacts that reference it via traceRefs. */
export interface TraceabilityDocumentGroup {
  path: string;
  artifacts: TraceabilityIndexEntry[];
}

/** Full traceability index report. */
export interface TraceabilityIndexReport {
  generatedAt: string;
  summary: {
    totalDocuments: number;
    totalTraceRefs: number;
    totalArtifacts: number;
  };
  documents: TraceabilityDocumentGroup[];
}

/**
 * Build an inverted traceRef index: document path → referencing artifacts.
 *
 * Scans all artifacts for traceRefs and groups them by target document,
 * sorted by reference count (most-referenced first).
 */
export function buildTraceabilityIndex(
  entities: BackstageEntity[],
): TraceabilityIndexReport {
  const docMap = new Map<string, TraceabilityIndexEntry[]>();
  let totalTraceRefs = 0;
  const artifactsWithRefs = new Set<string>();

  for (const a of entities) {
    const traceRefs = getEntityTraceRefs(a);
    if (traceRefs.length === 0) continue;

    for (const ref of traceRefs) {
      totalTraceRefs++;
      artifactsWithRefs.add(getEntityId(a));

      const entry: TraceabilityIndexEntry = {
        artifactId: getEntityId(a),
        kind: getEntityLegacyKind(a),
        domain: getEntityDomain(a) ?? "unknown",
        role: ref.role ?? "context",
        label: (ref as Record<string, unknown>).label as string | null ?? null,
      };

      const existing = docMap.get(ref.path);
      if (existing) {
        existing.push(entry);
      } else {
        docMap.set(ref.path, [entry]);
      }
    }
  }

  // Sort documents by reference count (descending), then alphabetically
  const documents: TraceabilityDocumentGroup[] = Array.from(docMap.entries())
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([path, entries]) => ({
      path,
      artifacts: entries.sort((a, b) => a.artifactId.localeCompare(b.artifactId)),
    }));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalDocuments: documents.length,
      totalTraceRefs,
      totalArtifacts: artifactsWithRefs.size,
    },
    documents,
  };
}

/** Render a traceability index report as Markdown. */
export function renderTraceabilityIndexMarkdown(
  report: TraceabilityIndexReport,
): string {
  const lines: string[] = [];

  lines.push("# Traceability Index");
  lines.push("");
  lines.push(`> Generated: ${report.generatedAt}`);
  lines.push(">");
  lines.push(`> ${report.summary.totalDocuments} documents referenced by ${report.summary.totalArtifacts} artifacts (${report.summary.totalTraceRefs} total traceRefs)`);
  lines.push("");

  if (report.documents.length === 0) {
    lines.push("_No traceRefs found in any artifacts._");
    lines.push("");
    return lines.join("\n") + "\n";
  }

  // Summary table
  lines.push("## Top Documents");
  lines.push("");
  lines.push("| Document | References |");
  lines.push("|----------|-----------|");
  for (const doc of report.documents.slice(0, 20)) {
    lines.push(`| \`${doc.path}\` | ${doc.artifacts.length} |`);
  }
  if (report.documents.length > 20) {
    lines.push(`| _... ${report.documents.length - 20} more_ | |`);
  }
  lines.push("");

  // Per-document detail
  for (const doc of report.documents) {
    lines.push(`## ${doc.path} (${doc.artifacts.length} artifacts)`);
    lines.push("");
    lines.push("| Artifact | Kind | Domain | Role |");
    lines.push("|----------|------|--------|------|");
    for (const entry of doc.artifacts) {
      lines.push(`| \`${entry.artifactId}\` | ${entry.kind} | ${entry.domain} | ${entry.role} |`);
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}
