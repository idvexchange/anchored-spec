/**
 * EA Evidence Pipeline Extension — Tests
 *
 * Tests for:
 * - EA evidence types and kinds
 * - Evidence creation, loading, writing, merging
 * - Evidence validation (artifact reference, freshness, status)
 * - Evidence summary
 * - CLI ea evidence subcommand
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import {
  EA_EVIDENCE_KINDS,
  createEaEvidenceRecord,
  loadEaEvidence,
  writeEaEvidence,
  mergeEaEvidence,
  validateEaEvidence,
  summarizeEaEvidence,
} from "../evidence.js";
import type {
  EaEvidenceKind,
  EaEvidenceRecord,
  EaEvidence,
} from "../evidence.js";
import type { EaArtifactBase } from "../types.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function makeArtifact(
  overrides: Partial<EaArtifactBase> & { id: string; kind: string },
): EaArtifactBase {
  return {
    id: overrides.id,
    kind: overrides.kind as any,
    name: overrides.name ?? overrides.id,
    domain: overrides.domain ?? ("systems" as any),
    status: overrides.status ?? ("current" as any),
    owner: overrides.owner ?? "team-a",
    lastUpdated: overrides.lastUpdated ?? "2025-01-01",
    confidence: overrides.confidence ?? ("declared" as any),
    ...overrides,
  } as EaArtifactBase;
}

function makeRecord(
  overrides?: Partial<EaEvidenceRecord>,
): EaEvidenceRecord {
  return {
    artifactId: overrides?.artifactId ?? "SYS-001",
    kind: overrides?.kind ?? "test",
    status: overrides?.status ?? "passed",
    recordedAt: overrides?.recordedAt ?? new Date().toISOString(),
    source: overrides?.source ?? "vitest",
    summary: overrides?.summary,
    duration: overrides?.duration,
    metadata: overrides?.metadata,
  };
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ea-evidence-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── EA Evidence Kinds ──────────────────────────────────────────────────────────

describe("EA Evidence Kinds", () => {
  it("has 9 evidence kinds", () => {
    expect(EA_EVIDENCE_KINDS).toHaveLength(9);
  });

  it("includes all expected kinds", () => {
    const expected: EaEvidenceKind[] = [
      "test", "contract", "deployment", "inventory",
      "catalog", "lineage", "policy", "security", "performance",
    ];
    for (const k of expected) {
      expect(EA_EVIDENCE_KINDS).toContain(k);
    }
  });
});

// ─── Evidence Record Creation ───────────────────────────────────────────────────

describe("createEaEvidenceRecord", () => {
  it("creates a record with required fields", () => {
    const record = createEaEvidenceRecord("SYS-001", "test", "passed", "vitest");

    expect(record.artifactId).toBe("SYS-001");
    expect(record.kind).toBe("test");
    expect(record.status).toBe("passed");
    expect(record.source).toBe("vitest");
    expect(record.recordedAt).toBeTruthy();
    expect(new Date(record.recordedAt).getTime()).not.toBeNaN();
  });

  it("includes optional fields when provided", () => {
    const record = createEaEvidenceRecord("SYS-002", "contract", "failed", "spectral", {
      summary: "3 OpenAPI violations",
      duration: 1500,
      metadata: { violations: 3 },
    });

    expect(record.summary).toBe("3 OpenAPI violations");
    expect(record.duration).toBe(1500);
    expect(record.metadata).toEqual({ violations: 3 });
  });
});

// ─── Evidence I/O ───────────────────────────────────────────────────────────────

describe("Evidence I/O", () => {
  it("returns null for non-existent file", () => {
    const result = loadEaEvidence(join(tempDir, "nope.json"));
    expect(result).toBeNull();
  });

  it("writes and reads evidence", () => {
    const evidence: EaEvidence = {
      generatedAt: new Date().toISOString(),
      records: [makeRecord()],
    };
    const path = join(tempDir, "evidence", "ea-evidence.json");
    writeEaEvidence(evidence, path);

    expect(existsSync(path)).toBe(true);
    const loaded = loadEaEvidence(path);
    expect(loaded).not.toBeNull();
    expect(loaded!.records).toHaveLength(1);
    expect(loaded!.records[0].artifactId).toBe("SYS-001");
  });

  it("creates nested directories for output", () => {
    const path = join(tempDir, "deeply", "nested", "evidence.json");
    writeEaEvidence({ generatedAt: new Date().toISOString(), records: [] }, path);
    expect(existsSync(path)).toBe(true);
  });

  it("returns null for malformed JSON", () => {
    const path = join(tempDir, "bad.json");
    writeFileSync(path, "not json!!");
    expect(loadEaEvidence(path)).toBeNull();
  });
});

// ─── Evidence Merging ───────────────────────────────────────────────────────────

describe("mergeEaEvidence", () => {
  it("creates evidence from null", () => {
    const records = [makeRecord({ artifactId: "SYS-001" })];
    const merged = mergeEaEvidence(null, records);

    expect(merged.records).toHaveLength(1);
    expect(merged.generatedAt).toBeTruthy();
  });

  it("merges new records with existing", () => {
    const existing: EaEvidence = {
      generatedAt: "2025-01-01T00:00:00Z",
      records: [makeRecord({ artifactId: "SYS-001", kind: "test" })],
    };

    const newRecords = [makeRecord({ artifactId: "SYS-002", kind: "contract" })];
    const merged = mergeEaEvidence(existing, newRecords);

    expect(merged.records).toHaveLength(2);
  });

  it("replaces records with same artifactId + kind", () => {
    const existing: EaEvidence = {
      generatedAt: "2025-01-01T00:00:00Z",
      records: [
        makeRecord({ artifactId: "SYS-001", kind: "test", status: "failed" }),
      ],
    };

    const newRecords = [
      makeRecord({ artifactId: "SYS-001", kind: "test", status: "passed" }),
    ];
    const merged = mergeEaEvidence(existing, newRecords);

    expect(merged.records).toHaveLength(1);
    expect(merged.records[0].status).toBe("passed");
  });

  it("keeps different kinds for same artifact separate", () => {
    const existing: EaEvidence = {
      generatedAt: "2025-01-01T00:00:00Z",
      records: [makeRecord({ artifactId: "SYS-001", kind: "test" })],
    };

    const newRecords = [makeRecord({ artifactId: "SYS-001", kind: "contract" })];
    const merged = mergeEaEvidence(existing, newRecords);

    expect(merged.records).toHaveLength(2);
  });
});

// ─── Evidence Validation ────────────────────────────────────────────────────────

describe("validateEaEvidence", () => {
  const artifacts = [
    makeArtifact({ id: "SYS-001", kind: "system" }),
    makeArtifact({ id: "SYS-002", kind: "system" }),
    makeArtifact({ id: "SYS-003", kind: "system", producesEvidence: true } as any),
  ];

  it("returns no issues for valid, fresh, passing evidence", () => {
    const evidence: EaEvidence = {
      generatedAt: new Date().toISOString(),
      records: [
        makeRecord({ artifactId: "SYS-001", status: "passed" }),
        makeRecord({ artifactId: "SYS-003", status: "passed" }),
      ],
    };

    const issues = validateEaEvidence(evidence, artifacts);
    expect(issues).toHaveLength(0);
  });

  it("warns when evidence references unknown artifact", () => {
    const evidence: EaEvidence = {
      generatedAt: new Date().toISOString(),
      records: [makeRecord({ artifactId: "UNKNOWN-999", status: "passed" })],
    };

    const issues = validateEaEvidence(evidence, artifacts);
    const artifactExists = issues.filter((i) => i.rule === "ea:evidence/artifact-exists");
    expect(artifactExists).toHaveLength(1);
    expect(artifactExists[0].severity).toBe("warning");
  });

  it("errors on failed evidence", () => {
    const evidence: EaEvidence = {
      generatedAt: new Date().toISOString(),
      records: [makeRecord({ artifactId: "SYS-001", status: "failed" })],
    };

    const issues = validateEaEvidence(evidence, artifacts);
    const statusIssues = issues.filter((i) => i.rule === "ea:evidence/status");
    expect(statusIssues).toHaveLength(1);
    expect(statusIssues[0].severity).toBe("error");
  });

  it("errors on error status evidence", () => {
    const evidence: EaEvidence = {
      generatedAt: new Date().toISOString(),
      records: [makeRecord({ artifactId: "SYS-001", status: "error" })],
    };

    const issues = validateEaEvidence(evidence, artifacts);
    const statusIssues = issues.filter((i) => i.rule === "ea:evidence/status");
    expect(statusIssues).toHaveLength(1);
    expect(statusIssues[0].severity).toBe("error");
  });

  it("warns on stale evidence (older than freshness window)", () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    const evidence: EaEvidence = {
      generatedAt: new Date().toISOString(),
      records: [
        makeRecord({
          artifactId: "SYS-001",
          status: "passed",
          recordedAt: oldDate.toISOString(),
        }),
      ],
    };

    const issues = validateEaEvidence(evidence, artifacts, { freshnessWindowDays: 30 });
    const freshnessIssues = issues.filter((i) => i.rule === "ea:evidence/freshness");
    expect(freshnessIssues).toHaveLength(1);
    expect(freshnessIssues[0].severity).toBe("warning");
  });

  it("respects custom freshness window", () => {
    const slightlyOld = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    const evidence: EaEvidence = {
      generatedAt: new Date().toISOString(),
      records: [
        makeRecord({
          artifactId: "SYS-001",
          status: "passed",
          recordedAt: slightlyOld.toISOString(),
        }),
      ],
    };

    // 7-day window → stale
    const issuesTight = validateEaEvidence(evidence, artifacts, { freshnessWindowDays: 7 });
    expect(issuesTight.some((i) => i.rule === "ea:evidence/freshness")).toBe(true);

    // 30-day window → fresh
    const issuesLoose = validateEaEvidence(evidence, artifacts, { freshnessWindowDays: 30 });
    expect(issuesLoose.some((i) => i.rule === "ea:evidence/freshness")).toBe(false);
  });

  it("warns when artifact declares producesEvidence but has none", () => {
    const evidence: EaEvidence = {
      generatedAt: new Date().toISOString(),
      records: [makeRecord({ artifactId: "SYS-001", status: "passed" })],
    };
    // SYS-003 has producesEvidence: true but no evidence records

    const issues = validateEaEvidence(evidence, artifacts);
    const coverageIssues = issues.filter((i) => i.rule === "ea:evidence/coverage");
    expect(coverageIssues).toHaveLength(1);
    expect(coverageIssues[0].path).toBe("SYS-003");
  });
});

// ─── Evidence Summary ───────────────────────────────────────────────────────────

describe("summarizeEaEvidence", () => {
  const artifacts = [
    makeArtifact({ id: "SYS-001", kind: "system" }),
    makeArtifact({ id: "SYS-002", kind: "system" }),
  ];

  it("counts by kind and status", () => {
    const evidence: EaEvidence = {
      generatedAt: new Date().toISOString(),
      records: [
        makeRecord({ artifactId: "SYS-001", kind: "test", status: "passed" }),
        makeRecord({ artifactId: "SYS-001", kind: "contract", status: "passed" }),
        makeRecord({ artifactId: "SYS-002", kind: "test", status: "failed" }),
      ],
    };

    const summary = summarizeEaEvidence(evidence, artifacts);
    expect(summary.totalRecords).toBe(3);
    expect(summary.byKind.test).toBe(2);
    expect(summary.byKind.contract).toBe(1);
    expect(summary.byStatus.passed).toBe(2);
    expect(summary.byStatus.failed).toBe(1);
  });

  it("counts covered artifacts", () => {
    const evidence: EaEvidence = {
      generatedAt: new Date().toISOString(),
      records: [makeRecord({ artifactId: "SYS-001" })],
    };

    const summary = summarizeEaEvidence(evidence, artifacts);
    expect(summary.coveredArtifacts).toBe(1);
  });

  it("counts stale records", () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const evidence: EaEvidence = {
      generatedAt: new Date().toISOString(),
      records: [
        makeRecord({ artifactId: "SYS-001", recordedAt: oldDate.toISOString() }),
        makeRecord({ artifactId: "SYS-002" }), // fresh
      ],
    };

    const summary = summarizeEaEvidence(evidence, artifacts, { freshnessWindowDays: 30 });
    expect(summary.staleCount).toBe(1);
  });

  it("counts uncovered artifacts that declare producesEvidence", () => {
    const artifactsWithEvidence = [
      makeArtifact({ id: "SYS-001", kind: "system" }),
      makeArtifact({ id: "SYS-002", kind: "system", producesEvidence: true } as any),
    ];
    const evidence: EaEvidence = {
      generatedAt: new Date().toISOString(),
      records: [makeRecord({ artifactId: "SYS-001" })],
    };

    const summary = summarizeEaEvidence(evidence, artifactsWithEvidence);
    expect(summary.uncoveredArtifacts).toBe(1);
  });
});

// ─── CLI Integration Tests ──────────────────────────────────────────────────────

describe("CLI: ea evidence", () => {
  const CLI_PATH = join(__dirname, "..", "..", "..", "dist", "cli", "index.js");
  const ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

  function run(args: string, cwd?: string): string {
    return execSync(`node ${CLI_PATH} ${args}`, {
      encoding: "utf-8",
      cwd: cwd ?? tempDir,
      env: ENV,
      timeout: 15_000,
    });
  }

  function runCode(args: string, cwd?: string): { stdout: string; code: number } {
    try {
      const stdout = execSync(`node ${CLI_PATH} ${args}`, {
        encoding: "utf-8",
        cwd: cwd ?? tempDir,
        env: ENV,
        timeout: 15_000,
      });
      return { stdout, code: 0 };
    } catch (err: any) {
      return { stdout: (err.stdout ?? "") + (err.stderr ?? ""), code: err.status ?? 1 };
    }
  }

  it("shows evidence help", () => {
    const output = run("ea evidence --help");
    expect(output).toContain("Manage EA evidence records");
    expect(output).toContain("ingest");
    expect(output).toContain("validate");
    expect(output).toContain("summary");
  });

  it("ingests evidence for an artifact", () => {
    const output = run(
      "ea evidence ingest --artifact SYS-001 --kind test --status passed --source vitest --summary 'All tests pass'",
    );
    expect(output).toContain("Evidence ingested for SYS-001");
    expect(output).toContain("Kind: test");
    expect(output).toContain("Status: passed");

    // Verify file was created
    const evidencePath = join(tempDir, "ea", "evidence", "ea-evidence.json");
    expect(existsSync(evidencePath)).toBe(true);

    const evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
    expect(evidence.records).toHaveLength(1);
    expect(evidence.records[0].artifactId).toBe("SYS-001");
  });

  it("accumulates evidence records", () => {
    run("ea evidence ingest --artifact SYS-001 --kind test --status passed --source vitest");
    run("ea evidence ingest --artifact SYS-002 --kind contract --status passed --source spectral");

    const evidencePath = join(tempDir, "ea", "evidence", "ea-evidence.json");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
    expect(evidence.records).toHaveLength(2);
  });

  it("replaces evidence for same artifact+kind", () => {
    run("ea evidence ingest --artifact SYS-001 --kind test --status failed --source vitest");
    run("ea evidence ingest --artifact SYS-001 --kind test --status passed --source vitest");

    const evidencePath = join(tempDir, "ea", "evidence", "ea-evidence.json");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
    expect(evidence.records).toHaveLength(1);
    expect(evidence.records[0].status).toBe("passed");
  });

  it("rejects unknown evidence kind", () => {
    const { code, stdout } = runCode(
      "ea evidence ingest --artifact SYS-001 --kind bogus --status passed --source vitest",
    );
    expect(code).not.toBe(0);
    expect(stdout).toContain("Unknown evidence kind");
  });

  it("rejects unknown status", () => {
    const { code, stdout } = runCode(
      "ea evidence ingest --artifact SYS-001 --kind test --status maybe --source vitest",
    );
    expect(code).not.toBe(0);
    expect(stdout).toContain("Unknown status");
  });

  it("supports custom output path", () => {
    const customPath = join(tempDir, "custom", "evidence.json");
    run(
      `ea evidence ingest --artifact SYS-001 --kind test --status passed --source vitest --output ${customPath}`,
    );
    expect(existsSync(customPath)).toBe(true);
  });
});
