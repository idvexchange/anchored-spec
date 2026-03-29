/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for v1.0 config types, migration, and resolution.
 *
 * Covers:
 *   - resolveConfigV1 defaults and partial merging
 *   - migrateConfigV0ToV1 conversion
 *   - detectConfigVersion detection
 *   - v1ConfigToEaConfig bridge
 */

import { describe, it, expect } from "vitest";
import {
  resolveConfigV1,
  migrateConfigV0ToV1,
  detectConfigVersion,
  v1ConfigToEaConfig,
} from "../config.js";
import type { AnchoredSpecConfigV1, LegacyConfigInput } from "../config.js";

// ─── resolveConfigV1 ────────────────────────────────────────────────────────────

describe("resolveConfigV1", () => {
  it("returns defaults when no partial is provided", () => {
    const config = resolveConfigV1();
    expect(config.schemaVersion).toBe("1.0");
    expect(config.rootDir).toBe("ea");
    expect(config.generatedDir).toBe("ea/generated");
    expect(config.idPrefix).toBeNull();
    expect(config.resolvers).toEqual([]);
    expect(config.generators).toEqual([]);
    expect(config.evidenceSources).toEqual([]);
    expect(config.workflowPolicyPath).toBe("ea/workflow-policy.yaml");
  });

  it("returns defaults when null is provided", () => {
    const config = resolveConfigV1(null);
    expect(config.schemaVersion).toBe("1.0");
    expect(config.rootDir).toBe("ea");
  });

  it("builds domain paths from rootDir", () => {
    const config = resolveConfigV1();
    expect(config.domains.systems).toBe("ea/systems");
    expect(config.domains.delivery).toBe("ea/delivery");
    expect(config.domains.data).toBe("ea/data");
  });

  it("uses custom rootDir for domain paths", () => {
    const config = resolveConfigV1({ rootDir: "arch" });
    expect(config.rootDir).toBe("arch");
    expect(config.domains.systems).toBe("arch/systems");
    expect(config.generatedDir).toBe("arch/generated");
    expect(config.workflowPolicyPath).toBe("arch/workflow-policy.yaml");
  });

  it("preserves sourceRoots and sourceGlobs", () => {
    const config = resolveConfigV1({
      sourceRoots: ["src", "lib"],
      sourceGlobs: ["**/*.ts"],
    });
    expect(config.sourceRoots).toEqual(["src", "lib"]);
    expect(config.sourceGlobs).toEqual(["**/*.ts"]);
  });

  it("shallow-merges quality config", () => {
    const config = resolveConfigV1({
      quality: { strictMode: true } as AnchoredSpecConfigV1["quality"],
    });
    expect(config.quality.strictMode).toBe(true);
    expect(config.quality.requireOwners).toBe(true);
  });

  it("shallow-merges cache config", () => {
    const config = resolveConfigV1({
      cache: { defaultTTL: 7200 } as AnchoredSpecConfigV1["cache"],
    });
    expect(config.cache.defaultTTL).toBe(7200);
    expect(config.cache.dir).toBe(".anchored-spec/cache");
  });

  it("preserves hooks and testMetadata", () => {
    const config = resolveConfigV1({
      hooks: [{ event: "post-create", run: "echo ok" }],
      testMetadata: { testGlobs: ["**/*.test.ts"] },
    });
    expect(config.hooks).toHaveLength(1);
    expect(config.testMetadata?.testGlobs).toEqual(["**/*.test.ts"]);
  });
});

// ─── migrateConfigV0ToV1 ────────────────────────────────────────────────────────

describe("migrateConfigV0ToV1", () => {
  it("converts minimal v0.x config to v1.0", () => {
    const legacy: LegacyConfigInput = {
      specRoot: "specs",
      requirementsDir: "specs/requirements",
    };
    const v1 = migrateConfigV0ToV1(legacy);
    expect(v1.schemaVersion).toBe("1.0");
    expect(v1.rootDir).toBe("ea");
    expect(v1.domains.systems).toBe("ea/systems");
  });

  it("preserves EA config when present in v0.x", () => {
    const legacy: LegacyConfigInput = {
      specRoot: "specs",
      ea: {
        enabled: true,
        rootDir: "architecture",
        generatedDir: "architecture/generated",
        domains: { systems: "architecture/systems" } as any,
        idPrefix: "acme",
        resolvers: [{ path: "./my-resolver.js" }],
      },
    };
    const v1 = migrateConfigV0ToV1(legacy);
    expect(v1.rootDir).toBe("architecture");
    expect(v1.idPrefix).toBe("acme");
    expect(v1.resolvers).toEqual([{ path: "./my-resolver.js" }]);
    expect(v1.domains.systems).toBe("architecture/systems");
    // Non-overridden domains get default paths from rootDir
    expect(v1.domains.delivery).toBe("architecture/delivery");
  });

  it("hoists sourceRoots and testMetadata from core config", () => {
    const legacy: LegacyConfigInput = {
      specRoot: "specs",
      sourceRoots: ["src", "lib"],
      testMetadata: {
        testGlobs: ["**/*.test.ts"],
        requirementPattern: "\\bREQ-\\d+\\b",
      },
    };
    const v1 = migrateConfigV0ToV1(legacy);
    expect(v1.sourceRoots).toEqual(["src", "lib"]);
    expect(v1.testMetadata?.testGlobs).toEqual(["**/*.test.ts"]);
  });

  it("hoists hooks and plugins", () => {
    const legacy: LegacyConfigInput = {
      specRoot: "specs",
      hooks: [{ event: "post-create", run: "echo done" }],
      plugins: ["my-plugin"],
      driftResolvers: ["anchored-spec/resolvers/typescript-ast"],
    };
    const v1 = migrateConfigV0ToV1(legacy);
    expect(v1.hooks).toHaveLength(1);
    expect(v1.plugins).toEqual(["my-plugin"]);
    expect(v1.driftResolvers).toEqual(["anchored-spec/resolvers/typescript-ast"]);
  });

  it("uses legacy workflowPolicyPath", () => {
    const legacy: LegacyConfigInput = {
      specRoot: "specs",
      workflowPolicyPath: "specs/workflow-policy.json",
    };
    const v1 = migrateConfigV0ToV1(legacy);
    expect(v1.workflowPolicyPath).toBe("specs/workflow-policy.json");
  });

  it("drops specRoot, requirementsDir, changesDir, decisionsDir", () => {
    const legacy: LegacyConfigInput = {
      specRoot: "specs",
      requirementsDir: "specs/requirements",
      changesDir: "specs/changes",
      decisionsDir: "specs/decisions",
    };
    const v1 = migrateConfigV0ToV1(legacy);
    expect((v1 as any).specRoot).toBeUndefined();
    expect((v1 as any).requirementsDir).toBeUndefined();
    expect((v1 as any).changesDir).toBeUndefined();
    expect((v1 as any).decisionsDir).toBeUndefined();
  });
});

// ─── detectConfigVersion ────────────────────────────────────────────────────────

describe("detectConfigVersion", () => {
  it("detects v1.0 config", () => {
    expect(detectConfigVersion({ schemaVersion: "1.0", rootDir: "ea" })).toBe("1.0");
  });

  it("detects v0.x config (no schemaVersion)", () => {
    expect(detectConfigVersion({ specRoot: "specs" })).toBe("0.x");
  });

  it("detects v0.x config (wrong schemaVersion)", () => {
    expect(detectConfigVersion({ schemaVersion: "0.2.0", specRoot: "specs" })).toBe("0.x");
  });
});

// ─── v1ConfigToEaConfig ─────────────────────────────────────────────────────────

describe("v1ConfigToEaConfig", () => {
  it("converts v1 config to EaConfig with enabled=true", () => {
    const v1 = resolveConfigV1();
    const ea = v1ConfigToEaConfig(v1);
    expect(ea.enabled).toBe(true);
    expect(ea.rootDir).toBe("ea");
    expect(ea.domains.systems).toBe("ea/systems");
    expect(ea.resolvers).toEqual([]);
  });

  it("preserves all EA-specific fields", () => {
    const v1 = resolveConfigV1({
      idPrefix: "acme",
      resolvers: [{ path: "./r.js" }],
      generators: [{ path: "./g.js", outputDir: "out" }],
      cache: { dir: "/tmp/cache", defaultTTL: 999 },
    });
    const ea = v1ConfigToEaConfig(v1);
    expect(ea.idPrefix).toBe("acme");
    expect(ea.resolvers).toEqual([{ path: "./r.js" }]);
    expect(ea.generators).toEqual([{ path: "./g.js", outputDir: "out" }]);
    expect(ea.cache.defaultTTL).toBe(999);
  });
});
