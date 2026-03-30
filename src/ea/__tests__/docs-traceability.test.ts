import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  parseFrontmatter,
  extractArtifactIds,
  hasEaFrontmatter,
  serializeFrontmatter,
} from "../docs/frontmatter.js";
import type { DocFrontmatter } from "../docs/frontmatter.js";
import { scanDocs, buildDocIndex } from "../docs/scanner.js";

describe("Document Traceability", () => {
  // ─── parseFrontmatter ─────────────────────────────────────────────
  describe("parseFrontmatter", () => {
    it("parses valid frontmatter with all fields", () => {
      const content = [
        "---",
        "type: spec",
        "status: current",
        "audience: agent, developer",
        "domain: [systems, delivery]",
        "requires: [./other.md]",
        "ea-artifacts: [APP-web, SVC-api]",
        "tokens: 1500",
        'last-verified: "2024-01-15"',
        "---",
        "# Document body",
      ].join("\n");

      const result = parseFrontmatter(content);

      expect(result.hasFrontmatter).toBe(true);
      expect(result.frontmatter.type).toBe("spec");
      expect(result.frontmatter.status).toBe("current");
      expect(result.frontmatter.audience).toEqual(["agent", "developer"]);
      expect(result.frontmatter.domain).toEqual(["systems", "delivery"]);
      expect(result.frontmatter.requires).toEqual(["./other.md"]);
      expect(result.frontmatter.eaArtifacts).toEqual(["APP-web", "SVC-api"]);
      expect(result.frontmatter.tokens).toBe(1500);
      expect(result.frontmatter.lastVerified).toBe("2024-01-15");
    });

    it("returns empty frontmatter when no delimiters present", () => {
      const content = "# Just a heading\n\nSome content.";
      const result = parseFrontmatter(content);

      expect(result.hasFrontmatter).toBe(false);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe(content);
      expect(result.rawFrontmatter).toBe("");
    });

    it("handles empty frontmatter block", () => {
      const content = "---\n\n---\nBody text";
      const result = parseFrontmatter(content);

      expect(result.hasFrontmatter).toBe(true);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe("Body text");
    });

    it("normalizes comma-separated audience to array", () => {
      const content = "---\naudience: agent, developer\n---\n";
      const result = parseFrontmatter(content);

      expect(result.frontmatter.audience).toEqual(["agent", "developer"]);
    });

    it("normalizes array audience", () => {
      const content = "---\naudience: [agent, developer]\n---\n";
      const result = parseFrontmatter(content);

      expect(result.frontmatter.audience).toEqual(["agent", "developer"]);
    });

    it("normalizes single domain to array", () => {
      const content = "---\ndomain: systems\n---\n";
      const result = parseFrontmatter(content);

      expect(result.frontmatter.domain).toEqual(["systems"]);
    });

    it("normalizes array domain", () => {
      const content = "---\ndomain: [systems, delivery]\n---\n";
      const result = parseFrontmatter(content);

      expect(result.frontmatter.domain).toEqual(["systems", "delivery"]);
    });

    it("merges ea-artifacts and anchored-spec fields", () => {
      const content =
        "---\nea-artifacts: [A, B]\nanchored-spec: [B, C]\n---\n";
      const result = parseFrontmatter(content);

      expect(result.frontmatter.eaArtifacts).toEqual(["A", "B", "C"]);
    });

    it("handles last-verified kebab case", () => {
      const content = '---\nlast-verified: "2024-01-01"\n---\n';
      const result = parseFrontmatter(content);

      expect(result.frontmatter.lastVerified).toBe("2024-01-01");
    });

    it("handles lastVerified camelCase", () => {
      const content = '---\nlastVerified: "2024-01-01"\n---\n';
      const result = parseFrontmatter(content);

      expect(result.frontmatter.lastVerified).toBe("2024-01-01");
    });

    it("preserves body after frontmatter", () => {
      const content = "---\ntype: spec\n---\n# Title\n\nParagraph.";
      const result = parseFrontmatter(content);

      expect(result.body).toBe("# Title\n\nParagraph.");
    });

    it("handles malformed YAML gracefully", () => {
      const content = "---\n{unclosed: [bracket\n---\nBody here.";
      const result = parseFrontmatter(content);

      expect(result.hasFrontmatter).toBe(false);
      expect(result.body).toBe("Body here.");
    });
  });

  // ─── extractArtifactIds ───────────────────────────────────────────
  describe("extractArtifactIds", () => {
    it("returns artifact IDs from frontmatter", () => {
      const fm: DocFrontmatter = { eaArtifacts: ["APP-web", "SVC-api"] };
      expect(extractArtifactIds(fm)).toEqual(["APP-web", "SVC-api"]);
    });

    it("returns empty array when no eaArtifacts", () => {
      expect(extractArtifactIds({})).toEqual([]);
    });

    it("deduplicates artifact IDs", () => {
      const fm: DocFrontmatter = {
        eaArtifacts: ["APP-web", "APP-web", "SVC-api"],
      };
      expect(extractArtifactIds(fm)).toEqual(["APP-web", "SVC-api"]);
    });
  });

  // ─── hasEaFrontmatter ─────────────────────────────────────────────
  describe("hasEaFrontmatter", () => {
    it("returns true for frontmatter with ea-artifacts", () => {
      const content = "---\nea-artifacts: [APP-web]\n---\n";
      expect(hasEaFrontmatter(content)).toBe(true);
    });

    it("returns true for frontmatter with type", () => {
      const content = "---\ntype: spec\n---\n";
      expect(hasEaFrontmatter(content)).toBe(true);
    });

    it("returns false for no frontmatter", () => {
      expect(hasEaFrontmatter("# Just markdown")).toBe(false);
    });

    it("returns false for frontmatter without EA keys", () => {
      const content = "---\ntitle: Something\nauthor: Someone\n---\n";
      expect(hasEaFrontmatter(content)).toBe(false);
    });
  });

  // ─── serializeFrontmatter ─────────────────────────────────────────
  describe("serializeFrontmatter", () => {
    it("serializes frontmatter with ea-artifacts key", () => {
      const fm: DocFrontmatter = { eaArtifacts: ["APP-web", "SVC-api"] };
      const output = serializeFrontmatter(fm);

      expect(output).toContain("ea-artifacts:");
      expect(output).not.toContain("eaArtifacts");
      expect(output.startsWith("---\n")).toBe(true);
      expect(output.endsWith("\n---")).toBe(true);
    });

    it("serializes frontmatter with last-verified key", () => {
      const fm: DocFrontmatter = { lastVerified: "2024-06-01" };
      const output = serializeFrontmatter(fm);

      expect(output).toContain("last-verified:");
      expect(output).not.toContain("lastVerified");
    });

    it("round-trips through parse → serialize", () => {
      const original: DocFrontmatter = {
        type: "spec",
        status: "current",
        audience: ["agent", "developer"],
        domain: ["systems"],
        eaArtifacts: ["APP-web", "SVC-api"],
        tokens: 1200,
        lastVerified: "2024-03-15",
      };

      const serialized = serializeFrontmatter(original);
      const parsed = parseFrontmatter(serialized + "\n");

      expect(parsed.hasFrontmatter).toBe(true);
      expect(parsed.frontmatter.type).toBe(original.type);
      expect(parsed.frontmatter.status).toBe(original.status);
      expect(parsed.frontmatter.audience).toEqual(original.audience);
      expect(parsed.frontmatter.domain).toEqual(original.domain);
      expect(parsed.frontmatter.eaArtifacts).toEqual(original.eaArtifacts);
      expect(parsed.frontmatter.tokens).toBe(original.tokens);
      expect(parsed.frontmatter.lastVerified).toBe(original.lastVerified);
    });
  });

  // ─── scanDocs ─────────────────────────────────────────────────────
  describe("scanDocs", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = join(
        tmpdir(),
        `ea-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(join(tmpDir, "docs"), { recursive: true });
      mkdirSync(join(tmpDir, "ea", "systems"), { recursive: true });
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("finds docs with ea-artifacts frontmatter", () => {
      writeFileSync(
        join(tmpDir, "docs", "arch.md"),
        "---\nea-artifacts: [APP-web]\n---\n# Architecture\n",
      );

      const result = scanDocs(tmpDir, { dirs: ["docs"] });

      expect(result.docs).toHaveLength(1);
      expect(result.docs[0].relativePath).toBe(join("docs", "arch.md"));
      expect(result.docs[0].artifactIds).toEqual(["APP-web"]);
    });

    it("ignores docs without frontmatter", () => {
      writeFileSync(
        join(tmpDir, "docs", "readme.md"),
        "# README\n\nNo frontmatter here.\n",
      );

      const result = scanDocs(tmpDir, { dirs: ["docs"] });

      expect(result.docs).toHaveLength(0);
      expect(result.totalScanned).toBe(1);
    });

    it("ignores docs with frontmatter but no ea-artifacts unless includeAll", () => {
      writeFileSync(
        join(tmpDir, "docs", "notes.md"),
        "---\ntype: guide\n---\n# Notes\n",
      );

      const withoutAll = scanDocs(tmpDir, {
        dirs: ["docs"],
        includeAll: false,
      });
      expect(withoutAll.docs).toHaveLength(0);
      expect(withoutAll.withFrontmatterNoArtifacts).toBe(1);

      const withAll = scanDocs(tmpDir, { dirs: ["docs"], includeAll: true });
      expect(withAll.docs).toHaveLength(1);
      expect(withAll.docs[0].artifactIds).toEqual([]);
    });

    it("skips node_modules directory", () => {
      mkdirSync(join(tmpDir, "node_modules", "pkg"), { recursive: true });
      writeFileSync(
        join(tmpDir, "node_modules", "pkg", "README.md"),
        "---\nea-artifacts: [LIB-pkg]\n---\n# Pkg\n",
      );

      const result = scanDocs(tmpDir, { dirs: ["."] });

      expect(
        result.docs.every((d) => !d.path.includes("node_modules")),
      ).toBe(true);
    });

    it("deduplicates files across overlapping dirs", () => {
      writeFileSync(
        join(tmpDir, "docs", "shared.md"),
        "---\nea-artifacts: [APP-shared]\n---\n# Shared\n",
      );

      const result = scanDocs(tmpDir, { dirs: [".", "docs"] });
      const sharedDocs = result.docs.filter((d) =>
        d.relativePath.endsWith("shared.md"),
      );

      expect(sharedDocs).toHaveLength(1);
    });

    it("handles non-existent dirs gracefully", () => {
      writeFileSync(
        join(tmpDir, "docs", "real.md"),
        "---\nea-artifacts: [APP-real]\n---\n# Real\n",
      );

      const result = scanDocs(tmpDir, { dirs: ["nonexistent", "docs"] });

      expect(result.docs).toHaveLength(1);
      expect(result.docs[0].artifactIds).toEqual(["APP-real"]);
    });

    it("returns correct totalScanned count", () => {
      writeFileSync(
        join(tmpDir, "docs", "a.md"),
        "---\nea-artifacts: [A]\n---\n# A\n",
      );
      writeFileSync(
        join(tmpDir, "docs", "b.md"),
        "---\ntype: guide\n---\n# B\n",
      );
      writeFileSync(
        join(tmpDir, "docs", "c.md"),
        "# C — no frontmatter\n",
      );

      const result = scanDocs(tmpDir, { dirs: ["docs"] });

      expect(result.totalScanned).toBe(3);
      expect(result.docs).toHaveLength(1);
      expect(result.withFrontmatterNoArtifacts).toBe(1);
    });
  });

  // ─── buildDocIndex ────────────────────────────────────────────────
  describe("buildDocIndex", () => {
    it("builds inverted index from scanned docs", () => {
      const docs = [
        {
          path: "/p/docs/a.md",
          relativePath: "docs/a.md",
          frontmatter: { eaArtifacts: ["APP-web", "SVC-api"] },
          artifactIds: ["APP-web", "SVC-api"],
        },
        {
          path: "/p/docs/b.md",
          relativePath: "docs/b.md",
          frontmatter: { eaArtifacts: ["SVC-api", "DB-main"] },
          artifactIds: ["SVC-api", "DB-main"],
        },
      ];

      const index = buildDocIndex(docs);

      expect(index.get("APP-web")).toHaveLength(1);
      expect(index.get("APP-web")![0].relativePath).toBe("docs/a.md");

      expect(index.get("SVC-api")).toHaveLength(2);
      expect(index.get("SVC-api")!.map((d) => d.relativePath)).toEqual([
        "docs/a.md",
        "docs/b.md",
      ]);

      expect(index.get("DB-main")).toHaveLength(1);
      expect(index.get("DB-main")![0].relativePath).toBe("docs/b.md");
    });

    it("handles docs with no artifact IDs", () => {
      const docs = [
        {
          path: "/p/docs/empty.md",
          relativePath: "docs/empty.md",
          frontmatter: { type: "guide" as const },
          artifactIds: [] as string[],
        },
        {
          path: "/p/docs/real.md",
          relativePath: "docs/real.md",
          frontmatter: { eaArtifacts: ["APP-web"] },
          artifactIds: ["APP-web"],
        },
      ];

      const index = buildDocIndex(docs);

      expect(index.size).toBe(1);
      expect(index.has("APP-web")).toBe(true);
    });
  });
});
