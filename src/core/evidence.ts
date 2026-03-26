/**
 * Anchored Spec — Test Evidence Pipeline
 *
 * Collects test evidence from runner output, maps to requirements,
 * and validates coverage claims. Supports pluggable parsers.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Requirement, ValidationError } from "./types.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface EvidenceRecord {
  requirementId: string;
  testFile: string;
  kind: string;
  status: "passed" | "failed" | "skipped" | "error";
  recordedAt: string;
  duration?: number;
}

export interface Evidence {
  generatedAt: string;
  source: "vitest" | "jest" | "junit" | "custom";
  records: EvidenceRecord[];
}

/** Pluggable parser interface for test runner output. */
export interface EvidenceParser {
  name: string;
  parse(reportPath: string, requirements: Requirement[]): EvidenceRecord[];
}

// ─── Vitest Parser ──────────────────────────────────────────────────────────────

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

function buildTestFileToReqMap(
  requirements: Requirement[],
): Map<string, Array<{ reqId: string; kind: string }>> {
  const map = new Map<string, Array<{ reqId: string; kind: string }>>();
  for (const req of requirements) {
    for (const ref of req.verification?.testRefs ?? []) {
      const existing = map.get(ref.path) ?? [];
      existing.push({ reqId: req.id, kind: ref.kind });
      map.set(ref.path, existing);
    }
    for (const file of req.verification?.testFiles ?? []) {
      const existing = map.get(file) ?? [];
      existing.push({ reqId: req.id, kind: "unit" });
      map.set(file, existing);
    }
  }
  return map;
}

export class VitestParser implements EvidenceParser {
  name = "vitest";

  parse(reportPath: string, requirements: Requirement[]): EvidenceRecord[] {
    const raw = readFileSync(reportPath, "utf-8");
    const report: VitestReport = JSON.parse(raw);
    const fileToReq = buildTestFileToReqMap(requirements);
    const records: EvidenceRecord[] = [];
    const now = new Date().toISOString();

    for (const result of report.testResults) {
      // Normalize path — vitest reports absolute paths
      const normalizedName = result.name;
      const matchingReqs: Array<{ reqId: string; kind: string }> = [];

      for (const [pattern, reqs] of fileToReq) {
        if (normalizedName.endsWith(pattern) || normalizedName.includes(pattern)) {
          matchingReqs.push(...reqs);
        }
      }

      for (const { reqId, kind } of matchingReqs) {
        const status =
          result.status === "passed"
            ? "passed"
            : result.status === "failed"
              ? "failed"
              : result.status === "skipped" || result.status === "pending"
                ? "skipped"
                : "error";

        records.push({
          requirementId: reqId,
          testFile: normalizedName,
          kind,
          status: status as EvidenceRecord["status"],
          recordedAt: now,
        });
      }
    }

    return records;
  }
}

// ─── Evidence Collection ────────────────────────────────────────────────────────

const PARSERS: Record<string, EvidenceParser> = {
  vitest: new VitestParser(),
};

export function collectEvidence(
  reportPath: string,
  format: string,
  requirements: Requirement[],
  customParser?: EvidenceParser,
): Evidence {
  const parser = customParser ?? PARSERS[format];
  if (!parser) {
    throw new Error(`Unsupported evidence format: "${format}". Supported: ${Object.keys(PARSERS).join(", ")}`);
  }

  const records = parser.parse(reportPath, requirements);

  return {
    generatedAt: new Date().toISOString(),
    source: format as Evidence["source"],
    records,
  };
}

export function writeEvidence(
  evidence: Evidence,
  outputPath: string,
): void {
  writeFileSync(
    outputPath,
    JSON.stringify(
      { $schema: "../schemas/evidence.schema.json", ...evidence },
      null,
      2,
    ) + "\n",
  );
}

// ─── Evidence Validation ────────────────────────────────────────────────────────

export function validateEvidence(
  evidencePath: string,
  requirements: Requirement[],
): ValidationError[] {
  const issues: ValidationError[] = [];

  if (!existsSync(evidencePath)) {
    issues.push({
      path: "evidence",
      message: "Evidence file not found. Run 'anchored-spec evidence collect' first.",
      severity: "warning",
      rule: "evidence:file-exists",
    });
    return issues;
  }

  let evidence: Evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
  } catch {
    issues.push({
      path: "evidence",
      message: "Evidence file is not valid JSON.",
      severity: "error",
      rule: "evidence:valid-json",
    });
    return issues;
  }

  // Check requirements with executionPolicy
  for (const req of requirements) {
    const policy = (req.verification as Record<string, unknown> | undefined)?.executionPolicy as
      | { requiresEvidence?: boolean; requiredKinds?: string[] }
      | undefined;
    if (!policy?.requiresEvidence) continue;

    const reqRecords = evidence.records.filter((r) => r.requirementId === req.id);
    if (reqRecords.length === 0) {
      issues.push({
        path: `${req.id}/evidence`,
        message: `${req.id} requires evidence but has no records in the evidence file.`,
        severity: "error",
        rule: "evidence:requirement-covered",
      });
      continue;
    }

    const failedRecords = reqRecords.filter((r) => r.status === "failed" || r.status === "error");
    if (failedRecords.length > 0) {
      issues.push({
        path: `${req.id}/evidence`,
        message: `${req.id} has ${failedRecords.length} failing test(s) in evidence.`,
        severity: "error",
        rule: "evidence:tests-passing",
      });
    }

    if (policy.requiredKinds) {
      const coveredKinds = new Set(reqRecords.map((r) => r.kind));
      for (const kind of policy.requiredKinds) {
        if (!coveredKinds.has(kind)) {
          issues.push({
            path: `${req.id}/evidence`,
            message: `${req.id} requires evidence for kind "${kind}" but none found.`,
            severity: "error",
            rule: "evidence:kind-coverage",
          });
        }
      }
    }
  }

  return issues;
}

// ─── Load helper ────────────────────────────────────────────────────────────────

export function loadEvidence(evidencePath: string): Evidence | null {
  if (!existsSync(evidencePath)) return null;
  try {
    return JSON.parse(readFileSync(evidencePath, "utf-8"));
  } catch {
    return null;
  }
}
