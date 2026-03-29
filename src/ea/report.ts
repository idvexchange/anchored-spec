/**
 * Anchored Spec — EA Reports
 *
 * Report generators that produce cross-reference matrices and summaries
 * from loaded EA artifacts.
 */

import type { EaArtifactBase } from "./types.js";
import type { LogicalDataModelArtifact } from "./types.js";

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
