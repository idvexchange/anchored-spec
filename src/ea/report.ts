/**
 * Anchored Spec — EA Reports
 *
 * Report generators that produce cross-reference matrices and summaries
 * from loaded EA artifacts.
 */

import type { EaArtifactBase } from "./types.js";
import type {
  LogicalDataModelArtifact,
  ClassificationArtifact,
  CanonicalEntityArtifact,
  InformationExchangeArtifact,
  CapabilityArtifact,
  MissionArtifact,
  ControlArtifact,
} from "./types.js";
import { evaluateEaDrift } from "./drift.js";

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
export function buildSystemDataMatrix(artifacts: EaArtifactBase[]): SystemDataMatrixReport {
  const byId = new Map<string, EaArtifactBase>();
  for (const a of artifacts) {
    byId.set(a.id, a);
  }

  const apps = artifacts.filter((a) => a.kind === "application");
  const stores = artifacts.filter((a) => a.kind === "data-store");
  const ldms = artifacts.filter((a) => a.kind === "logical-data-model");

  // Build store → LDMs index
  const storeToLdms = new Map<string, EaArtifactBase[]>();
  for (const store of stores) {
    if (!store.relations) continue;
    for (const rel of store.relations) {
      if (rel.type === "stores") {
        const target = byId.get(rel.target);
        if (target && target.kind === "logical-data-model") {
          const list = storeToLdms.get(store.id) ?? [];
          list.push(target);
          storeToLdms.set(store.id, list);
        }
      }
    }
  }

  // Also check LDMs with implementedBy → data-store
  for (const ldm of ldms) {
    if (!ldm.relations) continue;
    for (const rel of ldm.relations) {
      if (rel.type === "implementedBy") {
        const target = byId.get(rel.target);
        if (target && target.kind === "data-store") {
          const list = storeToLdms.get(target.id) ?? [];
          if (!list.some((l) => l.id === ldm.id)) {
            list.push(ldm);
            storeToLdms.set(target.id, list);
          }
        }
      }
    }
  }

  const allClassifications = new Set<string>();
  const matrix: SystemDataCell[] = [];

  for (const app of apps) {
    if (!app.relations) continue;
    for (const rel of app.relations) {
      if (rel.type !== "uses") continue;
      const store = byId.get(rel.target);
      if (!store || store.kind !== "data-store") continue;

      const linkedLdms = storeToLdms.get(store.id) ?? [];
      const logicalModels = linkedLdms.map((ldm) => {
        const typedLdm = ldm as unknown as LogicalDataModelArtifact;
        const classifications = (typedLdm.attributes ?? [])
          .map((attr) => attr.classification)
          .filter((c): c is string => !!c);
        for (const c of classifications) allClassifications.add(c);
        return {
          id: ldm.id,
          title: ldm.title,
          classifications: [...new Set(classifications)],
        };
      });

      matrix.push({
        applicationId: app.id,
        applicationTitle: app.title,
        dataStoreId: store.id,
        dataStoreTitle: store.title,
        relationType: rel.type,
        logicalModels,
      });
    }
  }

  return {
    applications: apps.map((a) => ({ id: a.id, title: a.title, status: a.status })),
    dataStores: stores.map((s) => {
      const tech = (s as any).technology;
      return {
        id: s.id,
        title: s.title,
        technology: tech?.engine,
        status: s.status,
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
export function buildClassificationCoverage(artifacts: EaArtifactBase[]): ClassificationCoverageReport {
  const byId = new Map<string, EaArtifactBase>();
  for (const a of artifacts) {
    byId.set(a.id, a);
  }

  const classifications = artifacts.filter((a) => a.kind === "classification");
  const entries: ClassificationCoverageEntry[] = [];

  let totalCoveredEntities = 0;
  let totalStores = 0;
  let totalEnforced = 0;
  let totalGaps = 0;
  let totalExchanges = 0;
  let totalExchangeGaps = 0;

  for (const cls of classifications) {
    const clsArt = cls as unknown as ClassificationArtifact;

    // Find all artifacts that classifiedAs this classification
    const coveredEntities: ClassifiedEntity[] = [];
    for (const a of artifacts) {
      if (!a.relations) continue;
      const hasClassification = a.relations.some(
        (r) => r.type === "classifiedAs" && r.target === cls.id
      );
      if (hasClassification) {
        coveredEntities.push({
          entityId: a.id,
          entityTitle: a.title,
          kind: a.kind,
        });
      }
    }

    // Find downstream stores for each covered entity
    const storeMap = new Map<string, ClassificationStore>();
    for (const entity of coveredEntities) {
      const entityArt = byId.get(entity.entityId);
      if (!entityArt) continue;

      // Find stores via entity's implementedBy relations
      for (const r of entityArt.relations ?? []) {
        if (r.type === "implementedBy") {
          const target = byId.get(r.target);
          if (target && (target.kind === "data-store" || target.kind === "physical-schema") && !storeMap.has(target.id)) {
            const enforced = (target.relations ?? []).some(
              (tr) => tr.type === "classifiedAs" && tr.target === cls.id
            );
            storeMap.set(target.id, {
              storeId: target.id,
              storeTitle: target.title,
              enforced,
            });
          }
        }
      }

      // Find stores that reference this entity via stores relation
      for (const a of artifacts) {
        if (!a.relations) continue;
        const storesEntity = a.relations.some(
          (r) => r.type === "stores" && r.target === entity.entityId
        );
        if (storesEntity && !storeMap.has(a.id)) {
          const enforced = (a.relations ?? []).some(
            (r) => r.type === "classifiedAs" && r.target === cls.id
          );
          storeMap.set(a.id, {
            storeId: a.id,
            storeTitle: a.title,
            enforced,
          });
        }
      }
    }

    // Find exchanges carrying classified entities
    const exchanges: ClassificationCoverageEntry["exchanges"] = [];
    for (const a of artifacts) {
      if (a.kind !== "information-exchange") continue;
      const exch = a as unknown as InformationExchangeArtifact;
      if (!exch.exchangedEntities) continue;

      const carriesClassifiedEntity = exch.exchangedEntities.some((eid) =>
        coveredEntities.some((ce) => ce.entityId === eid)
      );
      if (carriesClassifiedEntity) {
        exchanges.push({
          exchangeId: a.id,
          exchangeTitle: a.title,
          declaresClassification: exch.classificationLevel === cls.id,
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
      classificationId: cls.id,
      classificationTitle: cls.title,
      level: clsArt.level ?? "",
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
export function buildCapabilityMap(artifacts: EaArtifactBase[]): CapabilityMapReport {
  const byId = new Map<string, EaArtifactBase>();
  for (const a of artifacts) byId.set(a.id, a);

  const capabilities = artifacts.filter((a) => a.kind === "capability") as unknown as CapabilityArtifact[];
  const missionArtifacts = artifacts.filter((a) => a.kind === "mission") as unknown as MissionArtifact[];

  // Build reverse indexes
  const realizesMap = new Map<string, string[]>();
  const supportsMap = new Map<string, string[]>();
  const ownsReverseMap = new Map<string, string>(); // target → org-unit
  const governedByMap = new Map<string, string[]>();

  for (const a of artifacts) {
    if (!a.relations) continue;
    for (const rel of a.relations) {
      if (rel.type === "realizes") {
        const list = realizesMap.get(rel.target) ?? [];
        list.push(a.id);
        realizesMap.set(rel.target, list);
      }
      if (rel.type === "supports") {
        const list = supportsMap.get(a.id) ?? [];
        list.push(rel.target);
        supportsMap.set(a.id, list);
      }
      if (rel.type === "owns") {
        ownsReverseMap.set(rel.target, a.id);
      }
      if (rel.type === "governedBy") {
        const list = governedByMap.get(a.id) ?? [];
        list.push(rel.target);
        governedByMap.set(a.id, list);
      }
    }
  }

  // Run drift to get per-artifact summaries
  const driftResult = evaluateEaDrift(artifacts);
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
  const processArtifacts = artifacts.filter((a) => a.kind === "process");
  for (const proc of processArtifacts) {
    if (!proc.relations) continue;
    for (const rel of proc.relations) {
      if (rel.type === "realizes" || rel.type === "supports") {
        const target = byId.get(rel.target);
        if (target && target.kind === "capability") {
          const list = capProcesses.get(rel.target) ?? [];
          if (!list.includes(proc.id)) list.push(proc.id);
          capProcesses.set(rel.target, list);
        }
      }
    }
  }

  // Find controls related to each capability (via governedBy on the capability)
  const capControls = new Map<string, string[]>();
  for (const cap of capabilities) {
    const governed = governedByMap.get(cap.id) ?? [];
    const controls: string[] = [];
    for (const gId of governed) {
      const target = byId.get(gId);
      if (target && target.kind === "control") {
        controls.push(target.id);
      }
    }
    if (controls.length > 0) {
      capControls.set(cap.id, controls);
    }
  }

  // Build capability nodes
  function buildNode(cap: CapabilityArtifact): CapabilityMapNode {
    return {
      id: cap.id,
      title: cap.title,
      level: cap.level,
      parent: cap.parentCapability,
      maturity: cap.maturity,
      strategicImportance: cap.strategicImportance,
      investmentProfile: cap.investmentProfile,
      heatMap: cap.heatMap ? { ...cap.heatMap } : undefined,
      realizingSystems: realizesMap.get(cap.id) ?? [],
      processes: capProcesses.get(cap.id) ?? [],
      controls: capControls.get(cap.id) ?? [],
      owningOrg: ownsReverseMap.get(cap.id),
      driftSummary: driftByCap.get(cap.id) ?? { errors: 0, warnings: 0 },
      children: [],
    };
  }

  // Build tree: group capabilities by parent
  const nodeMap = new Map<string, CapabilityMapNode>();
  for (const cap of capabilities) {
    nodeMap.set(cap.id, buildNode(cap));
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
    const targets = supportsMap.get(cap.id) ?? [];
    for (const t of targets) {
      const target = byId.get(t);
      if (target && target.kind === "mission") {
        const set = missionCaps.get(t) ?? new Set();
        set.add(cap.id);
        missionCaps.set(t, set);
      }
    }
  }

  // Build mission entries with their capability trees
  const mappedCapIds = new Set<string>();
  const missionEntries: CapabilityMapMission[] = [];

  for (const mission of missionArtifacts) {
    const directCapIds = missionCaps.get(mission.id) ?? new Set();
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
        id: mission.id,
        title: mission.title,
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
