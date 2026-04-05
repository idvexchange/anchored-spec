import { describe, expect, it } from "vitest";

import { resolveConfigV1 } from "../config.js";
import type { AnchoredSpecConfigV1_2 } from "../config.js";

describe("resolveConfigV1", () => {
  it("returns v1.0 defaults", () => {
    const config = resolveConfigV1();

    expect(config.schemaVersion).toBe("1.0");
    expect(config.rootDir).toBe("docs");
    expect(config.generatedDir).toBe("docs/generated");
    expect(config.workflowPolicyPath).toBe("docs/workflow-policy.yaml");
    expect(config.entityMode).toBe("manifest");
    expect(config.manifestPath).toBe("catalog-info.yaml");
    expect(config.inlineDocDirs).toBeUndefined();
  });

  it("builds v1.0 domain paths from a custom root", () => {
    const config = resolveConfigV1({ rootDir: "architecture" });

    expect(config.schemaVersion).toBe("1.0");
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

  it("returns v1.1 defaults with architecture-view docs metadata", () => {
    const config = resolveConfigV1({ schemaVersion: "1.1" });

    expect(config.schemaVersion).toBe("1.1");
    expect(config.rootDir).toBe("docs");
    expect(config.generatedDir).toBe("docs/generated");
    expect(config.domains).toEqual([
      "systems",
      "delivery",
      "data",
      "information",
      "business",
      "transitions",
    ]);
    expect(config.docs.structure).toBe("architecture-views");
    expect(config.docs.scanDirs).toEqual(["docs"]);
    expect(config.docs.rootDocs).toContain("docs/README.md");
    expect(config.docs.sections.find((section) => section.id === "component")?.path).toBe("docs/04-component");
    expect(config.docs.templates.architecture).toBe("component");
  });

  it("merges v1.1 docs overrides without losing defaults", () => {
    const config = resolveConfigV1({
      schemaVersion: "1.1",
      rootDir: "architecture",
      domains: ["business", "systems"],
      docs: {
        structure: "custom",
        scanDirs: ["architecture", "handbook"],
        sections: [
          {
            id: "guides",
            title: "Guides",
            path: "architecture/guides",
            kind: "guide",
          },
        ],
        templates: {
          guide: "guides",
        },
      },
    });

    expect(config.schemaVersion).toBe("1.1");
    expect(config.generatedDir).toBe("architecture/generated");
    expect(config.domains).toEqual(["business", "systems"]);
    expect(config.docs.structure).toBe("custom");
    expect(config.docs.scanDirs).toEqual(["architecture", "handbook"]);
    expect(config.docs.sections).toEqual([
      {
        id: "guides",
        title: "Guides",
        path: "architecture/guides",
        kind: "guide",
      },
    ]);
    expect(config.docs.templates.guide).toBe("guides");
    expect(config.workflowPolicyPath).toBe("architecture/workflow-policy.yaml");
  });

  it("returns v1.2 defaults with catalog bootstrap configuration", () => {
    const config = resolveConfigV1({ schemaVersion: "1.2" });

    expect(config.schemaVersion).toBe("1.2");
    expect(config.domains).toEqual([
      "systems",
      "delivery",
      "data",
      "information",
      "business",
      "transitions",
    ]);
    expect(config.docs.structure).toBe("architecture-views");
    expect(config.catalog.bootstrap?.profile).toBe("auto");
    expect(config.catalog.bootstrap?.outputMode).toBe("curated");
    expect(config.catalog.bootstrap?.defaults?.ownerUnitType).toBe("team");
  });

  it("infers v1.2 when catalog config is present and merges bootstrap overrides", () => {
    const config = resolveConfigV1({
      rootDir: "architecture",
      catalog: {
        bootstrap: {
          minConfidence: 0.8,
          include: {
            decisions: false,
          },
          naming: {
            stripSuffixes: ["-service"],
          },
        },
      },
    } as Partial<AnchoredSpecConfigV1_2>);

    expect(config.schemaVersion).toBe("1.2");
    expect(config.generatedDir).toBe("architecture/generated");
    expect(config.catalog.bootstrap?.minConfidence).toBe(0.8);
    expect(config.catalog.bootstrap?.include?.decisions).toBe(false);
    expect(config.catalog.bootstrap?.include?.components).toBe(true);
    expect(config.catalog.bootstrap?.naming?.stripSuffixes).toEqual(["-service"]);
  });
});
