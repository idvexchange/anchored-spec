import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  generateAgentPrompts,
  generateCopilotPrompts,
  generateClaudeCommands,
  writeAiConfigFiles,
} from "../ai-config.js";

const config = { rootDir: "ea", domains: { systems: "ea/systems" } };

describe("Agent Prompt Templates", () => {
  // ─── generateAgentPrompts ────────────────────────────────────────
  describe("generateAgentPrompts", () => {
    it("generates all 5 prompts", () => {
      const prompts = generateAgentPrompts(config);
      expect(Object.keys(prompts)).toHaveLength(5);
      expect(prompts).toHaveProperty("scaffold");
      expect(prompts).toHaveProperty("trace");
      expect(prompts).toHaveProperty("context");
      expect(prompts).toHaveProperty("drift");
      expect(prompts).toHaveProperty("audit");
    });

    it("prompts reference anchored-spec CLI commands", () => {
      const prompts = generateAgentPrompts(config);
      expect(prompts.scaffold).toContain("discover --from-docs");
      expect(prompts.trace).toContain("trace --check");
      expect(prompts.context).toContain("npx anchored-spec context");
      expect(prompts.drift).toContain("npx anchored-spec drift");
      expect(prompts.audit).toContain("npx anchored-spec validate");
    });
  });

  // ─── generateCopilotPrompts ──────────────────────────────────────
  describe("generateCopilotPrompts", () => {
    it("generates 5 prompt files with .prompt.md metadata", () => {
      const prompts = generateCopilotPrompts(config);
      expect(prompts).toHaveLength(5);

      for (const p of prompts) {
        expect(p.name).toMatch(/^ea-/);
        expect(p.content).toContain("description:");
      }
    });

    it("prompt names match expected commands", () => {
      const prompts = generateCopilotPrompts(config);
      const names = prompts.map((p) => p.name);
      expect(names).toContain("ea-scaffold");
      expect(names).toContain("ea-trace");
      expect(names).toContain("ea-context");
      expect(names).toContain("ea-drift");
      expect(names).toContain("ea-audit");
    });
  });

  // ─── generateClaudeCommands ──────────────────────────────────────
  describe("generateClaudeCommands", () => {
    it("generates 5 command files", () => {
      const commands = generateClaudeCommands(config);
      expect(commands).toHaveLength(5);

      for (const c of commands) {
        expect(c.name).toMatch(/^ea-/);
        expect(c.content.length).toBeGreaterThan(50);
      }
    });
  });

  // ─── writeAiConfigFiles — copilot prompts ────────────────────────
  describe("writeAiConfigFiles — copilot prompts", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `prompts-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("writes copilot-instructions.md AND 5 prompt files", () => {
      const result = writeAiConfigFiles(tempDir, config, ["copilot"]);

      expect(existsSync(join(tempDir, ".github", "copilot-instructions.md"))).toBe(true);

      const promptsDir = join(tempDir, ".github", "prompts");
      expect(existsSync(join(promptsDir, "ea-scaffold.prompt.md"))).toBe(true);
      expect(existsSync(join(promptsDir, "ea-trace.prompt.md"))).toBe(true);
      expect(existsSync(join(promptsDir, "ea-context.prompt.md"))).toBe(true);
      expect(existsSync(join(promptsDir, "ea-drift.prompt.md"))).toBe(true);
      expect(existsSync(join(promptsDir, "ea-audit.prompt.md"))).toBe(true);

      // 1 instructions + 5 prompts
      expect(result.created).toHaveLength(6);
    });

    it("prompt files contain YAML frontmatter with description", () => {
      writeAiConfigFiles(tempDir, config, ["copilot"]);

      const content = readFileSync(
        join(tempDir, ".github", "prompts", "ea-scaffold.prompt.md"),
        "utf-8",
      );
      expect(content).toMatch(/^---\n/);
      expect(content).toContain("description:");
      expect(content).toContain("discover --from-docs");
    });
  });

  // ─── writeAiConfigFiles — claude commands ────────────────────────
  describe("writeAiConfigFiles — claude commands", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `claude-cmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("writes CLAUDE.md AND 5 command files", () => {
      const result = writeAiConfigFiles(tempDir, config, ["claude"]);

      expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);

      const cmdDir = join(tempDir, ".claude", "commands");
      expect(existsSync(join(cmdDir, "ea-scaffold.md"))).toBe(true);
      expect(existsSync(join(cmdDir, "ea-trace.md"))).toBe(true);
      expect(existsSync(join(cmdDir, "ea-context.md"))).toBe(true);
      expect(existsSync(join(cmdDir, "ea-drift.md"))).toBe(true);
      expect(existsSync(join(cmdDir, "ea-audit.md"))).toBe(true);

      // 1 CLAUDE.md + 5 commands
      expect(result.created).toHaveLength(6);
    });

    it("command files contain CLI references", () => {
      writeAiConfigFiles(tempDir, config, ["claude"]);

      const content = readFileSync(
        join(tempDir, ".claude", "commands", "ea-drift.md"),
        "utf-8",
      );
      expect(content).toContain("npx anchored-spec drift");
    });
  });

  // ─── --force overwrites existing files ───────────────────────────
  describe("writeAiConfigFiles — force mode", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `force-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("overwrites existing files when force is true", () => {
      // First write
      writeAiConfigFiles(tempDir, config, ["copilot"]);
      const original = readFileSync(join(tempDir, ".github", "copilot-instructions.md"), "utf-8");

      // Second write with force
      const result = writeAiConfigFiles(tempDir, config, ["copilot"], { force: true });

        expect(result.overwritten).toHaveLength(6);
      expect(result.created).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);

      // Content is regenerated (same in this case, but the write happened)
      const updated = readFileSync(join(tempDir, ".github", "copilot-instructions.md"), "utf-8");
      expect(updated).toBe(original);
    });

    it("skips existing files when force is false (default)", () => {
      writeAiConfigFiles(tempDir, config, ["claude"]);
      const result = writeAiConfigFiles(tempDir, config, ["claude"]);

        expect(result.skipped).toHaveLength(6);
      expect(result.overwritten).toHaveLength(0);
    });

    it("returns empty overwritten array on fresh write", () => {
      const result = writeAiConfigFiles(tempDir, config, ["copilot"]);
      expect(result.overwritten).toHaveLength(0);
    });
  });
});
