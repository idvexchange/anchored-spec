import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runHooks } from "../hooks.js";
import type { AnchoredSpecConfig, HookDefinition } from "../types.js";

const TMP = join(tmpdir(), "anchored-spec-hooks-test-" + process.pid);

function makeConfig(hooks: HookDefinition[]): AnchoredSpecConfig {
  return {
    specRoot: "specs",
    hooks,
  };
}

describe("runHooks", () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("runs matching hooks", () => {
    const marker = join(TMP, "hook-ran.txt");
    const config = makeConfig([
      { event: "post-create", run: `echo "created" > "${marker}"` },
    ]);

    runHooks("post-create", config, {
      ANCHORED_SPEC_EVENT: "post-create",
    }, { cwd: TMP });

    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, "utf-8").trim()).toBe("created");
  });

  it("skips hooks for different events", () => {
    const marker = join(TMP, "should-not-exist.txt");
    const config = makeConfig([
      { event: "post-transition", run: `echo "bad" > "${marker}"` },
    ]);

    runHooks("post-create", config, {
      ANCHORED_SPEC_EVENT: "post-create",
    }, { cwd: TMP });

    expect(existsSync(marker)).toBe(false);
  });

  it("passes environment variables", () => {
    const marker = join(TMP, "env-check.txt");
    const config = makeConfig([
      { event: "post-create", run: `echo "$ANCHORED_SPEC_ID" > "${marker}"` },
    ]);

    runHooks("post-create", config, {
      ANCHORED_SPEC_EVENT: "post-create",
      ANCHORED_SPEC_ID: "REQ-42",
    }, { cwd: TMP });

    expect(readFileSync(marker, "utf-8").trim()).toBe("REQ-42");
  });

  it("does not throw on hook failure", () => {
    const config = makeConfig([
      { event: "post-create", run: "exit 1" },
    ]);

    expect(() => {
      runHooks("post-create", config, {
        ANCHORED_SPEC_EVENT: "post-create",
      }, { cwd: TMP });
    }).not.toThrow();
  });

  it("respects dry-run mode", () => {
    const marker = join(TMP, "dry-run-marker.txt");
    const config = makeConfig([
      { event: "post-create", run: `echo "x" > "${marker}"` },
    ]);

    runHooks("post-create", config, {
      ANCHORED_SPEC_EVENT: "post-create",
    }, { cwd: TMP, dryRun: true });

    expect(existsSync(marker)).toBe(false);
  });

  it("runs no hooks when config has empty hooks", () => {
    const config = makeConfig([]);
    expect(() => {
      runHooks("post-create", config, {
        ANCHORED_SPEC_EVENT: "post-create",
      });
    }).not.toThrow();
  });

  it("matches compound event exactly", () => {
    const marker = join(TMP, "compound-exact.txt");
    const config = makeConfig([
      { event: "post-create:requirement", run: `echo "req" > "${marker}"` },
      { event: "post-create:change", run: `echo "chg" > "${marker}"` },
    ]);

    runHooks("post-create:requirement", config, {
      ANCHORED_SPEC_EVENT: "post-create",
    }, { cwd: TMP });

    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, "utf-8").trim()).toBe("req");
  });

  it("falls back to base event when no compound match", () => {
    const marker = join(TMP, "compound-fallback.txt");
    const config = makeConfig([
      { event: "post-create", run: `echo "base" > "${marker}"` },
    ]);

    // Fire compound event — should fall back to base "post-create"
    runHooks("post-create:decision", config, {
      ANCHORED_SPEC_EVENT: "post-create",
    }, { cwd: TMP });

    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, "utf-8").trim()).toBe("base");
  });

  it("fires compound match and base event both", () => {
    const exactMarker = join(TMP, "both-exact.txt");
    const baseMarker = join(TMP, "both-base.txt");
    const config = makeConfig([
      { event: "post-create:requirement", run: `echo "exact" > "${exactMarker}"` },
      { event: "post-create", run: `echo "base" > "${baseMarker}"` },
    ]);

    runHooks("post-create:requirement", config, {
      ANCHORED_SPEC_EVENT: "post-create",
    }, { cwd: TMP });

    expect(existsSync(exactMarker)).toBe(true);
    expect(existsSync(baseMarker)).toBe(true);
  });

  it("does not fire compound hook for wrong entity type", () => {
    const marker = join(TMP, "wrong-type.txt");
    const config = makeConfig([
      { event: "post-create:requirement", run: `echo "wrong" > "${marker}"` },
    ]);

    runHooks("post-create:change", config, {
      ANCHORED_SPEC_EVENT: "post-create",
    }, { cwd: TMP });

    expect(existsSync(marker)).toBe(false);
  });
});
