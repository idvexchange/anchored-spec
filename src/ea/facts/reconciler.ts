/**
 * @module facts/reconciler
 *
 * Fact↔artifact reconciliation engine (Phase 3).
 * Compares extracted document facts against artifact anchor
 * declarations and reports mismatches.
 */

import type { FactManifest, FactKind } from "./types.js";
import type { EaArtifactBase, EaAnchors } from "../types.js";
import type { ConsistencyFinding, FactLocation } from "./consistency.js";

// ─── Types ──────────────────────────────────────────────────────────

export interface ReconciliationReport {
  passed: boolean;
  findings: ConsistencyFinding[];
  factsChecked: number;
  artifactsChecked: number;
}

// ─── Kind → Anchor Field Mapping ────────────────────────────────────

/** Maps fact kinds to the corresponding EaAnchors field. */
const KIND_TO_ANCHOR_FIELD: Partial<Record<FactKind, keyof EaAnchors>> = {
  "event-table": "events",
  "endpoint-table": "apis",
  "entity-fields": "symbols",
  "type-enum": "schemas",
  "payload-schema": "schemas",
  "status-enum": "statuses",
  "state-transition": "transitions",
};

// ─── Helpers ────────────────────────────────────────────────────────

/** Extract all anchor values for a given fact kind from an artifact. */
function getAnchorValues(
  artifact: EaArtifactBase,
  factKind: FactKind,
): string[] {
  const field = KIND_TO_ANCHOR_FIELD[factKind];
  if (!field || !artifact.anchors) return [];
  const values = artifact.anchors[field];
  if (Array.isArray(values)) return values;
  return [];
}

/** Collect all facts from manifests grouped by kind and key. */
function collectFactIndex(
  manifests: FactManifest[],
): Map<FactKind, Map<string, { file: string; line: number }[]>> {
  const index = new Map<
    FactKind,
    Map<string, { file: string; line: number }[]>
  >();

  for (const manifest of manifests) {
    for (const block of manifest.blocks) {
      for (const fact of block.facts) {
        let kindMap = index.get(fact.kind);
        if (!kindMap) {
          kindMap = new Map();
          index.set(fact.kind, kindMap);
        }
        let entries = kindMap.get(fact.key);
        if (!entries) {
          entries = [];
          kindMap.set(fact.key, entries);
        }
        entries.push({ file: manifest.source, line: fact.source.line });
      }
    }
  }

  return index;
}

// ─── Reconciliation Checks ──────────────────────────────────────────

/**
 * Check for artifact anchors that don't appear in any document fact.
 */
function checkArtifactMissingFact(
  artifacts: EaArtifactBase[],
  factIndex: Map<FactKind, Map<string, { file: string; line: number }[]>>,
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];

  for (const artifact of artifacts) {
    for (const [kind, anchorField] of Object.entries(KIND_TO_ANCHOR_FIELD)) {
      const factKind = kind as FactKind;
      const values = getAnchorValues(artifact, factKind);
      const kindFacts = factIndex.get(factKind);

      for (const anchorValue of values) {
        if (kindFacts?.has(anchorValue)) continue;

        findings.push({
          rule: "ea:docs/artifact-missing-fact",
          severity: "warning",
          message: `Artifact "${artifact.id}" declares ${anchorField} anchor "${anchorValue}" but no document contains a matching ${factKind} fact`,
          locations: [
            {
              file: artifact.id,
              line: 0,
              value: anchorValue,
            },
          ],
          suggestion: `Add a ${factKind} entry for "${anchorValue}" in the relevant documentation, or remove the anchor from "${artifact.id}"`,
        });
      }
    }
  }

  return findings;
}

/**
 * Check for document facts from annotated blocks that have no corresponding artifact.
 */
function checkFactMissingArtifact(
  manifests: FactManifest[],
  artifactAnchorIndex: Map<FactKind, Set<string>>,
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];

  for (const manifest of manifests) {
    for (const block of manifest.blocks) {
      // Only check annotated blocks (heuristic blocks may be noise)
      if (!block.annotation) continue;

      const factKind = block.kind;
      if (!KIND_TO_ANCHOR_FIELD[factKind]) continue;

      const anchorValues = artifactAnchorIndex.get(factKind);

      for (const fact of block.facts) {
        if (anchorValues?.has(fact.key)) continue;

        findings.push({
          rule: "ea:docs/fact-missing-artifact",
          severity: "warning",
          message: `Document fact "${fact.key}" (${factKind}) in "${manifest.source}" has no corresponding artifact anchor`,
          locations: [
            {
              file: manifest.source,
              line: fact.source.line,
              value: fact.key,
            },
          ],
          suggestion: `Add an artifact with a ${KIND_TO_ANCHOR_FIELD[factKind]!} anchor for "${fact.key}", or annotate the block with @ea:suppress`,
        });
      }
    }
  }

  return findings;
}

/**
 * Check for fact/artifact value mismatches.
 * Detects when a doc fact key and an artifact anchor are close but not identical.
 */
function checkArtifactMismatches(
  manifests: FactManifest[],
  artifacts: EaArtifactBase[],
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];

  // Build a map: for each kind, collect artifact anchor values with their artifact IDs
  const anchorDetails = new Map<
    FactKind,
    Map<string, string[]> // anchor value → artifact IDs
  >();

  for (const artifact of artifacts) {
    for (const [kind] of Object.entries(KIND_TO_ANCHOR_FIELD)) {
      const factKind = kind as FactKind;
      const values = getAnchorValues(artifact, factKind);
      for (const v of values) {
        let kindMap = anchorDetails.get(factKind);
        if (!kindMap) {
          kindMap = new Map();
          anchorDetails.set(factKind, kindMap);
        }
        let ids = kindMap.get(v);
        if (!ids) {
          ids = [];
          kindMap.set(v, ids);
        }
        ids.push(artifact.id);
      }
    }
  }

  // For each annotated fact, check if there's a near-miss anchor
  for (const manifest of manifests) {
    for (const block of manifest.blocks) {
      if (!block.annotation) continue;

      const factKind = block.kind;
      const kindAnchors = anchorDetails.get(factKind);
      if (!kindAnchors) continue;

      const anchorKeys = [...kindAnchors.keys()];

      for (const fact of block.facts) {
        // Skip exact matches (those are fine)
        if (kindAnchors.has(fact.key)) continue;

        // Look for near-miss: same prefix but different suffix
        for (const anchor of anchorKeys) {
          const factParts = fact.key.split(".");
          const anchorParts = anchor.split(".");

          if (
            factParts.length === anchorParts.length &&
            factParts.length >= 2 &&
            factParts.slice(0, -1).join(".") ===
              anchorParts.slice(0, -1).join(".")
          ) {
            const artifactIds = kindAnchors.get(anchor)!;

            const locations: FactLocation[] = [
              {
                file: manifest.source,
                line: fact.source.line,
                value: fact.key,
              },
              ...artifactIds.map((id) => ({
                file: id,
                line: 0,
                value: anchor,
              })),
            ];

            findings.push({
              rule: "ea:docs/artifact-mismatch",
              severity: "error",
              message: `Document says "${fact.key}" but artifact declares "${anchor}" — possible mismatch in ${factKind}`,
              locations,
              suggestion: `Verify whether "${fact.key}" and "${anchor}" refer to the same concept`,
            });
          }
        }
      }
    }
  }

  return findings;
}

// ─── Main Entry Point ───────────────────────────────────────────────

/**
 * Reconcile extracted document facts against artifact anchor declarations.
 */
export function reconcileFactsWithArtifacts(
  manifests: FactManifest[],
  artifacts: EaArtifactBase[],
): ReconciliationReport {
  const factIndex = collectFactIndex(manifests);

  // Build set of all anchor values per kind
  const artifactAnchorIndex = new Map<FactKind, Set<string>>();
  for (const artifact of artifacts) {
    for (const [kind] of Object.entries(KIND_TO_ANCHOR_FIELD)) {
      const factKind = kind as FactKind;
      const values = getAnchorValues(artifact, factKind);
      if (values.length === 0) continue;
      let anchorSet = artifactAnchorIndex.get(factKind);
      if (!anchorSet) {
        anchorSet = new Set();
        artifactAnchorIndex.set(factKind, anchorSet);
      }
      for (const v of values) anchorSet.add(v);
    }
  }

  const factsChecked = [...factIndex.values()].reduce(
    (sum, kindMap) =>
      sum +
      [...kindMap.values()].reduce(
        (s, entries) => s + entries.length,
        0,
      ),
    0,
  );

  const findings: ConsistencyFinding[] = [
    ...checkArtifactMissingFact(artifacts, factIndex),
    ...checkFactMissingArtifact(manifests, artifactAnchorIndex),
    ...checkArtifactMismatches(manifests, artifacts),
  ];

  const errors = findings.filter((f) => f.severity === "error").length;

  return {
    passed: errors === 0,
    findings,
    factsChecked,
    artifactsChecked: artifacts.length,
  };
}
