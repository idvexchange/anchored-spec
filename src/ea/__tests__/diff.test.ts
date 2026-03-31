/**
 * Tests for the EA Spec Diff Engine
 */

import { describe, it, expect } from "vitest";
import {
  diffEaArtifacts,
  renderDiffSummary,
  renderDiffMarkdown,
  getFieldSemantic,
  deepEqual,
} from "../diff.js";
import type { BackstageEntity } from "../backstage/types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

const BACKSTAGE_API = "backstage.io/v1alpha1";
const ANCHORED_SPEC_API = "anchored-spec.dev/v1alpha1";

/** Maps legacy kind names to BackstageEntity creation parameters. */
const KIND_MAP: Record<string, { apiVersion: string; kind: string; specType?: string }> = {
  "application":       { apiVersion: BACKSTAGE_API, kind: "Component", specType: "website" },
  "service":           { apiVersion: BACKSTAGE_API, kind: "Component", specType: "service" },
  "api-contract":      { apiVersion: BACKSTAGE_API, kind: "API", specType: "openapi" },
  "canonical-entity":  { apiVersion: ANCHORED_SPEC_API, kind: "CanonicalEntity" },
  "capability":        { apiVersion: ANCHORED_SPEC_API, kind: "Capability" },
};

function makeEntity(opts: {
  name: string;
  legacyKind?: string;
  lifecycle?: string;
  tags?: string[];
  spec?: Record<string, unknown>;
  annotations?: Record<string, string>;
}): BackstageEntity {
  const legacyKind = opts.legacyKind ?? "application";
  const kindInfo = KIND_MAP[legacyKind] ?? { apiVersion: BACKSTAGE_API, kind: "Component", specType: "website" };

  const spec: Record<string, unknown> = {
    lifecycle: opts.lifecycle ?? "production",
    owner: "team-a",
  };
  if (kindInfo.specType) spec.type = kindInfo.specType;
  if (opts.spec) Object.assign(spec, opts.spec);

  return {
    apiVersion: kindInfo.apiVersion,
    kind: kindInfo.kind,
    metadata: {
      name: opts.name,
      title: opts.name,
      description: "Test artifact",
      ...(opts.tags && { tags: opts.tags }),
      annotations: {
        "anchored-spec.dev/confidence": "declared",
        ...opts.annotations,
      },
    },
    spec,
  };
}

/** Get the expected entity ref ID for a given entity. */
function entityId(kind: string, name: string): string {
  return `${kind.toLowerCase()}:${name}`;
}

// ─── deepEqual ──────────────────────────────────────────────────────────────────

describe("deepEqual", () => {
  it("compares primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "b")).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it("compares arrays", () => {
    expect(deepEqual([1, 2], [1, 2])).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([1], [1, 2])).toBe(false);
  });

  it("compares objects", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("compares nested structures", () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
  });
});

// ─── getFieldSemantic ───────────────────────────────────────────────────────────

describe("getFieldSemantic", () => {
  it("classifies identity fields", () => {
    expect(getFieldSemantic("id")).toBe("identity");
    expect(getFieldSemantic("kind")).toBe("identity");
    expect(getFieldSemantic("schemaVersion")).toBe("identity");
    expect(getFieldSemantic("apiVersion")).toBe("identity");
    expect(getFieldSemantic("name")).toBe("identity");
  });

  it("classifies metadata fields", () => {
    expect(getFieldSemantic("title")).toBe("metadata");
    expect(getFieldSemantic("summary")).toBe("metadata");
    expect(getFieldSemantic("owners")).toBe("metadata");
    expect(getFieldSemantic("tags")).toBe("metadata");
    expect(getFieldSemantic("description")).toBe("metadata");
  });

  it("classifies structural fields", () => {
    expect(getFieldSemantic("relations")).toBe("structural");
    expect(getFieldSemantic("anchors")).toBe("structural");
    expect(getFieldSemantic("anchors.apis")).toBe("structural");
    expect(getFieldSemantic("traceRefs")).toBe("structural");
    expect(getFieldSemantic("dependsOn")).toBe("structural");
  });

  it("classifies behavioral fields", () => {
    expect(getFieldSemantic("status")).toBe("behavioral");
    expect(getFieldSemantic("confidence")).toBe("behavioral");
    expect(getFieldSemantic("risk")).toBe("behavioral");
    expect(getFieldSemantic("lifecycle")).toBe("behavioral");
  });

  it("classifies governance fields", () => {
    expect(getFieldSemantic("compliance")).toBe("governance");
    expect(getFieldSemantic("extensions")).toBe("governance");
    expect(getFieldSemantic("annotations")).toBe("governance");
  });

  it("classifies unknown fields as contractual", () => {
    expect(getFieldSemantic("protocol")).toBe("contractual");
    expect(getFieldSemantic("specFormat")).toBe("contractual");
    expect(getFieldSemantic("attributes")).toBe("contractual");
    expect(getFieldSemantic("tables")).toBe("contractual");
  });

  it("resolves dot-paths using deepest matching segment", () => {
    expect(getFieldSemantic("annotations.anchored-spec.dev/confidence")).toBe("governance");
    expect(getFieldSemantic("foo.lifecycle")).toBe("behavioral");
    expect(getFieldSemantic("some.unknown.field")).toBe("contractual");
  });
});

// ─── diffEaArtifacts ────────────────────────────────────────────────────────────

describe("diffEaArtifacts", () => {
  it("returns empty report for identical sets", () => {
    const artifacts = [
      makeEntity({ name: "APP-a", legacyKind: "application" }),
    ];
    const report = diffEaArtifacts(artifacts, [...artifacts]);
    expect(report.summary.added).toBe(0);
    expect(report.summary.removed).toBe(0);
    expect(report.summary.modified).toBe(0);
    expect(report.summary.unchanged).toBe(1);
    expect(report.diffs).toHaveLength(1);
    expect(report.diffs[0].changeType).toBe("unchanged");
  });

  it("detects all added when base is empty", () => {
    const head = [
      makeEntity({ name: "APP-a", legacyKind: "application" }),
      makeEntity({ name: "SVC-b", legacyKind: "service" }),
    ];
    const report = diffEaArtifacts([], head);
    expect(report.summary.added).toBe(2);
    expect(report.summary.removed).toBe(0);
    expect(report.diffs.every((d) => d.changeType === "added")).toBe(true);
  });

  it("detects all removed when head is empty", () => {
    const base = [
      makeEntity({ name: "APP-a", legacyKind: "application" }),
      makeEntity({ name: "SVC-b", legacyKind: "service" }),
    ];
    const report = diffEaArtifacts(base, []);
    expect(report.summary.removed).toBe(2);
    expect(report.summary.added).toBe(0);
    expect(report.diffs.every((d) => d.changeType === "removed")).toBe(true);
  });

  it("detects field modifications", () => {
    const base = [makeEntity({ name: "APP-a", legacyKind: "application", lifecycle: "development" })];
    const head = [makeEntity({ name: "APP-a", legacyKind: "application", lifecycle: "production" })];
    const report = diffEaArtifacts(base, head);

    expect(report.summary.modified).toBe(1);
    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    expect(diff).toBeDefined();

    const lifecycleChange = diff.fieldChanges.find((fc) => fc.field === "lifecycle");
    expect(lifecycleChange).toBeDefined();
    expect(lifecycleChange!.changeType).toBe("modified");
    expect(lifecycleChange!.oldValue).toBe("development");
    expect(lifecycleChange!.newValue).toBe("production");
    expect(lifecycleChange!.semantic).toBe("behavioral");
  });

  it("detects added and removed fields", () => {
    const base = [makeEntity({ name: "APP-a", legacyKind: "application", tags: ["v1"] })];
    const head = [makeEntity({
      name: "APP-a",
      legacyKind: "application",
      spec: { compliance: { frameworks: ["SOC2"] } },
    })];
    const report = diffEaArtifacts(base, head);

    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    expect(diff.fieldChanges.some((fc) => fc.field.startsWith("tags") && fc.changeType === "removed")).toBe(true);
    expect(diff.fieldChanges.some((fc) => fc.field === "compliance" && fc.changeType === "added")).toBe(true);
  });

  it("diffs relations using set semantics", () => {
    const base = [makeEntity({
      name: "APP-a",
      legacyKind: "application",
      spec: {
        uses: ["SVC-b"],
        dependsOn: ["APP-c"],
      },
    })];
    const head = [makeEntity({
      name: "APP-a",
      legacyKind: "application",
      spec: {
        uses: ["SVC-b", "SVC-d"],
      },
    })];
    const report = diffEaArtifacts(base, head);

    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    expect(diff.relationChanges).toHaveLength(2);
    expect(diff.relationChanges.find((r) => r.changeType === "added" && r.target === "SVC-d")).toBeDefined();
    expect(diff.relationChanges.find((r) => r.changeType === "removed" && r.target === "APP-c")).toBeDefined();
  });

  it("diffs string arrays (tags) with set semantics", () => {
    const base = [makeEntity({ name: "APP-a", legacyKind: "application", tags: ["a", "b", "c"] })];
    const head = [makeEntity({ name: "APP-a", legacyKind: "application", tags: ["b", "c", "d"] })];
    const report = diffEaArtifacts(base, head);

    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    const tagAdded = diff.fieldChanges.find((fc) => fc.field === "tags[+]" && fc.newValue === "d");
    const tagRemoved = diff.fieldChanges.find((fc) => fc.field === "tags[-]" && fc.oldValue === "a");
    expect(tagAdded).toBeDefined();
    expect(tagRemoved).toBeDefined();
  });

  it("diffs traceRefs using path as key", () => {
    const base = [makeEntity({
      name: "APP-a",
      legacyKind: "application",
      spec: {
        traceRefs: [
          { path: "docs/spec.md", role: "specification" },
          { path: "docs/old.md" },
        ],
      },
    })];
    const head = [makeEntity({
      name: "APP-a",
      legacyKind: "application",
      spec: {
        traceRefs: [
          { path: "docs/spec.md", role: "evidence" },
          { path: "docs/new.md" },
        ],
      },
    })];
    const report = diffEaArtifacts(base, head);

    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    expect(diff.fieldChanges.find((fc) => fc.field === "traceRefs[+]" && fc.changeType === "added")).toBeDefined();
    expect(diff.fieldChanges.find((fc) => fc.field === "traceRefs[-]" && fc.changeType === "removed")).toBeDefined();
    expect(diff.fieldChanges.find((fc) => fc.field === "traceRefs[docs/spec.md]" && fc.changeType === "modified")).toBeDefined();
  });

  it("diffs anchors sub-fields", () => {
    const base = [makeEntity({
      name: "APP-a",
      legacyKind: "application",
      spec: {
        anchors: { symbols: ["ClassA", "ClassB"], apis: ["GET /health"] },
      },
    })];
    const head = [makeEntity({
      name: "APP-a",
      legacyKind: "application",
      spec: {
        anchors: { symbols: ["ClassB", "ClassC"], events: ["order.created"] },
      },
    })];
    const report = diffEaArtifacts(base, head);

    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    expect(diff.fieldChanges.some((fc) => fc.field === "anchors.symbols[+]" && fc.newValue === "ClassC")).toBe(true);
    expect(diff.fieldChanges.some((fc) => fc.field === "anchors.symbols[-]" && fc.oldValue === "ClassA")).toBe(true);
    expect(diff.fieldChanges.some((fc) => fc.field === "anchors.apis" && fc.changeType === "removed")).toBe(true);
    expect(diff.fieldChanges.some((fc) => fc.field === "anchors.events" && fc.changeType === "added")).toBe(true);
  });

  it("classifies kind-specific fields as contractual", () => {
    const base = [makeEntity({
      name: "API-a",
      legacyKind: "api-contract",
      spec: { protocol: "rest" },
    })];
    const head = [makeEntity({
      name: "API-a",
      legacyKind: "api-contract",
      spec: { protocol: "grpc" },
    })];

    const report = diffEaArtifacts(base, head);
    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    const protocolChange = diff.fieldChanges.find((fc) => fc.field === "protocol");
    expect(protocolChange).toBeDefined();
    expect(protocolChange!.semantic).toBe("contractual");
  });

  it("computes domain summary correctly", () => {
    const base = [
      makeEntity({ name: "APP-a", legacyKind: "application" }),
      makeEntity({ name: "CE-b", legacyKind: "canonical-entity" }),
    ];
    const head = [
      makeEntity({ name: "APP-a", legacyKind: "application", lifecycle: "deprecated" }),
      makeEntity({ name: "CAP-c", legacyKind: "capability" }),
    ];
    const report = diffEaArtifacts(base, head);

    // APP-a modified (systems), CE-b removed (information), CAP-c added (business)
    expect(report.summary.byDomain["systems"]?.modified).toBe(1);
    expect(report.summary.byDomain["information"]?.removed).toBe(1);
    expect(report.summary.byDomain["business"]?.added).toBe(1);
  });

  it("sorts diffs: added → removed → modified → unchanged", () => {
    const base = [
      makeEntity({ name: "APP-a", legacyKind: "application" }),
      makeEntity({ name: "APP-b", legacyKind: "application" }),
      makeEntity({ name: "APP-c", legacyKind: "application" }),
    ];
    const head = [
      makeEntity({ name: "APP-a", legacyKind: "application" }),
      makeEntity({ name: "APP-b", legacyKind: "application", lifecycle: "deprecated" }),
      makeEntity({ name: "APP-d", legacyKind: "application" }),
    ];
    const report = diffEaArtifacts(base, head);
    const types = report.diffs.map((d) => d.changeType);
    expect(types).toEqual(["added", "removed", "modified", "unchanged"]);
  });

  it("includes baseRef and headRef in report", () => {
    const report = diffEaArtifacts([], [], { baseRef: "main", headRef: "feat/x" });
    expect(report.baseRef).toBe("main");
    expect(report.headRef).toBe("feat/x");
  });

  it("handles empty inputs", () => {
    const report = diffEaArtifacts([], []);
    expect(report.summary.added).toBe(0);
    expect(report.summary.removed).toBe(0);
    expect(report.summary.modified).toBe(0);
    expect(report.summary.unchanged).toBe(0);
    expect(report.diffs).toHaveLength(0);
  });

  it("counts semantic totals", () => {
    const base = [makeEntity({
      name: "APP-a",
      legacyKind: "application",
      lifecycle: "development",
      tags: ["old"],
    })];
    const head = [makeEntity({
      name: "APP-a",
      legacyKind: "application",
      lifecycle: "production",
      tags: ["new"],
      spec: { uses: ["SVC-b"] },
    })];
    const report = diffEaArtifacts(base, head);

    expect(report.summary.bySemantic.behavioral).toBeGreaterThan(0); // lifecycle change
    expect(report.summary.bySemantic.metadata).toBeGreaterThan(0); // tags change
    expect(report.summary.bySemantic.structural).toBeGreaterThan(0); // relation added
  });
});

// ─── renderDiffSummary ──────────────────────────────────────────────────────────

describe("renderDiffSummary", () => {
  it("returns 'No changes detected' for empty report", () => {
    const report = diffEaArtifacts([], []);
    expect(renderDiffSummary(report)).toBe("No changes detected");
  });

  it("summarizes changes", () => {
    const base = [makeEntity({ name: "APP-a", legacyKind: "application" })];
    const head = [
      makeEntity({ name: "APP-a", legacyKind: "application", lifecycle: "deprecated" }),
      makeEntity({ name: "APP-b", legacyKind: "application" }),
    ];
    const summary = renderDiffSummary(diffEaArtifacts(base, head));
    expect(summary).toContain("1 added");
    expect(summary).toContain("1 modified");
  });
});

// ─── renderDiffMarkdown ─────────────────────────────────────────────────────────

describe("renderDiffMarkdown", () => {
  it("renders header with refs", () => {
    const report = diffEaArtifacts([], [], { baseRef: "main", headRef: "dev" });
    const md = renderDiffMarkdown(report);
    expect(md).toContain("# EA Spec Diff: main..dev");
  });

  it("renders added section", () => {
    const head = [makeEntity({ name: "APP-new", legacyKind: "application" })];
    const md = renderDiffMarkdown(diffEaArtifacts([], head));
    expect(md).toContain("## Added (1)");
    expect(md).toContain("APP-new");
  });

  it("renders removed section", () => {
    const base = [makeEntity({ name: "APP-old", legacyKind: "application" })];
    const md = renderDiffMarkdown(diffEaArtifacts(base, []));
    expect(md).toContain("## Removed (1)");
    expect(md).toContain("APP-old");
  });

  it("renders modified section with field changes", () => {
    const base = [makeEntity({ name: "APP-a", legacyKind: "application", lifecycle: "development" })];
    const head = [makeEntity({ name: "APP-a", legacyKind: "application", lifecycle: "production" })];
    const md = renderDiffMarkdown(diffEaArtifacts(base, head));
    expect(md).toContain("## Modified (1)");
    expect(md).toContain("APP-a");
    expect(md).toContain("lifecycle");
    expect(md).toContain("behavioral");
  });

  it("renders relation changes table", () => {
    const base = [makeEntity({ name: "APP-a", legacyKind: "application" })];
    const head = [makeEntity({
      name: "APP-a",
      legacyKind: "application",
      spec: { uses: ["SVC-b"] },
    })];
    const md = renderDiffMarkdown(diffEaArtifacts(base, head));
    expect(md).toContain("uses");
    expect(md).toContain("SVC-b");
  });
});
