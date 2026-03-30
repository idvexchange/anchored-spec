/**
 * Tests for EA Evidence Adapters
 *
 * Covers:
 *   - VitestEaAdapter.parse
 *   - collectEaTestEvidence registry
 *   - registerEvidenceAdapter
 *   - getAvailableAdapters
 *   - Error handling for missing files/unknown formats
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  VitestEaAdapter,
  collectEaTestEvidence,
  registerEvidenceAdapter,
  getAvailableAdapters,
  type EvidenceAdapter,
} from "../evidence-adapters/index.js";
import type { EaArtifactBase } from "../types.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "evidence-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── Fixtures ───────────────────────────────────────────────────────────────────

function makeArtifact(id: string, anchors?: Record<string, string[]>, traceRefs?: Array<{ path: string; role: string }>): EaArtifactBase {
  return {
    id,
    kind: "service",
    name: id,
    status: "active",
    confidence: "high",
    relations: [],
    anchors,
    traceRefs,
  };
}

function writeVitestReport(records: Array<{ name: string; status: string }>): string {
  const report = {
    testResults: records.map((r) => ({
      name: r.name,
      status: r.status,
      assertionResults: [],
    })),
  };
  const path = join(tempDir, "vitest-results.json");
  writeFileSync(path, JSON.stringify(report));
  return path;
}

// ─── VitestEaAdapter ────────────────────────────────────────────────────────────

describe("VitestEaAdapter", () => {
  it("parses passed tests and maps to artifacts via anchors.symbols", () => {
    const reportPath = writeVitestReport([
      { name: "src/auth.test.ts", status: "passed" },
    ]);

    const artifacts = [
      makeArtifact("svc-auth", { symbols: ["auth.test"] }),
    ];

    const adapter = new VitestEaAdapter();
    const records = adapter.parse(reportPath, artifacts);

    expect(records).toHaveLength(1);
    expect(records[0]!.artifactId).toBe("svc-auth");
    expect(records[0]!.status).toBe("passed");
    expect(records[0]!.testFile).toBe("src/auth.test.ts");
  });

  it("parses failed tests", () => {
    const reportPath = writeVitestReport([
      { name: "src/broken.test.ts", status: "failed" },
    ]);

    const artifacts = [
      makeArtifact("svc-broken", { symbols: ["broken.test"] }),
    ];

    const adapter = new VitestEaAdapter();
    const records = adapter.parse(reportPath, artifacts);

    expect(records).toHaveLength(1);
    expect(records[0]!.status).toBe("failed");
  });

  it("maps via traceRefs", () => {
    const reportPath = writeVitestReport([
      { name: "src/user.test.ts", status: "passed" },
    ]);

    const artifacts = [
      makeArtifact("svc-user", undefined, [
        { path: "src/user.test.ts", role: "implementation" },
      ]),
    ];

    const adapter = new VitestEaAdapter();
    const records = adapter.parse(reportPath, artifacts);

    expect(records).toHaveLength(1);
    expect(records[0]!.artifactId).toBe("svc-user");
  });

  it("skips tests that don't match any artifact", () => {
    const reportPath = writeVitestReport([
      { name: "src/unrelated.test.ts", status: "passed" },
    ]);

    const adapter = new VitestEaAdapter();
    const records = adapter.parse(reportPath, []);
    expect(records).toHaveLength(0);
  });

  it("throws when report file doesn't exist", () => {
    const adapter = new VitestEaAdapter();
    expect(() => adapter.parse("/nonexistent/file.json", [])).toThrow(
      "Vitest report not found",
    );
  });

  it("maps skipped status", () => {
    const reportPath = writeVitestReport([
      { name: "src/skip.test.ts", status: "pending" },
    ]);

    const artifacts = [
      makeArtifact("svc-skip", { symbols: ["skip.test"] }),
    ];

    const adapter = new VitestEaAdapter();
    const records = adapter.parse(reportPath, artifacts);
    expect(records[0]!.status).toBe("skipped");
  });
});

// ─── collectEaTestEvidence ──────────────────────────────────────────────────────

describe("collectEaTestEvidence", () => {
  it("uses the vitest adapter by default", () => {
    const reportPath = writeVitestReport([
      { name: "src/check.test.ts", status: "passed" },
    ]);

    const artifacts = [makeArtifact("svc-check", { symbols: ["check.test"] })];
    const result = collectEaTestEvidence(reportPath, "vitest", artifacts);

    expect(result.source).toBe("vitest");
    expect(result.records).toHaveLength(1);
    expect(result.generatedAt).toBeTruthy();
  });

  it("throws for unknown format", () => {
    expect(() =>
      collectEaTestEvidence("/fake/path", "unknown-format", []),
    ).toThrow("Unsupported evidence format");
  });

  it("uses custom adapter when provided", () => {
    const customAdapter: EvidenceAdapter = {
      name: "custom",
      parse: () => [
        {
          artifactId: "custom-1",
          testFile: "test.ts",
          kind: "unit",
          status: "passed",
          recordedAt: new Date().toISOString(),
        },
      ],
    };

    const result = collectEaTestEvidence("/fake", "custom", [], customAdapter);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.artifactId).toBe("custom-1");
  });
});

// ─── registerEvidenceAdapter / getAvailableAdapters ─────────────────────────────

describe("Adapter registry", () => {
  it("vitest is available by default", () => {
    expect(getAvailableAdapters()).toContain("vitest");
  });

  it("registers a custom adapter", () => {
    const customAdapter: EvidenceAdapter = {
      name: "jest-custom",
      parse: () => [],
    };

    registerEvidenceAdapter(customAdapter);
    expect(getAvailableAdapters()).toContain("jest-custom");
  });
});
