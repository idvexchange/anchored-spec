import { describe, it, expect } from "vitest";
import { resolveEaConfig } from "../config.js";
import type { EaConfig } from "../config.js";

describe("resolveEaConfig", () => {
  it("returns defaults when no partial is provided", () => {
    const config = resolveEaConfig();
    expect(config.enabled).toBe(false);
    expect(config.rootDir).toBe("ea");
    expect(config.generatedDir).toBe("ea/generated");
    expect(config.idPrefix).toBeNull();
    expect(config.resolvers).toEqual([]);
    expect(config.generators).toEqual([]);
    expect(config.evidenceSources).toEqual([]);
  });

  it("returns defaults when null is provided", () => {
    const config = resolveEaConfig(null);
    expect(config.enabled).toBe(false);
    expect(config.rootDir).toBe("ea");
  });

  it("builds domain paths from rootDir", () => {
    const config = resolveEaConfig();
    expect(config.domains.systems).toBe("ea/systems");
    expect(config.domains.delivery).toBe("ea/delivery");
    expect(config.domains.data).toBe("ea/data");
    expect(config.domains.information).toBe("ea/information");
    expect(config.domains.business).toBe("ea/business");
    expect(config.domains.transitions).toBe("ea/transitions");
  });

  it("uses custom rootDir for domain paths", () => {
    const config = resolveEaConfig({ rootDir: "specs/ea" });
    expect(config.rootDir).toBe("specs/ea");
    expect(config.domains.systems).toBe("specs/ea/systems");
    expect(config.generatedDir).toBe("specs/ea/generated");
  });

  it("merges enabled flag", () => {
    const config = resolveEaConfig({ enabled: true });
    expect(config.enabled).toBe(true);
  });

  it("merges idPrefix", () => {
    const config = resolveEaConfig({ idPrefix: "acme" });
    expect(config.idPrefix).toBe("acme");
  });

  it("shallow-merges domains (partial override)", () => {
    const config = resolveEaConfig({
      domains: { systems: "custom/systems" } as EaConfig["domains"],
    });
    expect(config.domains.systems).toBe("custom/systems");
    // Other domains retain defaults
    expect(config.domains.delivery).toBe("ea/delivery");
  });

  it("shallow-merges cache config", () => {
    const config = resolveEaConfig({
      cache: { defaultTTL: 7200 } as EaConfig["cache"],
    });
    expect(config.cache.defaultTTL).toBe(7200);
    expect(config.cache.dir).toBe(".anchored-spec/cache/ea");
  });

  it("shallow-merges quality config", () => {
    const config = resolveEaConfig({
      quality: { strictMode: true } as EaConfig["quality"],
    });
    expect(config.quality.strictMode).toBe(true);
    expect(config.quality.requireOwners).toBe(true); // default preserved
  });

  it("overrides resolvers array entirely", () => {
    const config = resolveEaConfig({
      resolvers: [{ path: "./my-resolver.js" }],
    });
    expect(config.resolvers).toEqual([{ path: "./my-resolver.js" }]);
  });

  it("overrides generators array entirely", () => {
    const config = resolveEaConfig({
      generators: [{ path: "./my-gen.js", outputDir: "out" }],
    });
    expect(config.generators).toEqual([
      { path: "./my-gen.js", outputDir: "out" },
    ]);
  });

  it("default quality rules object is empty", () => {
    const config = resolveEaConfig();
    expect(config.quality.rules).toEqual({});
  });

  it("preserves quality rule overrides", () => {
    const config = resolveEaConfig({
      quality: {
        rules: { "ea:active-needs-owner": "off" },
      } as EaConfig["quality"],
    });
    expect(config.quality.rules["ea:active-needs-owner"]).toBe("off");
  });
});
