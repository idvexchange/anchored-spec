/**
 * Tests for EA Loader (EaRoot) and Quality Rules (validateEaArtifacts).
 *
 * Covers:
 *   - JSON loading from temp fixtures
 *   - YAML loading + normalization
 *   - Parse error handling
 *   - Empty / non-existent directories
 *   - All 5 quality rules (positive + negative)
 *   - EaSummary generation
 *   - Integration with examples/ea/ fixtures
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EaRoot, normalizeArtifact } from "../loader.js";
import { validateEaArtifacts } from "../validate.js";
import type { EaArtifactBase } from "../types.js";

/** Minimal v0.x config shape for test backward-compat. */
type LegacyConfig = { specRoot?: string; ea?: { enabled: boolean; rootDir: string } } & Record<string, unknown>;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createTempDir(): string {
  const dir = join(
    tmpdir(),
    `anchored-spec-ea-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function validArtifact(
  overrides: Partial<EaArtifactBase> = {}
): Record<string, unknown> {
  return {
    id: "APP-test-service",
    schemaVersion: "1.0.0",
    kind: "application",
    title: "Test Service",
    status: "active",
    summary: "A test application artifact for validation purposes.",
    owners: ["test-team"],
    confidence: "declared",
    ...overrides,
  };
}

function yamlArtifact(
  id: string,
  kind: string,
  extras: Record<string, unknown> = {}
): string {
  const base = `apiVersion: anchored-spec/ea/v1
kind: ${kind}
id: ${id}

metadata:
  name: Test ${kind}
  summary: >
    A test ${kind} artifact for loader validation.
    This is long enough to pass the summary length check.
  owners:
    - test-team
  tags:
    - test
  confidence: declared
  status: active
  schemaVersion: "1.0.0"
`;

  const relationsBlock = extras.relations
    ? `\nrelations:\n  - type: dependsOn\n    target: APP-other\n`
    : "";

  return base + relationsBlock;
}

function minimalConfig(eaRootDir = "ea"): LegacyConfig {
  return {
    specDir: "specs",
    outputDir: "output",
    ea: {
      enabled: true,
      rootDir: eaRootDir,
    },
  } as LegacyConfig;
}

// ─── EaRoot Tests ───────────────────────────────────────────────────────────────

describe("EaRoot", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  describe("isInitialized", () => {
    it("returns false when root dir does not exist", () => {
      const root = new EaRoot(tempDir, minimalConfig());
      expect(root.isInitialized()).toBe(false);
    });

    it("returns false when root dir exists but no domain dirs", () => {
      mkdirSync(join(tempDir, "ea"), { recursive: true });
      const root = new EaRoot(tempDir, minimalConfig());
      expect(root.isInitialized()).toBe(false);
    });

    it("returns true when root dir and at least one domain dir exist", () => {
      mkdirSync(join(tempDir, "ea", "systems"), { recursive: true });
      const root = new EaRoot(tempDir, minimalConfig());
      expect(root.isInitialized()).toBe(true);
    });
  });

  describe("loadArtifacts — JSON files", () => {
    it("loads valid JSON artifacts", async () => {
      const systemsDir = join(tempDir, "ea", "systems");
      mkdirSync(systemsDir, { recursive: true });

      const artifact = validArtifact();
      writeFileSync(
        join(systemsDir, "APP-test-service.json"),
        JSON.stringify(artifact)
      );

      const root = new EaRoot(tempDir, minimalConfig());
      const result = await root.loadArtifacts();

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe("APP-test-service");
      expect(result.artifacts[0].kind).toBe("application");
      expect(result.errors).toHaveLength(0);
    });

    it("loads artifacts from multiple domains", async () => {
      const systemsDir = join(tempDir, "ea", "systems");
      const deliveryDir = join(tempDir, "ea", "delivery");
      mkdirSync(systemsDir, { recursive: true });
      mkdirSync(deliveryDir, { recursive: true });

      writeFileSync(
        join(systemsDir, "APP-svc.json"),
        JSON.stringify(validArtifact({ id: "APP-svc" }))
      );
      writeFileSync(
        join(deliveryDir, "ENV-prod.json"),
        JSON.stringify(
          validArtifact({
            id: "ENV-prod",
            kind: "environment",
            title: "Production",
            tier: "production",
            isProduction: true,
          } as unknown as Partial<EaArtifactBase>)
        )
      );

      const root = new EaRoot(tempDir, minimalConfig());
      const result = await root.loadArtifacts();

      expect(result.artifacts).toHaveLength(2);
      const kinds = result.artifacts.map((a) => a.kind).sort();
      expect(kinds).toEqual(["application", "environment"]);
    });

    it("loads artifacts from nested subdirectories", async () => {
      const nested = join(tempDir, "ea", "systems", "orders");
      mkdirSync(nested, { recursive: true });

      writeFileSync(
        join(nested, "APP-orders.json"),
        JSON.stringify(validArtifact({ id: "APP-orders" }))
      );

      const root = new EaRoot(tempDir, minimalConfig());
      const result = await root.loadArtifacts();

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe("APP-orders");
    });

    it("ignores non-json/yaml files", async () => {
      const systemsDir = join(tempDir, "ea", "systems");
      mkdirSync(systemsDir, { recursive: true });

      writeFileSync(join(systemsDir, "README.md"), "# Not an artifact");
      writeFileSync(join(systemsDir, ".gitkeep"), "");
      writeFileSync(
        join(systemsDir, "APP-real.json"),
        JSON.stringify(validArtifact({ id: "APP-real" }))
      );

      const root = new EaRoot(tempDir, minimalConfig());
      const result = await root.loadArtifacts();

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe("APP-real");
    });

    it("returns empty arrays for non-existent domain directories", async () => {
      mkdirSync(join(tempDir, "ea"), { recursive: true });
      const root = new EaRoot(tempDir, minimalConfig());
      const result = await root.loadArtifacts();

      expect(result.artifacts).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("reports parse errors with file path", async () => {
      const systemsDir = join(tempDir, "ea", "systems");
      mkdirSync(systemsDir, { recursive: true });

      writeFileSync(join(systemsDir, "bad.json"), "{ not valid json }");

      const root = new EaRoot(tempDir, minimalConfig());
      const result = await root.loadArtifacts();

      expect(result.artifacts).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rule).toBe("ea:loader:parse-error");
      expect(result.errors[0].message).toContain("ea/systems/bad.json");
    });
  });

  describe("loadArtifacts — YAML files", () => {
    it("loads and normalizes YAML artifacts", async () => {
      const systemsDir = join(tempDir, "ea", "systems");
      mkdirSync(systemsDir, { recursive: true });

      writeFileSync(
        join(systemsDir, "APP-my-service.yaml"),
        yamlArtifact("APP-my-service", "application")
      );

      const root = new EaRoot(tempDir, minimalConfig());
      const result = await root.loadArtifacts();

      expect(result.artifacts).toHaveLength(1);
      const a = result.artifacts[0];
      expect(a.id).toBe("APP-my-service");
      expect(a.kind).toBe("application");
      expect(a.title).toBe("Test application");
      expect(a.owners).toEqual(["test-team"]);
      expect(a.confidence).toBe("declared");
      expect(a.status).toBe("active");
    });

    it("loads .yml extension", async () => {
      const systemsDir = join(tempDir, "ea", "systems");
      mkdirSync(systemsDir, { recursive: true });

      writeFileSync(
        join(systemsDir, "SVC-api.yml"),
        yamlArtifact("SVC-api", "service")
      );

      const root = new EaRoot(tempDir, minimalConfig());
      const result = await root.loadArtifacts();

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].kind).toBe("service");
    });

    it("reports YAML parse errors with file path", async () => {
      const systemsDir = join(tempDir, "ea", "systems");
      mkdirSync(systemsDir, { recursive: true });

      writeFileSync(join(systemsDir, "bad.yaml"), ":\n  - invalid: [\nyaml");

      const root = new EaRoot(tempDir, minimalConfig());
      const result = await root.loadArtifacts();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("ea/systems/bad.yaml");
    });

    it("mixes JSON and YAML artifacts in same domain", async () => {
      const systemsDir = join(tempDir, "ea", "systems");
      mkdirSync(systemsDir, { recursive: true });

      writeFileSync(
        join(systemsDir, "APP-json.json"),
        JSON.stringify(validArtifact({ id: "APP-json" }))
      );
      writeFileSync(
        join(systemsDir, "SVC-yaml.yaml"),
        yamlArtifact("SVC-yaml", "service")
      );

      const root = new EaRoot(tempDir, minimalConfig());
      const result = await root.loadArtifacts();

      expect(result.artifacts).toHaveLength(2);
      const ids = result.artifacts.map((a) => a.id).sort();
      expect(ids).toEqual(["APP-json", "SVC-yaml"]);
    });
  });

  describe("loadDomain", () => {
    it("loads only the specified domain", async () => {
      const systemsDir = join(tempDir, "ea", "systems");
      const deliveryDir = join(tempDir, "ea", "delivery");
      mkdirSync(systemsDir, { recursive: true });
      mkdirSync(deliveryDir, { recursive: true });

      writeFileSync(
        join(systemsDir, "APP-svc.json"),
        JSON.stringify(validArtifact({ id: "APP-svc" }))
      );
      writeFileSync(
        join(deliveryDir, "ENV-prod.json"),
        JSON.stringify(
          validArtifact({
            id: "ENV-prod",
            kind: "environment",
            tier: "production",
            isProduction: true,
          } as unknown as Partial<EaArtifactBase>)
        )
      );

      const root = new EaRoot(tempDir, minimalConfig());
      const result = await root.loadDomain("systems");

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe("APP-svc");
    });
  });

  describe("getSummary", () => {
    it("returns zero summary when no artifacts loaded", async () => {
      mkdirSync(join(tempDir, "ea"), { recursive: true });
      const root = new EaRoot(tempDir, minimalConfig());
      await root.loadArtifacts();
      const summary = root.getSummary();

      expect(summary.totalArtifacts).toBe(0);
      expect(summary.errorCount).toBe(0);
      expect(summary.relationCount).toBe(0);
    });

    it("computes correct summary after loading", async () => {
      const systemsDir = join(tempDir, "ea", "systems");
      mkdirSync(systemsDir, { recursive: true });

      const app = validArtifact({
        id: "APP-a",
        relations: [{ type: "dependsOn", target: "SVC-b" }],
      } as unknown as Partial<EaArtifactBase>);
      const svc = validArtifact({ id: "SVC-b", kind: "service" });

      writeFileSync(join(systemsDir, "APP-a.json"), JSON.stringify(app));
      writeFileSync(join(systemsDir, "SVC-b.json"), JSON.stringify(svc));

      const root = new EaRoot(tempDir, minimalConfig());
      await root.loadArtifacts();
      const summary = root.getSummary();

      expect(summary.totalArtifacts).toBe(2);
      expect(summary.byKind).toEqual({ application: 1, service: 1 });
      expect(summary.byStatus).toEqual({ active: 2 });
      expect(summary.relationCount).toBe(1);
    });
  });
});

// ─── normalizeArtifact Tests ────────────────────────────────────────────────────

describe("normalizeArtifact", () => {
  it("passes through flat artifacts unchanged", () => {
    const flat = validArtifact();
    const result = normalizeArtifact(flat);
    expect(result.id).toBe(flat.id);
    expect(result.title).toBe(flat.title);
    expect(result.summary).toBe(flat.summary);
  });

  it("normalizes metadata envelope into flat shape", () => {
    const yaml = {
      apiVersion: "anchored-spec/ea/v1",
      kind: "application",
      id: "APP-test",
      metadata: {
        name: "Test App",
        summary: "A test application",
        owners: ["team-a"],
        tags: ["test"],
        confidence: "declared",
        status: "active",
        schemaVersion: "1.0.0",
      },
    };

    const result = normalizeArtifact(yaml);
    expect(result.title).toBe("Test App");
    expect(result.summary).toBe("A test application");
    expect(result.owners).toEqual(["team-a"]);
    expect(result.status).toBe("active");
    expect(result.schemaVersion).toBe("1.0.0");
  });

  it("hoists spec fields to root level", () => {
    const yaml = {
      kind: "environment",
      id: "ENV-prod",
      metadata: {
        name: "Production",
        summary: "Production environment",
        owners: ["team-ops"],
        confidence: "declared",
        status: "active",
        schemaVersion: "1.0.0",
      },
      spec: {
        tier: "production",
        isProduction: true,
      },
    };

    const result = normalizeArtifact(yaml);
    expect(result.tier).toBe("production");
    expect(result.isProduction).toBe(true);
  });

  it("normalizes structured anchors to flat string arrays", () => {
    const yaml = {
      kind: "application",
      id: "APP-test",
      metadata: {
        name: "Test",
        summary: "Test app",
        owners: ["team"],
        confidence: "declared",
        status: "active",
        schemaVersion: "1.0.0",
      },
      anchors: {
        interfaces: [
          { symbol: "OrderController", file: "src/order.ts" },
          { symbol: "PaymentService", file: "src/payment.ts" },
        ],
        apis: [
          { route: "POST /orders", file: "src/routes.ts" },
        ],
        configs: [
          { path: "k8s/deployment.yaml" },
        ],
      },
    };

    const result = normalizeArtifact(yaml);
    const anchors = result.anchors as Record<string, unknown>;
    expect(anchors.symbols).toEqual(["OrderController", "PaymentService"]);
    expect(anchors.apis).toEqual(["POST /orders"]);
    expect(anchors.infra).toEqual(["k8s/deployment.yaml"]);
  });

  it("normalizes relation metadata to flat fields", () => {
    const yaml = {
      kind: "application",
      id: "APP-test",
      metadata: {
        name: "Test",
        summary: "Test app",
        owners: ["team"],
        confidence: "declared",
        status: "active",
        schemaVersion: "1.0.0",
      },
      relations: [
        {
          type: "dependsOn",
          target: "SVC-other",
          metadata: {
            criticality: "high",
            description: "Critical dependency",
          },
        },
      ],
    };

    const result = normalizeArtifact(yaml);
    const relations = result.relations as Array<Record<string, unknown>>;
    expect(relations).toHaveLength(1);
    expect(relations[0].type).toBe("dependsOn");
    expect(relations[0].target).toBe("SVC-other");
    expect(relations[0].criticality).toBe("high");
    expect(relations[0].description).toBe("Critical dependency");
  });
});

// ─── Quality Rules Tests ────────────────────────────────────────────────────────

describe("validateEaArtifacts — quality rules", () => {
  describe("ea:quality:active-needs-owner", () => {
    it("passes when active artifact has owners", () => {
      const artifacts = [validArtifact() as EaArtifactBase];
      const result = validateEaArtifacts(artifacts);
      const ownerErrors = result.errors.filter(
        (e) => e.rule === "ea:quality:active-needs-owner"
      );
      expect(ownerErrors).toHaveLength(0);
    });

    it("errors when active artifact has empty owners", () => {
      const artifacts = [
        validArtifact({ owners: [] }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const ownerErrors = result.errors.filter(
        (e) => e.rule === "ea:quality:active-needs-owner"
      );
      expect(ownerErrors).toHaveLength(1);
      expect(ownerErrors[0].message).toContain("must have at least one owner");
    });

    it("skips check for draft artifacts", () => {
      const artifacts = [
        validArtifact({ owners: [], status: "draft" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const ownerErrors = result.errors.filter(
        (e) => e.rule === "ea:quality:active-needs-owner"
      );
      expect(ownerErrors).toHaveLength(0);
    });

    it("can be disabled via requireOwners=false", () => {
      const artifacts = [
        validArtifact({ owners: [] }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts, {
        quality: { requireOwners: false },
      });
      const ownerErrors = result.errors.filter(
        (e) => e.rule === "ea:quality:active-needs-owner"
      );
      expect(ownerErrors).toHaveLength(0);
    });
  });

  describe("ea:quality:active-needs-summary", () => {
    it("passes when active artifact has sufficient summary", () => {
      const artifacts = [validArtifact() as EaArtifactBase];
      const result = validateEaArtifacts(artifacts);
      const summaryWarnings = result.warnings.filter(
        (e) => e.rule === "ea:quality:active-needs-summary"
      );
      expect(summaryWarnings).toHaveLength(0);
    });

    it("warns when active artifact has short summary", () => {
      const artifacts = [
        validArtifact({ summary: "Too short" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const summaryWarnings = result.warnings.filter(
        (e) => e.rule === "ea:quality:active-needs-summary"
      );
      expect(summaryWarnings).toHaveLength(1);
    });

    it("warns when active artifact has empty summary", () => {
      const artifacts = [
        validArtifact({ summary: "" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const summaryWarnings = result.warnings.filter(
        (e) => e.rule === "ea:quality:active-needs-summary"
      );
      expect(summaryWarnings).toHaveLength(1);
    });

    it("promotes to error in strictMode", () => {
      const artifacts = [
        validArtifact({ summary: "Short" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts, {
        quality: { strictMode: true },
      });
      const summaryErrors = result.errors.filter(
        (e) => e.rule === "ea:quality:active-needs-summary"
      );
      expect(summaryErrors).toHaveLength(1);
    });
  });

  describe("ea:quality:duplicate-id", () => {
    it("passes when all IDs are unique", () => {
      const artifacts = [
        validArtifact({ id: "APP-a" }) as EaArtifactBase,
        validArtifact({ id: "APP-b" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const dupErrors = result.errors.filter(
        (e) => e.rule === "ea:quality:duplicate-id"
      );
      expect(dupErrors).toHaveLength(0);
    });

    it("errors when duplicate IDs found", () => {
      const artifacts = [
        validArtifact({ id: "APP-dupe" }) as EaArtifactBase,
        validArtifact({ id: "APP-dupe" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const dupErrors = result.errors.filter(
        (e) => e.rule === "ea:quality:duplicate-id"
      );
      expect(dupErrors).toHaveLength(1);
      expect(dupErrors[0].message).toContain('Duplicate artifact ID "APP-dupe"');
    });

    it("reports multiple duplicates", () => {
      const artifacts = [
        validArtifact({ id: "APP-a" }) as EaArtifactBase,
        validArtifact({ id: "APP-a" }) as EaArtifactBase,
        validArtifact({ id: "APP-a" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const dupErrors = result.errors.filter(
        (e) => e.rule === "ea:quality:duplicate-id"
      );
      expect(dupErrors).toHaveLength(2); // 2nd and 3rd are dupes
    });
  });

  describe("ea:quality:id-format", () => {
    it("passes for valid IDs", () => {
      const artifacts = [
        validArtifact({ id: "APP-test-service" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const idErrors = result.errors.filter(
        (e) => e.rule === "ea:quality:id-format"
      );
      expect(idErrors).toHaveLength(0);
    });

    it("passes for domain-qualified IDs", () => {
      const artifacts = [
        validArtifact({ id: "systems/APP-test-service" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const idErrors = result.errors.filter(
        (e) => e.rule === "ea:quality:id-format"
      );
      expect(idErrors).toHaveLength(0);
    });

    it("errors for invalid ID format", () => {
      const artifacts = [
        validArtifact({ id: "not a valid id!" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const idErrors = result.errors.filter(
        (e) => e.rule === "ea:quality:id-format"
      );
      expect(idErrors).toHaveLength(1);
    });

    it("errors when kind prefix does not match", () => {
      // SVC prefix but application kind
      const artifacts = [
        validArtifact({ id: "SVC-wrong-prefix", kind: "application" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const idErrors = result.errors.filter(
        (e) => e.rule === "ea:quality:id-format"
      );
      expect(idErrors).toHaveLength(1);
    });
  });

  describe("ea:quality:orphan-artifact", () => {
    it("warns when artifact has no relations and is not targeted", () => {
      const artifacts = [
        validArtifact({ id: "APP-lonely" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const orphans = result.warnings.filter(
        (e) => e.rule === "ea:quality:orphan-artifact"
      );
      expect(orphans).toHaveLength(1);
    });

    it("does not warn when artifact has outbound relations", () => {
      const artifacts = [
        validArtifact({
          id: "APP-connected",
          relations: [{ type: "dependsOn", target: "SVC-other" }],
        } as unknown as Partial<EaArtifactBase>) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const orphans = result.warnings.filter(
        (e) => e.rule === "ea:quality:orphan-artifact"
      );
      expect(orphans).toHaveLength(0);
    });

    it("does not warn when artifact is targeted by another", () => {
      const artifacts = [
        validArtifact({
          id: "APP-source",
          relations: [{ type: "dependsOn", target: "SVC-target" }],
        } as unknown as Partial<EaArtifactBase>) as EaArtifactBase,
        validArtifact({ id: "SVC-target", kind: "service" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      const orphans = result.warnings.filter(
        (e) => e.rule === "ea:quality:orphan-artifact"
      );
      expect(orphans).toHaveLength(0);
    });

    it("can be turned off via rule override", () => {
      const artifacts = [
        validArtifact({ id: "APP-lonely" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts, {
        quality: { rules: { "ea:quality:orphan-artifact": "off" } },
      });
      const orphans = result.warnings.filter(
        (e) => e.rule === "ea:quality:orphan-artifact"
      );
      expect(orphans).toHaveLength(0);
    });
  });

  describe("rule severity overrides", () => {
    it("per-rule override changes severity", () => {
      const artifacts = [
        validArtifact({ id: "APP-lonely" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts, {
        quality: {
          rules: { "ea:quality:orphan-artifact": "error" },
        },
      });
      const orphanErrors = result.errors.filter(
        (e) => e.rule === "ea:quality:orphan-artifact"
      );
      expect(orphanErrors).toHaveLength(1);
    });
  });

  describe("combined validation result", () => {
    it("valid is false when any errors exist", () => {
      const artifacts = [
        validArtifact({ id: "not valid!", owners: [] }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      expect(result.valid).toBe(false);
    });

    it("valid is true when only warnings exist", () => {
      const artifacts = [
        validArtifact({ id: "APP-orphan" }) as EaArtifactBase,
      ];
      const result = validateEaArtifacts(artifacts);
      // orphan is a warning, not an error
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

// ─── Integration: examples/ea/ ──────────────────────────────────────────────────

describe("Integration: load examples/ea/", () => {
  // The project's examples/ea/ directory contains realistic YAML fixtures
  // with both Phase A kinds and Phase 2 kinds.
  const projectRoot = join(__dirname, "..", "..", "..");

  function examplesConfig(): LegacyConfig {
    return {
      specDir: "specs",
      outputDir: "output",
      ea: { enabled: true, rootDir: "examples/ea" },
    } as LegacyConfig;
  }

  it("loads all example artifacts without parse errors", async () => {
    const root = new EaRoot(projectRoot, examplesConfig());
    const result = await root.loadArtifacts();

    // Should load artifacts from the examples
    expect(result.artifacts.length).toBeGreaterThan(0);

    // No parse errors (schema errors are fine — some examples use Phase 2 kinds)
    const parseErrors = result.errors.filter(
      (e) => e.rule === "ea:loader:parse-error"
    );
    expect(parseErrors).toHaveLength(0);
  });

  it("loads system-domain artifacts correctly", async () => {
    const root = new EaRoot(projectRoot, examplesConfig());
    const result = await root.loadDomain("systems");

    expect(result.artifacts.length).toBeGreaterThan(0);

    // Check a known artifact
    const app = result.artifacts.find((a) => a.id === "APP-order-service");
    expect(app).toBeDefined();
    expect(app!.kind).toBe("application");
    expect(app!.title).toBe("Order Service");
    expect(app!.owners).toContain("team-commerce");
  });

  it("normalizes YAML metadata envelope correctly", async () => {
    const root = new EaRoot(projectRoot, examplesConfig());
    const result = await root.loadDomain("systems");

    for (const a of result.artifacts) {
      // All should have flat fields after normalization
      expect(a.id).toBeDefined();
      expect(a.kind).toBeDefined();
      expect(a.title).toBeDefined();
      expect(a.owners).toBeDefined();
      expect(Array.isArray(a.owners)).toBe(true);
    }
  });

  it("computes a summary across all domains", async () => {
    const root = new EaRoot(projectRoot, examplesConfig());
    await root.loadArtifacts();
    const summary = root.getSummary();

    expect(summary.totalArtifacts).toBeGreaterThan(0);
    expect(Object.keys(summary.byKind).length).toBeGreaterThan(0);
    expect(summary.relationCount).toBeGreaterThan(0);
  });
});
