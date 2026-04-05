import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  generateGitHubAction,
  generatePreCommitHook,
  writeCiRecipes,
} from "../ci-recipes.js";

describe("CI Integration Recipes", () => {
  // ─── generateGitHubAction ────────────────────────────────────────
  describe("generateGitHubAction", () => {
    it("generates a valid GitHub Actions workflow", () => {
      const action = generateGitHubAction();
      expect(action).toContain("name: Architecture Validation");
      expect(action).toContain("on:");
      expect(action).toContain("pull_request:");
      expect(action).toContain("push:");
      expect(action).toContain("anchored-spec validate --strict");
      expect(action).toContain("anchored-spec trace --check");
      expect(action).toContain("anchored-spec drift");
    });

    it("includes semantic diff on PRs only", () => {
      const action = generateGitHubAction();
      expect(action).toContain("if: github.event_name == 'pull_request'");
      expect(action).toContain("anchored-spec diff");
    });

    it("triggers on EA and doc file paths", () => {
      const action = generateGitHubAction();
      expect(action).toContain("'catalog-info.yaml'");
      expect(action).toContain("'catalog/**'");
      expect(action).toContain("'docs/**'");
    });
  });

  // ─── generatePreCommitHook ───────────────────────────────────────
  describe("generatePreCommitHook", () => {
    it("generates a shell script with shebang", () => {
      const hook = generatePreCommitHook();
      expect(hook).toMatch(/^#!\/bin\/sh/);
      expect(hook).toContain("set -e");
    });

    it("checks for staged EA files before running", () => {
      const hook = generatePreCommitHook();
      expect(hook).toContain("git diff --cached");
      expect(hook).toContain("STAGED_ENTITIES");
      expect(hook).toContain("STAGED_CONFIG");
    });

    it("runs validate and trace checks", () => {
      const hook = generatePreCommitHook();
      expect(hook).toContain("anchored-spec validate --strict");
      expect(hook).toContain("anchored-spec trace --check");
    });
  });

  // ─── writeCiRecipes ──────────────────────────────────────────────
  describe("writeCiRecipes", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `ci-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("creates GitHub Action and pre-commit hook", () => {
      const result = writeCiRecipes(tempDir);

      expect(existsSync(join(tempDir, ".github", "workflows", "ea-validation.yml"))).toBe(true);
      expect(existsSync(join(tempDir, ".anchored-spec", "hooks", "pre-commit"))).toBe(true);
      expect(result.created).toHaveLength(2);
      expect(result.skipped).toHaveLength(0);
      expect(result.overwritten).toHaveLength(0);
    });

    it("pre-commit hook is executable", () => {
      writeCiRecipes(tempDir);
      const stat = statSync(join(tempDir, ".anchored-spec", "hooks", "pre-commit"));
      // Check user execute bit
      expect(stat.mode & 0o100).toBeTruthy();
    });

    it("skips existing files without force", () => {
      writeCiRecipes(tempDir);
      const result = writeCiRecipes(tempDir);

      expect(result.skipped).toHaveLength(2);
      expect(result.created).toHaveLength(0);
    });

    it("overwrites existing files with force", () => {
      writeCiRecipes(tempDir);
      const result = writeCiRecipes(tempDir, { force: true });

      expect(result.overwritten).toHaveLength(2);
      expect(result.skipped).toHaveLength(0);
    });

    it("GitHub Action YAML references correct paths", () => {
      writeCiRecipes(tempDir);
      const content = readFileSync(
        join(tempDir, ".github", "workflows", "ea-validation.yml"),
        "utf-8",
      );
      expect(content).toContain("anchored-spec validate");
      expect(content).toContain("anchored-spec trace --check");
    });
  });
});
