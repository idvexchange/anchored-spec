import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { walkDir, discoverSourceFiles } from "../files.js";

const TMP = join(tmpdir(), "anchored-spec-files-test-" + process.pid);

beforeAll(() => {
  mkdirSync(join(TMP, "src/components"), { recursive: true });
  mkdirSync(join(TMP, "node_modules/lib"), { recursive: true });
  mkdirSync(join(TMP, "dist"), { recursive: true });
  writeFileSync(join(TMP, "src/index.ts"), "export const x = 1;");
  writeFileSync(join(TMP, "src/components/Button.tsx"), "export function Button() {}");
  writeFileSync(join(TMP, "node_modules/lib/index.js"), "module.exports = {};");
  writeFileSync(join(TMP, "dist/index.js"), "built");
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("walkDir", () => {

  it("discovers files recursively", () => {
    const files = walkDir(join(TMP, "src"), TMP);
    expect(files.length).toBe(2);
  });

  it("ignores node_modules by default", () => {
    const files = walkDir(TMP, TMP);
    const nmFiles = files.filter((f) => f.includes("node_modules"));
    expect(nmFiles).toHaveLength(0);
  });

  it("ignores dist by default", () => {
    const files = walkDir(TMP, TMP);
    const distFiles = files.filter((f) => f.includes("dist"));
    expect(distFiles).toHaveLength(0);
  });

  it("respects custom ignore patterns", () => {
    const files = walkDir(join(TMP, "src"), TMP, { ignore: ["**/components/**"] });
    expect(files.length).toBe(1);
    expect(files[0]).toContain("index.ts");
  });

  it("returns empty for non-existent directory", () => {
    const files = walkDir(join(TMP, "nonexistent"), TMP);
    expect(files).toHaveLength(0);
  });
});

describe("discoverSourceFiles", () => {
  it("filters by glob patterns", () => {
    const files = discoverSourceFiles(["src"], ["**/*.tsx"], TMP);
    expect(files.length).toBe(1);
    expect(files[0]).toContain("Button.tsx");
  });

  it("returns unique files", () => {
    const files = discoverSourceFiles(["src", "src"], ["**/*.ts", "**/*.tsx"], TMP);
    const unique = new Set(files);
    expect(unique.size).toBe(files.length);
  });
});
