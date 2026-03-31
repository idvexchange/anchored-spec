import { describe, it, expect } from "vitest";
import { extractAnnotations, scanSourceAnnotations } from "../source-scanner.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── extractAnnotations unit tests ───────────────────────────────────

describe("extractAnnotations", () => {
  it("extracts // @anchored-spec: ID from TypeScript", () => {
    const content = `
import { foo } from "bar";
// @anchored-spec: SVC-auth-core
export class AuthService {}
`;
    expect(extractAnnotations(content)).toEqual(["SVC-auth-core"]);
  });

  it("extracts # @anchored-spec: ID from Python/YAML comments", () => {
    const content = `# @anchored-spec: SVC-data-pipeline
def process(): pass
`;
    expect(extractAnnotations(content)).toEqual(["SVC-data-pipeline"]);
  });

  it("extracts -- @anchored-spec: ID from SQL comments", () => {
    const content = `-- @anchored-spec: ENT-user-table
CREATE TABLE users (id INT);
`;
    expect(extractAnnotations(content)).toEqual(["ENT-user-table"]);
  });

  it("extracts multiple annotations from one file", () => {
    const content = `
// @anchored-spec: SVC-auth
// @anchored-spec: SVC-gateway
export function handler() {}
`;
    const ids = extractAnnotations(content);
    expect(ids).toContain("SVC-auth");
    expect(ids).toContain("SVC-gateway");
    expect(ids).toHaveLength(2);
  });

  it("deduplicates repeated annotations", () => {
    const content = `
// @anchored-spec: SVC-auth
// @anchored-spec: SVC-auth
`;
    expect(extractAnnotations(content)).toEqual(["SVC-auth"]);
  });

  it("returns empty for files without annotations", () => {
    expect(extractAnnotations("const x = 1;\n")).toEqual([]);
  });

  it("ignores malformed annotations (no ID)", () => {
    expect(extractAnnotations("// @anchored-spec:\n")).toEqual([]);
  });
});

// ─── scanSourceAnnotations integration tests ─────────────────────────

describe("scanSourceAnnotations", () => {
  let tempDir: string;

  function setup() {
    tempDir = join(
      tmpdir(),
      `anchored-spec-source-scanner-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(tempDir, "src", "services"), { recursive: true });
    mkdirSync(join(tempDir, "src", "utils"), { recursive: true });
  }

  function cleanup() {
    rmSync(tempDir, { recursive: true, force: true });
  }

  it("finds annotations in source files", () => {
    setup();
    try {
      writeFileSync(
        join(tempDir, "src", "services", "auth.ts"),
        `// @anchored-spec: SVC-auth-core\nexport class Auth {}\n`,
      );
      writeFileSync(
        join(tempDir, "src", "utils", "helpers.ts"),
        `export function noop() {}\n`,
      );

      const result = scanSourceAnnotations(tempDir);
      expect(result.totalScanned).toBeGreaterThanOrEqual(1);
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]!.artifactIds).toEqual(["SVC-auth-core"]);
      expect(result.sources[0]!.relativePath).toContain("auth.ts");
    } finally {
      cleanup();
    }
  });

  it("respects custom sourceRoots", () => {
    setup();
    mkdirSync(join(tempDir, "lib"), { recursive: true });
    try {
      writeFileSync(
        join(tempDir, "lib", "index.ts"),
        `// @anchored-spec: SVC-lib\nexport const x = 1;\n`,
      );
      writeFileSync(
        join(tempDir, "src", "services", "auth.ts"),
        `// @anchored-spec: SVC-auth\nexport class Auth {}\n`,
      );

      // Only scan lib/, not src/
      const result = scanSourceAnnotations(tempDir, {
        sourceRoots: ["lib"],
      });
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]!.artifactIds).toEqual(["SVC-lib"]);
    } finally {
      cleanup();
    }
  });

  it("returns empty when no annotations found", () => {
    setup();
    try {
      writeFileSync(
        join(tempDir, "src", "services", "clean.ts"),
        `export function clean() {}\n`,
      );

      const result = scanSourceAnnotations(tempDir);
      expect(result.sources).toHaveLength(0);
      expect(result.totalScanned).toBeGreaterThanOrEqual(1);
    } finally {
      cleanup();
    }
  });
});
