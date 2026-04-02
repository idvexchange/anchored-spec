/**
 * Anchored Spec — EA Evidence Adapters
 *
 * Pluggable adapters that parse test runner output into EA evidence records.
 * Each adapter transforms format-specific test results into a normalized
 * list of EA evidence artifacts.
 *
 * This is the EA EA-native evidence adapter framework VitestParser.
 */

import { readFileSync, existsSync } from "node:fs";
import type { BackstageEntity } from "../backstage/types.js";
import { getEntityAnchors, getEntityId, getEntityTraceRefs } from "../backstage/accessors.js";

// ─── Evidence Adapter Interface ─────────────────────────────────────────────────

export interface EaTestRecord {
  /** EA artifact ID this test relates to. */
  entityRef: string;
  /** Test file path. */
  testFile: string;
  /** Test kind (unit, integration, e2e, contract, manual). */
  kind: string;
  /** Test result status. */
  status: "passed" | "failed" | "skipped" | "error";
  /** When this record was created. */
  recordedAt: string;
  /** Test duration in ms. */
  duration?: number;
}

export interface EaEvidenceAdapterResult {
  source: string;
  records: EaTestRecord[];
  generatedAt: string;
}

/**
 * An evidence adapter parses test runner output into EA test records.
 */
export interface EvidenceAdapter {
  name: string;
  parse(reportPath: string, entities: BackstageEntity[]): EaTestRecord[];
}

// ─── Vitest Adapter ─────────────────────────────────────────────────────────────

interface VitestTestResult {
  assertionResults: Array<{
    ancestorTitles: string[];
    title: string;
    status: string;
    duration?: number;
  }>;
  name: string;
  status: string;
}

interface VitestReport {
  testResults: VitestTestResult[];
}

/**
 * Build a map from test file patterns to artifact IDs.
 * Uses EA artifact anchors (symbols, apis) and traceRefs as keys.
 */
function buildTestToArtifactMap(
  entities: BackstageEntity[],
): Map<string, Array<{ entityRef: string; kind: string }>> {
  const map = new Map<string, Array<{ entityRef: string; kind: string }>>();

  for (const entity of entities) {
    // Map from traceRefs if present
    for (const ref of getEntityTraceRefs(entity)) {
        if (ref.role === "implementation" || ref.path.includes("test")) {
          const existing = map.get(ref.path) ?? [];
          existing.push({ entityRef: getEntityId(entity), kind: "unit" });
          map.set(ref.path, existing);
        }
    }

    // Map from anchors.symbols
    const anchors = getEntityAnchors(entity);
    if (anchors?.symbols) {
      for (const sym of anchors.symbols) {
        const existing = map.get(sym) ?? [];
        existing.push({ entityRef: getEntityId(entity), kind: "unit" });
        map.set(sym, existing);
      }
    }
  }

  return map;
}

/**
 * Vitest evidence adapter — parses Vitest JSON reporter output into EA test records.
 *
 * Usage: `npx vitest run --reporter=json --outputFile=vitest-results.json`
 */
export class VitestEaAdapter implements EvidenceAdapter {
  name = "vitest";

  parse(reportPath: string, entities: BackstageEntity[]): EaTestRecord[] {
    if (!existsSync(reportPath)) {
      throw new Error(`Vitest report not found: ${reportPath}`);
    }

    const raw = readFileSync(reportPath, "utf-8");
    const report: VitestReport = JSON.parse(raw);
    const testToArtifact = buildTestToArtifactMap(entities);
    const records: EaTestRecord[] = [];
    const now = new Date().toISOString();

    for (const result of report.testResults) {
      const normalizedName = result.name;
      const matchingArtifacts: Array<{ entityRef: string; kind: string }> = [];

      for (const [pattern, refs] of testToArtifact) {
        if (normalizedName.endsWith(pattern) || normalizedName.includes(pattern)) {
          matchingArtifacts.push(...refs);
        }
      }

      for (const { entityRef, kind } of matchingArtifacts) {
        const status =
          result.status === "passed"
            ? "passed"
            : result.status === "failed"
              ? "failed"
              : result.status === "skipped" || result.status === "pending"
                ? "skipped"
                : "error";

        records.push({
          entityRef,
          testFile: normalizedName,
          kind,
          status: status as EaTestRecord["status"],
          recordedAt: now,
        });
      }
    }

    return records;
  }
}

// ─── Adapter Registry ───────────────────────────────────────────────────────────

const ADAPTERS: Record<string, EvidenceAdapter> = {
  vitest: new VitestEaAdapter(),
};

/**
 * Collect evidence from a test report using a named adapter.
 */
export function collectEaTestEvidence(
  reportPath: string,
  format: string,
  entities: BackstageEntity[],
  customAdapter?: EvidenceAdapter,
): EaEvidenceAdapterResult {
  const adapter = customAdapter ?? ADAPTERS[format];
  if (!adapter) {
    throw new Error(
      `Unsupported evidence format: "${format}". Supported: ${Object.keys(ADAPTERS).join(", ")}`,
    );
  }

  const records = adapter.parse(reportPath, entities);

  return {
    source: format,
    records,
    generatedAt: new Date().toISOString(),
  };
}

/** Register a custom evidence adapter. */
export function registerEvidenceAdapter(adapter: EvidenceAdapter): void {
  ADAPTERS[adapter.name] = adapter;
}

/** Get available adapter names. */
export function getAvailableAdapters(): string[] {
  return Object.keys(ADAPTERS);
}
