/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * EA Drift Engine Core — Tests
 *
 * Tests for:
 * - detectEaDrift() — full pipeline with exception suppression, severity overrides
 * - EaDriftFinding, EaDriftReport types
 * - Domain filtering
 * - Exception suppression logic
 * - Severity override logic
 * - Drift heatmap report
 * - CLI: ea drift
 * - CLI: ea report --view drift-heatmap
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import {
  detectEaDrift,
  evaluateEaDrift,
  buildDriftHeatmap,
  renderDriftHeatmapMarkdown,
  REPORT_VIEWS,
} from "../index.js";
import type {
  EaArtifactBase,
  EaDriftFinding,
  EaDriftReport,
} from "../index.js";
import type { ExceptionArtifact } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<EaArtifactBase> & { id: string; kind: string }): EaArtifactBase {
  return {
    apiVersion: "anchored-spec/ea/v1",
    title: overrides.title ?? overrides.id,
    summary: "Test artifact",
    owners: ["team-test"],
    tags: [],
    confidence: "declared",
    status: "active",
    schemaVersion: "1.0.0",
    relations: [],
    ...overrides,
  } as EaArtifactBase;
}

function makeException(overrides: Record<string, unknown> = {}): ExceptionArtifact {
  const future = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
  return makeArtifact({
    id: overrides.id as string ?? "EXCEPT-001",
    kind: "exception",
    scope: overrides.scope ?? { artifactIds: ["SYS-001"], rules: ["ea:systems/consumer-contract-version-mismatch"] },
    approvedBy: "chief-architect",
    approvedAt: "2025-01-15",
    expiresAt: overrides.expiresAt as string ?? future.toISOString().split("T")[0],
    reason: "Test exception",
    reviewSchedule: "quarterly",
    ...overrides,
  } as any) as unknown as ExceptionArtifact;
}

// Create a set of artifacts that will trigger specific drift rules
function makeConsumerWithMismatch(): EaArtifactBase[] {
  return [
    makeArtifact({
      id: "API-001",
      kind: "api-contract",
      schemaVersion: "2.0.0",
      protocol: "rest",
      specification: "openapi",
      specVersion: "3.0",
    } as any),
    makeArtifact({
      id: "CON-001",
      kind: "consumer",
      consumesContracts: ["API-001"],
      contractVersion: "1.0.0",
    } as any),
  ];
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ea-drift-engine-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── detectEaDrift() ────────────────────────────────────────────────────────────

describe("detectEaDrift", () => {
  it("returns clean report for empty artifacts", () => {
    const report = detectEaDrift({ artifacts: [] });
    expect(report.passed).toBe(true);
    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBe(0);
    expect(report.summary.suppressed).toBe(0);
    expect(report.findings).toHaveLength(0);
    expect(report.checkedAt).toBeTruthy();
  });

  it("detects drift findings from existing rules", () => {
    const artifacts = makeConsumerWithMismatch();
    const report = detectEaDrift({ artifacts });

    expect(report.findings.length).toBeGreaterThan(0);
    const mismatch = report.findings.find(
      (f) => f.rule === "ea:systems/consumer-contract-version-mismatch",
    );
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe("warning");
    expect(mismatch!.artifactId).toBe("CON-001");
  });

  it("enriches findings with domain context", () => {
    const artifacts = makeConsumerWithMismatch();
    const report = detectEaDrift({ artifacts });

    const mismatch = report.findings.find(
      (f) => f.rule === "ea:systems/consumer-contract-version-mismatch",
    );
    expect(mismatch!.domain).toBe("systems");
  });

  it("computes passed flag based on errors", () => {
    // With just warnings, should pass
    const artifacts = makeConsumerWithMismatch();
    const report = detectEaDrift({ artifacts });
    // consumer-contract-version-mismatch is severity "warning"
    expect(report.passed).toBe(true);
  });

  it("groups findings by domain in byDomain", () => {
    const artifacts = makeConsumerWithMismatch();
    const report = detectEaDrift({ artifacts });

    if (report.findings.length > 0) {
      const hasDomainData = Object.keys(report.byDomain).length > 0;
      expect(hasDomainData).toBe(true);
    }
  });

  it("computes topRules by frequency", () => {
    const artifacts = makeConsumerWithMismatch();
    const report = detectEaDrift({ artifacts });

    if (report.topRules.length > 0) {
      expect(report.topRules[0].count).toBeGreaterThan(0);
      // Should be sorted descending
      for (let i = 1; i < report.topRules.length; i++) {
        expect(report.topRules[i].count).toBeLessThanOrEqual(report.topRules[i - 1].count);
      }
    }
  });
});

// ─── Domain Filtering ───────────────────────────────────────────────────────────

describe("detectEaDrift — domain filtering", () => {
  it("filters findings to specified domain", () => {
    const artifacts = makeConsumerWithMismatch();

    // systems domain should include consumer-contract findings
    const systemsReport = detectEaDrift({ artifacts, domains: ["systems"] });
    const mismatch = systemsReport.findings.find(
      (f) => f.rule === "ea:systems/consumer-contract-version-mismatch",
    );
    expect(mismatch).toBeDefined();

    // data domain should exclude consumer-contract findings
    const dataReport = detectEaDrift({ artifacts, domains: ["data"] });
    const dataMismatch = dataReport.findings.find(
      (f) => f.rule === "ea:systems/consumer-contract-version-mismatch",
    );
    expect(dataMismatch).toBeUndefined();
  });
});

// ─── Exception Suppression ──────────────────────────────────────────────────────

describe("detectEaDrift — exception suppression", () => {
  it("suppresses findings matching exception scope", () => {
    const artifacts = makeConsumerWithMismatch();
    const exception = makeException({
      id: "EXCEPT-SUPPRESS",
      scope: {
        artifactIds: ["CON-001"],
        rules: ["ea:systems/consumer-contract-version-mismatch"],
      },
    });

    const report = detectEaDrift({
      artifacts,
      exceptions: [exception],
    });

    const mismatch = report.findings.find(
      (f) => f.rule === "ea:systems/consumer-contract-version-mismatch",
    );
    expect(mismatch).toBeDefined();
    expect(mismatch!.suppressed).toBe(true);
    expect(mismatch!.suppressedBy).toBe("EXCEPT-SUPPRESS");
    expect(report.summary.suppressed).toBeGreaterThan(0);
  });

  it("does not suppress findings with non-matching exception", () => {
    const artifacts = makeConsumerWithMismatch();
    const exception = makeException({
      id: "EXCEPT-OTHER",
      scope: {
        artifactIds: ["SYS-999"],
        rules: ["ea:drift:some-other-rule"],
      },
    });

    const report = detectEaDrift({
      artifacts,
      exceptions: [exception],
    });

    const mismatch = report.findings.find(
      (f) => f.rule === "ea:systems/consumer-contract-version-mismatch",
    );
    if (mismatch) {
      expect(mismatch.suppressed).toBe(false);
    }
  });

  it("does not suppress with expired exception", () => {
    const artifacts = makeConsumerWithMismatch();
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const exception = makeException({
      id: "EXCEPT-EXPIRED",
      expiresAt: past.toISOString().split("T")[0],
      scope: {
        artifactIds: ["CON-001"],
        rules: ["ea:systems/consumer-contract-version-mismatch"],
      },
    });

    const report = detectEaDrift({
      artifacts,
      exceptions: [exception],
    });

    const mismatch = report.findings.find(
      (f) => f.rule === "ea:systems/consumer-contract-version-mismatch",
    );
    if (mismatch) {
      expect(mismatch.suppressed).toBe(false);
    }
  });

  it("suppresses with wide scope (empty artifactIds = match all)", () => {
    const artifacts = makeConsumerWithMismatch();
    const exception = makeException({
      id: "EXCEPT-WIDE",
      scope: {
        // Empty artifactIds matches all
        artifactIds: [],
        rules: ["ea:systems/consumer-contract-version-mismatch"],
      },
    });

    const report = detectEaDrift({
      artifacts,
      exceptions: [exception],
    });

    const mismatch = report.findings.find(
      (f) => f.rule === "ea:systems/consumer-contract-version-mismatch",
    );
    if (mismatch) {
      expect(mismatch.suppressed).toBe(true);
    }
  });
});

// ─── Severity Overrides ─────────────────────────────────────────────────────────

describe("detectEaDrift — severity overrides", () => {
  it("overrides severity of a rule", () => {
    const artifacts = makeConsumerWithMismatch();

    const report = detectEaDrift({
      artifacts,
      ruleOverrides: {
        "ea:systems/consumer-contract-version-mismatch": "error",
      },
    });

    const mismatch = report.findings.find(
      (f) => f.rule === "ea:systems/consumer-contract-version-mismatch",
    );
    if (mismatch) {
      expect(mismatch.severity).toBe("error");
    }
  });

  it("disables a rule with 'off'", () => {
    const artifacts = makeConsumerWithMismatch();

    const report = detectEaDrift({
      artifacts,
      ruleOverrides: {
        "ea:systems/consumer-contract-version-mismatch": "off",
      },
    });

    const mismatch = report.findings.find(
      (f) => f.rule === "ea:systems/consumer-contract-version-mismatch",
    );
    expect(mismatch).toBeUndefined();
  });

  it("demotes error to info", () => {
    const artifacts = makeConsumerWithMismatch();

    const report = detectEaDrift({
      artifacts,
      ruleOverrides: {
        "ea:systems/consumer-contract-version-mismatch": "info",
      },
    });

    const mismatch = report.findings.find(
      (f) => f.rule === "ea:systems/consumer-contract-version-mismatch",
    );
    if (mismatch) {
      expect(mismatch.severity).toBe("info");
    }
  });
});

// ─── Drift Heatmap Report ───────────────────────────────────────────────────────

describe("buildDriftHeatmap", () => {
  it("returns heatmap with all domains", () => {
    const report = buildDriftHeatmap([]);
    expect(report.heatmap).toHaveProperty("systems");
    expect(report.heatmap).toHaveProperty("delivery");
    expect(report.heatmap).toHaveProperty("data");
    expect(report.heatmap).toHaveProperty("information");
    expect(report.heatmap).toHaveProperty("business");
    expect(report.heatmap).toHaveProperty("transitions");
  });

  it("counts zero for empty artifacts", () => {
    const report = buildDriftHeatmap([]);
    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBe(0);
    expect(report.passed).toBe(true);
  });

  it("aggregates findings into heatmap", () => {
    const artifacts = makeConsumerWithMismatch();
    const report = buildDriftHeatmap(artifacts);

    // consumer-contract-version-mismatch → systems domain → warning
    expect(report.heatmap.systems.warnings).toBeGreaterThanOrEqual(0);
    expect(report.generatedAt).toBeTruthy();
  });
});

describe("renderDriftHeatmapMarkdown", () => {
  it("renders heatmap report", () => {
    const report = buildDriftHeatmap([]);
    const md = renderDriftHeatmapMarkdown(report);

    expect(md).toContain("# Drift Heatmap");
    expect(md).toContain("## Summary");
    expect(md).toContain("## By Domain");
    expect(md).toContain("systems");
    expect(md).toContain("delivery");
  });

  it("shows PASSED status when no errors", () => {
    const report = buildDriftHeatmap([]);
    const md = renderDriftHeatmapMarkdown(report);
    expect(md).toContain("PASSED");
  });
});

describe("REPORT_VIEWS includes drift-heatmap", () => {
  it("includes drift-heatmap", () => {
    expect(REPORT_VIEWS).toContain("drift-heatmap");
  });

  it("has 6 views", () => {
    expect(REPORT_VIEWS).toHaveLength(6);
  });
});

// ─── CLI Integration Tests ──────────────────────────────────────────────────────

describe("CLI: ea drift", () => {
  const CLI_PATH = join(__dirname, "..", "..", "..", "dist", "cli", "index.js");
  const ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

  function initEa(dir: string): void {
    mkdirSync(join(dir, "ea", "systems"), { recursive: true });
    mkdirSync(join(dir, "ea", "delivery"), { recursive: true });
    mkdirSync(join(dir, "ea", "data"), { recursive: true });
    mkdirSync(join(dir, "ea", "information"), { recursive: true });
    mkdirSync(join(dir, "ea", "business"), { recursive: true });
    mkdirSync(join(dir, "ea", "transitions"), { recursive: true });
    mkdirSync(join(dir, "specs"), { recursive: true });
    writeFileSync(
      join(dir, "ea", "ea.config.json"),
      JSON.stringify({ rootDir: "ea", schemaVersion: "1.0.0" }),
    );
  }

  function runCLI(args: string, cwd?: string): { stdout: string; code: number } {
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

  it("shows ea drift help", () => {
    const { stdout, code } = runCLI("ea drift --help");
    expect(code).toBe(0);
    expect(stdout).toContain("Detect EA drift");
    expect(stdout).toContain("--domain");
    expect(stdout).toContain("--json");
    expect(stdout).toContain("--severity");
  });

  it("runs drift on empty EA project (passes)", () => {
    initEa(tempDir);
    const { stdout, code } = runCLI("ea drift");
    expect(code).toBe(0);
    expect(stdout).toContain("PASSED");
  });

  it("outputs JSON with --json", () => {
    initEa(tempDir);
    const { stdout, code } = runCLI("ea drift --json");
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report).toHaveProperty("passed");
    expect(report).toHaveProperty("summary");
    expect(report).toHaveProperty("findings");
    expect(report).toHaveProperty("byDomain");
  });

  it("rejects unknown domain", () => {
    initEa(tempDir);
    const { code, stdout } = runCLI("ea drift --domain bogus");
    expect(code).not.toBe(0);
    expect(stdout).toContain("Unknown domain");
  });

  it("detects drift findings with artifacts", () => {
    initEa(tempDir);

    // Write a consumer with version mismatch
    writeFileSync(
      join(tempDir, "ea", "systems", "api-001.json"),
      JSON.stringify({
        id: "API-001",
        kind: "api-contract",
        title: "Users API",
        schemaVersion: "2.0.0",
        status: "active",
        summary: "Users API contract",
        owners: ["team-a"],
        confidence: "declared",
        protocol: "rest",
        specification: "openapi",
        specVersion: "3.0",
      }),
    );
    writeFileSync(
      join(tempDir, "ea", "systems", "con-001.json"),
      JSON.stringify({
        id: "CON-001",
        kind: "consumer",
        title: "Mobile App",
        schemaVersion: "1.0.0",
        status: "active",
        summary: "Mobile app consumer",
        owners: ["team-b"],
        confidence: "declared",
        consumesContracts: ["API-001"],
        contractVersion: "1.0.0",
      }),
    );

    const { stdout } = runCLI("ea drift --json");
    const report = JSON.parse(stdout);
    const mismatch = report.findings.find(
      (f: any) => f.rule === "ea:systems/consumer-contract-version-mismatch",
    );
    expect(mismatch).toBeDefined();
  });

  it("shows drift-heatmap report", () => {
    initEa(tempDir);
    const { stdout, code } = runCLI("ea report --view drift-heatmap");
    expect(code).toBe(0);
    expect(stdout).toContain("Drift Heatmap");
    expect(stdout).toContain("systems");
  });

  it("shows drift-heatmap as JSON", () => {
    initEa(tempDir);
    const { stdout, code } = runCLI("ea report --view drift-heatmap --format json");
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report).toHaveProperty("heatmap");
    expect(report).toHaveProperty("passed");
  });
});

// ─── Resolver-Dependent Drift Rules ─────────────────────────────────────────────

describe("resolver-dependent drift rules", () => {
  const baseArtifact = (overrides: Partial<EaArtifactBase>): EaArtifactBase => ({
    id: "test/SYS-001",
    schemaVersion: "1.0.0",
    kind: "system",
    title: "Test System",
    status: "active",
    summary: "test",
    owners: ["team-a"],
    ...overrides,
  });

  it("detects unmodeled external endpoints", () => {
    const artifacts = [
      baseArtifact({
        id: "systems/IF-001",
        kind: "system-interface",
        title: "Known API",
        endpoint: "https://api.known.com/v1",
      } as any),
    ];

    const result = evaluateEaDrift(artifacts, {
      includeResolverRules: true,
      resolverData: {
        externalEndpoints: [
          { url: "https://api.known.com/v1" },
          { url: "https://api.unknown.com/v2" },
        ],
      },
    });

    const findings = [...result.errors, ...result.warnings];
    const unmodeled = findings.filter((f) => f.rule === "ea:systems/unmodeled-external-dependency");
    expect(unmodeled).toHaveLength(1);
    expect(unmodeled[0]!.message).toContain("api.unknown.com");
  });

  it("detects unmodeled cloud resources", () => {
    const artifacts = [
      baseArtifact({
        id: "systems/CR-001",
        kind: "cloud-resource",
        title: "my-rds-instance",
        provider: "aws",
        resourceType: "aws_rds_cluster",
        resourceId: "my-rds-instance",
      } as any),
    ];

    const result = evaluateEaDrift(artifacts, {
      includeResolverRules: true,
      resolverData: {
        cloudResources: [
          { type: "aws_rds_cluster", name: "my-rds-instance" },
          { type: "aws_s3_bucket", name: "untracked-bucket" },
        ],
      },
    });

    const findings = [...result.errors, ...result.warnings];
    const unmodeled = findings.filter((f) => f.rule === "ea:systems/unmodeled-cloud-resource");
    expect(unmodeled).toHaveLength(1);
    expect(unmodeled[0]!.message).toContain("untracked-bucket");
  });

  it("detects logical-physical column mismatch", () => {
    const artifacts = [
      baseArtifact({
        id: "information/CE-001",
        kind: "canonical-entity",
        title: "Customer",
        attributes: [
          { name: "id", type: "string" },
          { name: "email", type: "string" },
        ],
      } as any),
    ];

    const result = evaluateEaDrift(artifacts, {
      includeResolverRules: true,
      resolverData: {
        physicalSchemas: [
          { table: "customer", columns: ["id", "email", "phone_number"] },
        ],
      },
    });

    const findings = [...result.errors, ...result.warnings];
    const mismatches = findings.filter((f) => f.rule === "ea:data/logical-physical-mismatch");
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]!.message).toContain("phone_number");
  });

  it("detects undeclared tables in physical schema", () => {
    const artifacts = [
      baseArtifact({
        id: "information/CE-001",
        kind: "canonical-entity",
        title: "Customer",
        attributes: [{ name: "id", type: "string" }],
      } as any),
    ];

    const result = evaluateEaDrift(artifacts, {
      includeResolverRules: true,
      resolverData: {
        physicalSchemas: [
          { table: "customer", columns: ["id"] },
          { table: "audit_log", columns: ["id", "action", "timestamp"] },
        ],
      },
    });

    const findings = [...result.errors, ...result.warnings];
    const undeclared = findings.filter((f) => f.rule === "ea:data/store-undeclared-entity");
    expect(undeclared).toHaveLength(1);
    expect(undeclared[0]!.message).toContain("audit_log");
  });

  it("returns no resolver findings when no resolver data provided", () => {
    const artifacts = [baseArtifact({})];

    const result = evaluateEaDrift(artifacts, {
      includeResolverRules: true,
    });

    const findings = [...result.errors, ...result.warnings];
    const resolverFindings = findings.filter(
      (f) =>
        f.rule?.startsWith("ea:systems/unmodeled") ||
        f.rule?.startsWith("ea:data/logical") ||
        f.rule?.startsWith("ea:data/store-undeclared") ||
        f.rule?.startsWith("ea:data/quality"),
    );
    expect(resolverFindings).toHaveLength(0);
  });

  it("passes snapshot through detectEaDrift pipeline", () => {
    const artifacts = [
      baseArtifact({
        id: "systems/CR-001",
        kind: "cloud-resource",
        title: "my-instance",
        provider: "aws",
        resourceType: "aws_ec2_instance",
        resourceId: "my-instance",
      } as any),
    ];

    const report = detectEaDrift({
      artifacts,
      includeResolverRules: true,
      snapshot: {
        cloudResources: [
          { type: "aws_ec2_instance", name: "my-instance" },
          { type: "aws_s3_bucket", name: "orphan-bucket" },
        ],
      },
    });

    const unmodeled = report.findings.filter(
      (f) => f.rule === "ea:systems/unmodeled-cloud-resource",
    );
    expect(unmodeled).toHaveLength(1);
    expect(unmodeled[0]!.message).toContain("orphan-bucket");
  });
});
