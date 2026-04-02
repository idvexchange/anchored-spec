import { describe, expect, it } from "vitest";

import { resolveConfigV1 } from "../config.js";

describe("resolveConfigV1", () => {
  it("returns v2 defaults", () => {
    const config = resolveConfigV1();

    expect(config.schemaVersion).toBe("1.0");
    expect(config.rootDir).toBe("docs");
    expect(config.generatedDir).toBe("docs/generated");
    expect(config.workflowPolicyPath).toBe("docs/workflow-policy.yaml");
    expect(config.entityMode).toBe("manifest");
    expect(config.manifestPath).toBe("catalog-info.yaml");
    expect(config.inlineDocDirs).toBeUndefined();
  });

  it("builds domain paths from a custom root", () => {
    const config = resolveConfigV1({ rootDir: "architecture" });

    expect(config.domains.systems).toBe("architecture/systems");
    expect(config.domains.transitions).toBe("architecture/transitions");
    expect(config.generatedDir).toBe("architecture/generated");
    expect(config.workflowPolicyPath).toBe("architecture/workflow-policy.yaml");
  });

  it("shallow merges nested config while preserving defaults", () => {
    const config = resolveConfigV1({
      quality: { strictMode: true },
      cache: { defaultTTL: 7200 },
      entityMode: "inline",
      inlineDocDirs: ["docs", "adr"],
    });

    expect(config.quality.strictMode).toBe(true);
    expect(config.quality.requireOwners).toBe(true);
    expect(config.cache.defaultTTL).toBe(7200);
    expect(config.cache.dir).toBe(".anchored-spec/cache");
    expect(config.entityMode).toBe("inline");
    expect(config.inlineDocDirs).toEqual(["docs", "adr"]);
    expect(config.manifestPath).toBe("catalog-info.yaml");
  });

  it("preserves optional top-level settings", () => {
    const config = resolveConfigV1({
      hooks: [{ event: "post-create", run: "echo ok" }],
      testMetadata: { testGlobs: ["**/*.test.ts"] },
      sourceRoots: ["src"],
      sourceGlobs: ["**/*.ts"],
    });

    expect(config.hooks).toEqual([{ event: "post-create", run: "echo ok" }]);
    expect(config.testMetadata).toEqual({ testGlobs: ["**/*.test.ts"] });
    expect(config.sourceRoots).toEqual(["src"]);
    expect(config.sourceGlobs).toEqual(["**/*.ts"]);
  });
});
