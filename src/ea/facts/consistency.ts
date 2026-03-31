/**
 * @module facts/consistency
 *
 * Cross-document consistency engine (Phase 2).
 * Groups facts across documents by semantic key and kind,
 * compares field values, and reports contradictions.
 */

import type { ExtractedFact, FactManifest, DocumentMarker } from "./types.js";

// ─── Finding Types ──────────────────────────────────────────────────

export interface FactLocation {
  file: string;
  line: number;
  value: string;
}

export interface ConsistencyFinding {
  /** Rule ID for the finding (e.g., "ea:docs/value-mismatch") */
  rule: string;
  /** Severity level */
  severity: "error" | "warning";
  /** Human-readable description */
  message: string;
  /** Affected fact locations across documents */
  locations: FactLocation[];
  /** Optional suggestion for resolution */
  suggestion?: string;
  /** Whether this finding is suppressed by an @ea:suppress annotation */
  suppressed?: boolean;
  /** The suppression annotation that suppressed this finding */
  suppressedBy?: { file: string; reason: string };
}

export interface ConsistencyReport {
  passed: boolean;
  totalFindings: number;
  errors: number;
  warnings: number;
  findings: ConsistencyFinding[];
  factsAnalyzed: number;
  documentsAnalyzed: number;
}

// ─── Grouping ───────────────────────────────────────────────────────

/**
 * Group all facts across manifests by `${kind}::${key}`.
 * Each entry tracks the fact and the file it came from.
 */
export function groupFactsByKey(
  manifests: FactManifest[],
): Map<string, { fact: ExtractedFact; file: string }[]> {
  const groups = new Map<string, { fact: ExtractedFact; file: string }[]>();

  for (const manifest of manifests) {
    for (const block of manifest.blocks) {
      for (const fact of block.facts) {
        const groupKey = `${fact.kind}::${fact.key}`;
        let group = groups.get(groupKey);
        if (!group) {
          group = [];
          groups.set(groupKey, group);
        }
        group.push({ fact, file: manifest.source });
      }
    }
  }

  return groups;
}

// ─── Comparison Helpers ─────────────────────────────────────────────

/** Simple Levenshtein distance for short strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from<number>({ length: n + 1 }).fill(0),
  );

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }

  return dp[m]![n]!;
}

/** Collect unique files from a group. */
function uniqueFiles(
  entries: { fact: ExtractedFact; file: string }[],
): Set<string> {
  return new Set(entries.map((e) => e.file));
}

// ─── Check: Value Mismatch ──────────────────────────────────────────

function checkValueMismatches(
  groups: Map<string, { fact: ExtractedFact; file: string }[]>,
  markerIndex?: Map<string, "canonical" | "derived">,
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];

  for (const [groupKey, entries] of groups) {
    if (uniqueFiles(entries).size < 2) continue;

    // Collect all field names across this group
    const fieldNames = new Set<string>();
    for (const { fact } of entries) {
      for (const name of Object.keys(fact.fields)) {
        fieldNames.add(name);
      }
    }

    for (const fieldName of fieldNames) {
      // Collect entries that have this field
      const withField = entries.filter(
        (e) => e.fact.fields[fieldName] !== undefined,
      );
      if (uniqueFiles(withField).size < 2) continue;

      // Group by distinct value
      const byValue = new Map<string, { fact: ExtractedFact; file: string }[]>();
      for (const entry of withField) {
        const val = entry.fact.fields[fieldName] ?? "";
        let bucket = byValue.get(val);
        if (!bucket) {
          bucket = [];
          byValue.set(val, bucket);
        }
        bucket.push(entry);
      }

      if (byValue.size < 2) continue;

      const locations: FactLocation[] = withField.map((e) => ({
        file: e.file,
        line: e.fact.source.line,
        value: e.fact.fields[fieldName] ?? "",
      }));

      const [kind, key] = groupKey.split("::");
      const finding: ConsistencyFinding = {
        rule: "ea:docs/value-mismatch",
        severity: "error",
        message: `Field "${fieldName}" for ${kind} fact "${key}" has conflicting values across documents`,
        locations,
        suggestion: `Align the "${fieldName}" value across all documents`,
      };

      // Enhance message if canonical/derived markers exist
      if (markerIndex && markerIndex.size > 0) {
        const canonicalLocs = locations.filter(l => markerIndex.get(l.file) === "canonical");
        const derivedLocs = locations.filter(l => markerIndex.get(l.file) === "derived");

        if (canonicalLocs.length > 0 && derivedLocs.length > 0) {
          const canonFile = canonicalLocs[0]!.file;
          const derivedFile = derivedLocs[0]!.file;
          finding.suggestion = `Canonical doc "${canonFile}" says "${canonicalLocs[0]!.value}" — update derived doc "${derivedFile}" to match`;
        }
      }

      findings.push(finding);
    }
  }

  return findings;
}

// ─── Check: Missing Entry ───────────────────────────────────────────

function checkMissingEntries(
  manifests: FactManifest[],
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];

  // Index blocks by blockId across files
  const blockIndex = new Map<
    string,
    { file: string; factKeys: Set<string>; line: number }[]
  >();

  for (const manifest of manifests) {
    for (const block of manifest.blocks) {
      const blockId = block.id ?? block.annotation?.id;
      if (!blockId) continue;

      const factKeys = new Set(block.facts.map((f) => f.key));
      let entries = blockIndex.get(blockId);
      if (!entries) {
        entries = [];
        blockIndex.set(blockId, entries);
      }
      entries.push({ file: manifest.source, factKeys, line: block.source.line });
    }
  }

  for (const [blockId, entries] of blockIndex) {
    if (entries.length < 2) continue;

    // Compute the union of all keys
    const allKeys = new Set<string>();
    for (const entry of entries) {
      for (const key of entry.factKeys) {
        allKeys.add(key);
      }
    }

    // Find entries that are missing keys present in others
    for (const entry of entries) {
      const missing = [...allKeys].filter((k) => !entry.factKeys.has(k));
      if (missing.length === 0) continue;

      // Find which files have the missing keys as references
      const otherFiles = entries
        .filter((e) => e.file !== entry.file)
        .map((e) => e.file);

      findings.push({
        rule: "ea:docs/missing-entry",
        severity: "warning",
        message: `Block "${blockId}" in "${entry.file}" is missing entries [${missing.join(", ")}] present in [${otherFiles.join(", ")}]`,
        locations: [
          { file: entry.file, line: entry.line, value: `missing: ${missing.join(", ")}` },
          ...entries
            .filter((e) => e.file !== entry.file)
            .map((e) => ({
              file: e.file,
              line: e.line,
              value: `has: ${[...e.factKeys].join(", ")}`,
            })),
        ],
      });
    }
  }

  return findings;
}

// ─── Check: Extra Entry (Symmetric Difference) ─────────────────────

function checkExtraEntries(
  manifests: FactManifest[],
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];

  // Index blocks by blockId across files
  const blockIndex = new Map<
    string,
    { file: string; factKeys: Set<string>; line: number }[]
  >();

  for (const manifest of manifests) {
    for (const block of manifest.blocks) {
      const blockId = block.id ?? block.annotation?.id;
      if (!blockId) continue;

      const factKeys = new Set(block.facts.map((f) => f.key));
      let entries = blockIndex.get(blockId);
      if (!entries) {
        entries = [];
        blockIndex.set(blockId, entries);
      }
      entries.push({ file: manifest.source, factKeys, line: block.source.line });
    }
  }

  for (const [blockId, entries] of blockIndex) {
    if (entries.length < 2) continue;

    // Check all pairs for symmetric differences
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]!;
        const b = entries[j]!;

        const onlyInA = [...a.factKeys].filter((k) => !b.factKeys.has(k));
        const onlyInB = [...b.factKeys].filter((k) => !a.factKeys.has(k));

        // Symmetric difference: BOTH have entries the other lacks
        if (onlyInA.length > 0 && onlyInB.length > 0) {
          findings.push({
            rule: "ea:docs/extra-entry",
            severity: "error",
            message: `Block "${blockId}" has contradicting entries: "${a.file}" has [${onlyInA.join(", ")}] not in "${b.file}", and "${b.file}" has [${onlyInB.join(", ")}] not in "${a.file}"`,
            locations: [
              { file: a.file, line: a.line, value: `extra: ${onlyInA.join(", ")}` },
              { file: b.file, line: b.line, value: `extra: ${onlyInB.join(", ")}` },
            ],
            suggestion: `Reconcile block "${blockId}" — decide which entries belong in both documents`,
          });
        }
      }
    }
  }

  return findings;
}

// ─── Check: Naming Inconsistency ────────────────────────────────────

function checkNamingInconsistencies(
  groups: Map<string, { fact: ExtractedFact; file: string }[]>,
  mappingPairs?: Set<string>,
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];

  // Compare keys within the same kind across different files
  const byKind = new Map<string, { key: string; file: string; line: number }[]>();

  for (const [groupKey, entries] of groups) {
    const kind = groupKey.split("::")[0]!;
    let kindEntries = byKind.get(kind);
    if (!kindEntries) {
      kindEntries = [];
      byKind.set(kind, kindEntries);
    }
    for (const entry of entries) {
      kindEntries.push({
        key: entry.fact.key,
        file: entry.file,
        line: entry.fact.source.line,
      });
    }
  }

  for (const [kind, entries] of byKind) {
    // Deduplicate keys per file
    const keysByFile = new Map<string, Set<string>>();
    for (const entry of entries) {
      let keys = keysByFile.get(entry.file);
      if (!keys) {
        keys = new Set();
        keysByFile.set(entry.file, keys);
      }
      keys.add(entry.key);
    }

    const files = [...keysByFile.keys()];
    if (files.length < 2) continue;

    // Compare keys across file pairs
    const reported = new Set<string>();
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const keysA = [...keysByFile.get(files[i]!)!];
        const keysB = [...keysByFile.get(files[j]!)!];

        for (const a of keysA) {
          for (const b of keysB) {
            if (a === b) continue;
            const pairKey = [a, b].sort().join("|");
            if (reported.has(pairKey)) continue;

            const dist = levenshtein(a, b);
            const maxLen = Math.max(a.length, b.length);
            // Flag if within 30% edit distance and at least 3 chars long
            if (maxLen >= 3 && dist > 0 && dist <= Math.ceil(maxLen * 0.3)) {
              reported.add(pairKey);

              const locA = entries.find(
                (e) => e.key === a && e.file === files[i],
              );
              const locB = entries.find(
                (e) => e.key === b && e.file === files[j],
              );
              if (!locA || !locB) continue;

              // Check if this is an intentional mapping
              const pairKey1 = `${a}|${b}`;
              const pairKey2 = `${b}|${a}`;
              const isMapped = mappingPairs?.has(pairKey1) || mappingPairs?.has(pairKey2);

              findings.push({
                rule: "ea:docs/naming-inconsistency",
                severity: isMapped ? "warning" : "error",
                message: isMapped
                  ? `${kind} keys "${a}" and "${b}" differ but are listed as an intentional mapping`
                  : `${kind} keys "${a}" and "${b}" are suspiciously similar — possible naming inconsistency`,
                locations: [
                  { file: locA.file, line: locA.line, value: a },
                  { file: locB.file, line: locB.line, value: b },
                ],
                suggestion: isMapped
                  ? `Mapping table confirms "${a}" ↔ "${b}" is intentional — suppress with @ea:suppress if desired`
                  : `Verify whether "${a}" and "${b}" refer to the same concept`,
              });
            }
          }
        }
      }
    }
  }

  return findings;
}

// ─── Check: State Machine Conflict ──────────────────────────────────

function checkStateMachineConflicts(
  groups: Map<string, { fact: ExtractedFact; file: string }[]>,
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];

  // Collect state-transition facts grouped by `from` state
  const byFromState = new Map<
    string,
    { fact: ExtractedFact; file: string }[]
  >();

  for (const [groupKey, entries] of groups) {
    const kind = groupKey.split("::")[0];
    if (kind !== "state-transition") continue;

    for (const entry of entries) {
      const from = entry.fact.fields["from"];
      if (!from) continue;

      let bucket = byFromState.get(from);
      if (!bucket) {
        bucket = [];
        byFromState.set(from, bucket);
      }
      bucket.push(entry);
    }
  }

  for (const [fromState, entries] of byFromState) {
    if (uniqueFiles(entries).size < 2) continue;

    // Group by `to` state
    const byTo = new Map<string, { fact: ExtractedFact; file: string }[]>();
    for (const entry of entries) {
      const to = entry.fact.fields["to"];
      if (!to) continue;

      let bucket = byTo.get(to);
      if (!bucket) {
        bucket = [];
        byTo.set(to, bucket);
      }
      bucket.push(entry);
    }

    // Only conflict if same `from` but different `to` across files
    if (byTo.size < 2) continue;

    // Check if different files disagree on `to` for the same transition key
    const fileToStates = new Map<string, Set<string>>();
    for (const entry of entries) {
      const to = entry.fact.fields["to"];
      if (!to) continue;
      let states = fileToStates.get(entry.file);
      if (!states) {
        states = new Set();
        fileToStates.set(entry.file, states);
      }
      states.add(to);
    }

    // Find `to` states that appear only in some files
    const allToStates = new Set<string>();
    for (const states of fileToStates.values()) {
      for (const s of states) allToStates.add(s);
    }

    const locations: FactLocation[] = entries.map((e) => ({
      file: e.file,
      line: e.fact.source.line,
      value: `${fromState} → ${e.fact.fields["to"] ?? "?"}`,
    }));

    // Only flag when different files have different transition targets
    const fileSignatures = new Map<string, string>();
    for (const [file, states] of fileToStates) {
      fileSignatures.set(file, [...states].sort().join(","));
    }
    const uniqueSignatures = new Set(fileSignatures.values());
    if (uniqueSignatures.size < 2) continue;

    findings.push({
      rule: "ea:docs/state-machine-conflict",
      severity: "error",
      message: `State machine conflict: state "${fromState}" has different transitions across documents`,
      locations,
      suggestion: `Reconcile the transitions from "${fromState}" across all documents`,
    });
  }

  return findings;
}

// ─── Main Entry Point ───────────────────────────────────────────────

/**
 * Run all cross-document consistency checks.
 *
 * @param manifests - Fact manifests from each document
 * @param options   - Optional kind filter to restrict which facts are checked
 * @returns Consistency report with all findings
 */
export function checkConsistency(
  manifests: FactManifest[],
  options?: { kindFilter?: string },
): ConsistencyReport {
  // Optionally filter manifests to a specific fact kind
  const filtered: FactManifest[] = options?.kindFilter
    ? manifests.map((m) => ({
        ...m,
        blocks: m.blocks.filter((b) =>
          b.facts.some((f) => f.kind === options.kindFilter),
        ),
      }))
    : manifests;

  const groups = groupFactsByKey(filtered);

  // Build marker index: file → marker type
  const markerIndex = new Map<string, "canonical" | "derived">();
  for (const m of manifests) {
    if (m.markers && m.markers.length > 0) {
      const canonical = m.markers.find(mk => mk.type === "canonical");
      const derived = m.markers.find(mk => mk.type === "derived");
      if (canonical) markerIndex.set(m.source, "canonical");
      else if (derived) markerIndex.set(m.source, "derived");
    }
  }

  const totalFacts = [...groups.values()].reduce(
    (sum, entries) => sum + entries.length,
    0,
  );

  // Build mapping pairs from mapping-table facts
  const mappingPairs = new Set<string>();
  for (const manifest of filtered) {
    for (const block of manifest.blocks) {
      if (block.kind !== "mapping-table") continue;
      for (const fact of block.facts) {
        const values = Object.values(fact.fields);
        if (values.length >= 2) {
          const from = values[0]!;
          for (let i = 1; i < values.length; i++) {
            mappingPairs.add(`${from}|${values[i]!}`);
          }
        }
      }
    }
  }

  const findings: ConsistencyFinding[] = [
    ...checkValueMismatches(groups, markerIndex),
    ...checkMissingEntries(filtered),
    ...checkExtraEntries(filtered),
    ...checkNamingInconsistencies(groups, mappingPairs),
    ...checkStateMachineConflicts(groups),
  ];

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;

  return {
    passed: errors === 0,
    totalFindings: findings.length,
    errors,
    warnings,
    findings,
    factsAnalyzed: totalFacts,
    documentsAnalyzed: new Set(manifests.map((m) => m.source)).size,
  };
}
