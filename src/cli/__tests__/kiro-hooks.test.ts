import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  generateKiroHooks,
  writeAiConfigFiles,
} from "../ai-config.js";

describe("Kiro Hooks", () => {
  // ─── generateKiroHooks ───────────────────────────────────────────
  describe("generateKiroHooks", () => {
    const config = { rootDir: "docs", domains: { systems: "docs/systems" } };
    let hooks: ReturnType<typeof generateKiroHooks>;

    beforeEach(() => {
      hooks = generateKiroHooks(config);
    });

    it("generates validate-on-save hook with correct trigger and pattern", () => {
      expect(hooks.validateOnSave).toContain("trigger: onSave");
      expect(hooks.validateOnSave).toContain("docs/**/*.{yaml,yml,json}");
      expect(hooks.validateOnSave).toContain("npx anchored-spec validate");
      expect(hooks.validateOnSave).toContain("throttle:");
    });

    it("generates trace-on-save hook for spec documents", () => {
      expect(hooks.traceOnSave).toContain("trigger: onSave");
      expect(hooks.traceOnSave).toContain("**/*.md");
      expect(hooks.traceOnSave).toContain("trace --check");
      expect(hooks.traceOnSave).toContain("link-docs");
    });

    it("generates drift-on-save hook for implementation files", () => {
      expect(hooks.driftOnSave).toContain("trigger: onSave");
      expect(hooks.driftOnSave).toContain("src/**/*.{ts,js,tsx,jsx,py,java,go,rs}");
      expect(hooks.driftOnSave).toContain("npx anchored-spec drift");
      expect(hooks.driftOnSave).toContain("reconcile");
    });

    it("uses rootDir from config for entity pattern", () => {
      const customConfig = { rootDir: "architecture", domains: {} };
      const customHooks = generateKiroHooks(customConfig);
      expect(customHooks.validateOnSave).toContain("architecture/**/*.{yaml,yml,json}");
    });

    it("all hooks have required YAML fields", () => {
      for (const hook of [hooks.validateOnSave, hooks.traceOnSave, hooks.driftOnSave]) {
        expect(hook).toContain("name:");
        expect(hook).toContain("description:");
        expect(hook).toContain("trigger:");
        expect(hook).toContain("action:");
      }
    });
  });

  // ─── writeAiConfigFiles with kiro target ─────────────────────────
  describe("writeAiConfigFiles — kiro hooks", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `kiro-hooks-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("writes both steering and hooks files for kiro target", () => {
      const result = writeAiConfigFiles(
        tempDir,
        { rootDir: "docs", domains: { systems: "docs/systems" } },
        ["kiro"],
      );

      // Steering files (existing behavior)
      expect(existsSync(join(tempDir, ".kiro", "steering", "product.md"))).toBe(true);
      expect(existsSync(join(tempDir, ".kiro", "steering", "tech.md"))).toBe(true);
      expect(existsSync(join(tempDir, ".kiro", "steering", "structure.md"))).toBe(true);

      // Hook files (new)
      const hooksDir = join(tempDir, ".kiro", "hooks");
      expect(existsSync(join(hooksDir, "validate-entity.yml"))).toBe(true);
      expect(existsSync(join(hooksDir, "trace-integrity.yml"))).toBe(true);
      expect(existsSync(join(hooksDir, "drift-detection.yml"))).toBe(true);

      // 3 steering + 3 hooks = 6 files
      expect(result.created).toHaveLength(6);
    });

    it("hook files contain valid YAML structure", () => {
      writeAiConfigFiles(
        tempDir,
        { rootDir: "docs", domains: {} },
        ["kiro"],
      );

      const hooksDir = join(tempDir, ".kiro", "hooks");
      const validate = readFileSync(join(hooksDir, "validate-entity.yml"), "utf-8");
      expect(validate).toContain("trigger: onSave");
      expect(validate).toContain("docs/**/*.{yaml,yml,json}");
    });

    it("skips existing hook files on second write", () => {
      writeAiConfigFiles(tempDir, { rootDir: "docs", domains: {} }, ["kiro"]);
      const result2 = writeAiConfigFiles(tempDir, { rootDir: "docs", domains: {} }, ["kiro"]);

      expect(result2.created).toHaveLength(0);
      expect(result2.skipped).toHaveLength(6);
    });
  });
});
