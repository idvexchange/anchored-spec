/**
 * Tests for EA Anchors Resolver
 *
 * Covers:
 *   - extractExportedSymbols (via scanAnchors)
 *   - scanAnchors: symbol, api, event, schema, and generic anchor types
 *   - AnchorsResolver class resolve() method
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanAnchors, AnchorsResolver } from "../resolvers/anchors.js";
import type { BackstageEntity } from "../backstage/types.js";

let tempDir: string;

function writeSource(relPath: string, content: string): void {
  const fullPath = join(tempDir, relPath);
  const dir = fullPath.replace(/\/[^/]+$/, "");
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content);
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "anchors-test-"));
  mkdirSync(join(tempDir, "src"), { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── scanAnchors: symbols ───────────────────────────────────────────────────────

describe("scanAnchors — symbols", () => {
  it("finds exported function", () => {
    writeSource("src/auth.ts", "export function loginUser(name: string) { return name; }");
    const result = scanAnchors({ symbols: ["loginUser"] }, tempDir);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.anchorType).toBe("symbols");
    expect(result.matches[0]!.anchorValue).toBe("loginUser");
    expect(result.matches[0]!.foundIn).toEqual(["src/auth.ts"]);
    expect(result.missing).toHaveLength(0);
  });

  it("finds exported const", () => {
    writeSource("src/config.ts", "export const MAX_RETRIES = 5;");
    const result = scanAnchors({ symbols: ["MAX_RETRIES"] }, tempDir);
    expect(result.matches).toHaveLength(1);
  });

  it("finds exported interface", () => {
    writeSource("src/types.ts", "export interface UserProfile { id: string; }");
    const result = scanAnchors({ symbols: ["UserProfile"] }, tempDir);
    expect(result.matches).toHaveLength(1);
  });

  it("finds export from re-export block", () => {
    writeSource("src/index.ts", "export { UserService, AuthService } from './services.js';");
    const result = scanAnchors({ symbols: ["AuthService"] }, tempDir);
    expect(result.matches).toHaveLength(1);
  });

  it("reports missing symbols", () => {
    writeSource("src/empty.ts", "// no exports");
    const result = scanAnchors({ symbols: ["NonExistent"] }, tempDir);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]!.anchorValue).toBe("NonExistent");
    expect(result.matches).toHaveLength(0);
  });

  it("finds symbol in multiple files", () => {
    writeSource("src/a.ts", "export class Logger {}");
    writeSource("src/b.ts", "export { Logger } from './a.js';");
    const result = scanAnchors({ symbols: ["Logger"] }, tempDir);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.foundIn).toHaveLength(2);
  });
});

// ─── scanAnchors: apis ──────────────────────────────────────────────────────────

describe("scanAnchors — apis", () => {
  it("finds route string in source", () => {
    writeSource("src/routes.ts", `app.get("/api/users", handler);`);
    const result = scanAnchors({ apis: ["GET /api/users"] }, tempDir);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.foundIn[0]).toBe("src/routes.ts");
  });

  it("reports missing api routes", () => {
    writeSource("src/routes.ts", `app.get("/api/health", handler);`);
    const result = scanAnchors({ apis: ["GET /api/orders"] }, tempDir);
    expect(result.missing).toHaveLength(1);
  });
});

// ─── scanAnchors: events ────────────────────────────────────────────────────────

describe("scanAnchors — events", () => {
  it("finds event string in source", () => {
    writeSource("src/events.ts", `emit("user.created", payload);`);
    const result = scanAnchors({ events: ["user.created"] }, tempDir);
    expect(result.matches).toHaveLength(1);
  });

  it("reports missing events", () => {
    writeSource("src/events.ts", `// nothing`);
    const result = scanAnchors({ events: ["order.shipped"] }, tempDir);
    expect(result.missing).toHaveLength(1);
  });
});

// ─── scanAnchors: schemas ───────────────────────────────────────────────────────

describe("scanAnchors — schemas", () => {
  it("finds schema reference in source", () => {
    writeSource("src/schemas.ts", `const schema = loadSchema("UserSchema");`);
    const result = scanAnchors({ schemas: ["UserSchema"] }, tempDir);
    expect(result.matches).toHaveLength(1);
  });
});

// ─── scanAnchors: generic ───────────────────────────────────────────────────────

describe("scanAnchors — generic anchor types", () => {
  it("finds infra anchor via string search", () => {
    writeSource("src/deploy.ts", `const bucket = "s3://my-app-bucket";`);
    const result = scanAnchors({ infra: ["s3://my-app-bucket"] }, tempDir);
    expect(result.matches).toHaveLength(1);
  });

  it("finds value in quoted string variants", () => {
    writeSource("src/config.ts", `const arn = "arn:aws:lambda:us-east-1";`);
    const result = scanAnchors({ catalogRefs: ["arn:aws:lambda:us-east-1"] }, tempDir);
    expect(result.matches).toHaveLength(1);
  });
});

// ─── scanAnchors: mixed ─────────────────────────────────────────────────────────

describe("scanAnchors — mixed anchor types", () => {
  it("handles multiple anchor types in one call", () => {
    writeSource("src/app.ts", [
      'export function handleRequest() {}',
      'app.post("/api/orders", handleRequest);',
      'emit("order.placed");',
    ].join("\n"));

    const result = scanAnchors(
      {
        symbols: ["handleRequest"],
        apis: ["POST /api/orders"],
        events: ["order.placed"],
      },
      tempDir,
    );

    expect(result.matches).toHaveLength(3);
    expect(result.missing).toHaveLength(0);
  });

  it("scannedFiles count is correct", () => {
    writeSource("src/a.ts", "export const A = 1;");
    writeSource("src/b.ts", "export const B = 2;");
    const result = scanAnchors({ symbols: ["A"] }, tempDir);
    expect(result.scannedFiles).toBe(2);
  });
});

// ─── AnchorsResolver class ──────────────────────────────────────────────────────

describe("AnchorsResolver", () => {
  it("has correct name and description", () => {
    const resolver = new AnchorsResolver();
    expect(resolver.name).toBe("anchors");
    expect(resolver.description).toBeTruthy();
  });

  it("resolves artifacts with anchors", async () => {
    writeSource("src/service.ts", "export class UserService {}");

    const entity: BackstageEntity = {
      apiVersion: "backstage.io/v1alpha1",
      kind: "Component",
      metadata: {
        name: "svc-user-service",
        annotations: { "anchored-spec.dev/confidence": "declared" },
      },
      spec: {
        type: "service",
        owner: "team-a",
        lifecycle: "production",
        anchors: { symbols: ["UserService"] },
      },
    };

    const resolver = new AnchorsResolver();
    const result = await resolver.resolve({
      projectRoot: tempDir,
      artifacts: [entity],
    });

    expect(result.source).toBe("anchors");
    expect(result.collectedAt).toBeTruthy();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.externalId).toContain("svc-user-service:anchor:symbols:UserService");
    expect(result.entities[0]!.metadata!.status).toBe("found");
  });

  it("reports missing anchors as entities", async () => {
    writeSource("src/empty.ts", "// nothing");

    const entity: BackstageEntity = {
      apiVersion: "backstage.io/v1alpha1",
      kind: "Component",
      metadata: {
        name: "svc-ghost",
        annotations: { "anchored-spec.dev/confidence": "declared" },
      },
      spec: {
        type: "service",
        owner: "team-a",
        lifecycle: "production",
        anchors: { symbols: ["NonExistent"] },
      },
    };

    const resolver = new AnchorsResolver();
    const result = await resolver.resolve({
      projectRoot: tempDir,
      artifacts: [entity],
    });

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.metadata!.status).toBe("missing");
  });

  it("skips artifacts without anchors", async () => {
    const entity: BackstageEntity = {
      apiVersion: "backstage.io/v1alpha1",
      kind: "Component",
      metadata: {
        name: "svc-no-anchors",
        annotations: { "anchored-spec.dev/confidence": "declared" },
      },
      spec: {
        type: "service",
        owner: "team-a",
        lifecycle: "production",
      },
    };

    const resolver = new AnchorsResolver();
    const result = await resolver.resolve({
      projectRoot: tempDir,
      artifacts: [entity],
    });

    expect(result.entities).toHaveLength(0);
  });

  it("uses custom sourceRoots", async () => {
    mkdirSync(join(tempDir, "lib"), { recursive: true });
    writeSource("lib/util.ts", "export function helper() {}");

    const entity: BackstageEntity = {
      apiVersion: "backstage.io/v1alpha1",
      kind: "Component",
      metadata: {
        name: "lib-helper",
        annotations: { "anchored-spec.dev/confidence": "declared" },
      },
      spec: {
        type: "library",
        owner: "team-a",
        lifecycle: "production",
        anchors: { symbols: ["helper"] },
      },
    };

    const resolver = new AnchorsResolver({ sourceRoots: ["lib"] });
    const result = await resolver.resolve({
      projectRoot: tempDir,
      artifacts: [entity],
    });

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.metadata!.status).toBe("found");
  });
});
