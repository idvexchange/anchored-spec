import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  generateSpecKitExtension,
  writeAiConfigFiles,
} from "../ai-config.js";

describe("Spec-Kit Extension", () => {
  // ─── generateSpecKitExtension ────────────────────────────────────
  describe("generateSpecKitExtension", () => {
    const config = { rootDir: "ea", domains: { systems: "ea/systems" } };
    let ext: ReturnType<typeof generateSpecKitExtension>;

    beforeEach(() => {
      ext = generateSpecKitExtension(config);
    });

    it("generates a valid extension manifest", () => {
      expect(ext.manifest).toContain('id: "anchored-spec"');
      expect(ext.manifest).toContain("schema_version:");
      expect(ext.manifest).toContain("commands:");
      expect(ext.manifest).toContain("hooks:");
      expect(ext.manifest).toContain("after_tasks:");
      expect(ext.manifest).toContain("commands/scaffold.md");
      expect(ext.manifest).toContain("commands/trace.md");
      expect(ext.manifest).toContain("commands/context.md");
    });

    it("generates scaffold command referencing discover --from-docs", () => {
      expect(ext.scaffoldCmd).toContain("$ARGUMENTS");
      expect(ext.scaffoldCmd).toContain("discover --from-docs");
      expect(ext.scaffoldCmd).toContain("link-docs");
    });

    it("generates trace command", () => {
      expect(ext.traceCmd).toContain("trace --check");
      expect(ext.traceCmd).toContain("Bidirectional");
    });

    it("generates context command", () => {
      expect(ext.contextCmd).toContain("npx anchored-spec context");
      expect(ext.contextCmd).toContain("max-tokens");
    });

    it("uses rootDir from config in scaffold command", () => {
      expect(ext.scaffoldCmd).toContain("ea/");
    });
  });

  // ─── writeAiConfigFiles with speckit target ──────────────────────
  describe("writeAiConfigFiles — speckit target", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `speckit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("writes extension files to .specify/extensions/anchored-spec/", () => {
      const result = writeAiConfigFiles(
        tempDir,
        { rootDir: "ea", domains: { systems: "ea/systems" } },
        ["speckit"],
      );

      const extDir = join(tempDir, ".specify", "extensions", "anchored-spec");
      expect(existsSync(join(extDir, "extension.yml"))).toBe(true);
      expect(existsSync(join(extDir, "commands", "scaffold.md"))).toBe(true);
      expect(existsSync(join(extDir, "commands", "trace.md"))).toBe(true);
      expect(existsSync(join(extDir, "commands", "context.md"))).toBe(true);

      expect(result.created).toHaveLength(4);
      expect(result.skipped).toHaveLength(0);
    });

    it("skips existing files", () => {
      // First write
      writeAiConfigFiles(
        tempDir,
        { rootDir: "ea", domains: {} },
        ["speckit"],
      );

      // Second write
      const result2 = writeAiConfigFiles(
        tempDir,
        { rootDir: "ea", domains: {} },
        ["speckit"],
      );

      expect(result2.created).toHaveLength(0);
      expect(result2.skipped).toHaveLength(4);
    });

    it("includes speckit when target is 'all'", () => {
      const result = writeAiConfigFiles(
        tempDir,
        { rootDir: "ea", domains: { systems: "ea/systems" } },
        ["all"],
      );

      const extDir = join(tempDir, ".specify", "extensions", "anchored-spec");
      expect(existsSync(join(extDir, "extension.yml"))).toBe(true);

      // Also generates other targets
      expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);
      // All targets: copilot(1+6) + claude(1+6) + kiro(3+4) + speckit(5) = 26
      expect(result.created.length).toBeGreaterThanOrEqual(5);
    });

    it("manifest is valid YAML-like content", () => {
      writeAiConfigFiles(
        tempDir,
        { rootDir: "ea", domains: {} },
        ["speckit"],
      );

      const manifest = readFileSync(
        join(tempDir, ".specify", "extensions", "anchored-spec", "extension.yml"),
        "utf-8",
      );

      expect(manifest).toContain("schema_version:");
      expect(manifest).toContain('id: "anchored-spec"');
      expect(manifest).toContain("after_tasks:");
    });
  });
});
