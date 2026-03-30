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
import type { EaArtifactBase } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<EaArtifactBase> & { id: string; kind: string }): EaArtifactBase {
  return {
    schemaVersion: "1.0",
    title: overrides.id,
    status: "active",
    summary: "Test artifact",
    owners: ["team-a"],
    confidence: "declared",
    ...overrides,
  } as EaArtifactBase;
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
  });

  it("classifies metadata fields", () => {
    expect(getFieldSemantic("title")).toBe("metadata");
    expect(getFieldSemantic("summary")).toBe("metadata");
    expect(getFieldSemantic("owners")).toBe("metadata");
    expect(getFieldSemantic("tags")).toBe("metadata");
  });

  it("classifies structural fields", () => {
    expect(getFieldSemantic("relations")).toBe("structural");
    expect(getFieldSemantic("anchors")).toBe("structural");
    expect(getFieldSemantic("anchors.apis")).toBe("structural");
    expect(getFieldSemantic("traceRefs")).toBe("structural");
  });

  it("classifies behavioral fields", () => {
    expect(getFieldSemantic("status")).toBe("behavioral");
    expect(getFieldSemantic("confidence")).toBe("behavioral");
    expect(getFieldSemantic("risk")).toBe("behavioral");
  });

  it("classifies governance fields", () => {
    expect(getFieldSemantic("compliance")).toBe("governance");
    expect(getFieldSemantic("extensions")).toBe("governance");
  });

  it("classifies unknown fields as contractual", () => {
    expect(getFieldSemantic("protocol")).toBe("contractual");
    expect(getFieldSemantic("specFormat")).toBe("contractual");
    expect(getFieldSemantic("attributes")).toBe("contractual");
    expect(getFieldSemantic("tables")).toBe("contractual");
  });
});

// ─── diffEaArtifacts ────────────────────────────────────────────────────────────

describe("diffEaArtifacts", () => {
  it("returns empty report for identical sets", () => {
    const artifacts = [
      makeArtifact({ id: "APP-a", kind: "application" }),
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
      makeArtifact({ id: "APP-a", kind: "application" }),
      makeArtifact({ id: "SVC-b", kind: "service" }),
    ];
    const report = diffEaArtifacts([], head);
    expect(report.summary.added).toBe(2);
    expect(report.summary.removed).toBe(0);
    expect(report.diffs.every((d) => d.changeType === "added")).toBe(true);
  });

  it("detects all removed when head is empty", () => {
    const base = [
      makeArtifact({ id: "APP-a", kind: "application" }),
      makeArtifact({ id: "SVC-b", kind: "service" }),
    ];
    const report = diffEaArtifacts(base, []);
    expect(report.summary.removed).toBe(2);
    expect(report.summary.added).toBe(0);
    expect(report.diffs.every((d) => d.changeType === "removed")).toBe(true);
  });

  it("detects field modifications", () => {
    const base = [makeArtifact({ id: "APP-a", kind: "application", status: "draft" })];
    const head = [makeArtifact({ id: "APP-a", kind: "application", status: "active" })];
    const report = diffEaArtifacts(base, head);

    expect(report.summary.modified).toBe(1);
    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    expect(diff).toBeDefined();

    const statusChange = diff.fieldChanges.find((fc) => fc.field === "status");
    expect(statusChange).toBeDefined();
    expect(statusChange!.changeType).toBe("modified");
    expect(statusChange!.oldValue).toBe("draft");
    expect(statusChange!.newValue).toBe("active");
    expect(statusChange!.semantic).toBe("behavioral");
  });

  it("detects added and removed fields", () => {
    const base = [makeArtifact({ id: "APP-a", kind: "application", tags: ["v1"] })];
    const head = [makeArtifact({
      id: "APP-a",
      kind: "application",
      compliance: { frameworks: ["SOC2"] },
    })];
    const report = diffEaArtifacts(base, head);

    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    expect(diff.fieldChanges.some((fc) => fc.field.startsWith("tags") && fc.changeType === "removed")).toBe(true);
    expect(diff.fieldChanges.some((fc) => fc.field === "compliance" && fc.changeType === "added")).toBe(true);
  });

  it("diffs relations using set semantics", () => {
    const base = [makeArtifact({
      id: "APP-a",
      kind: "application",
      relations: [
        { type: "uses", target: "SVC-b" },
        { type: "dependsOn", target: "APP-c" },
      ],
    })];
    const head = [makeArtifact({
      id: "APP-a",
      kind: "application",
      relations: [
        { type: "uses", target: "SVC-b" },
        { type: "uses", target: "SVC-d" },
      ],
    })];
    const report = diffEaArtifacts(base, head);

    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    expect(diff.relationChanges).toHaveLength(2);
    expect(diff.relationChanges.find((r) => r.changeType === "added" && r.target === "SVC-d")).toBeDefined();
    expect(diff.relationChanges.find((r) => r.changeType === "removed" && r.target === "APP-c")).toBeDefined();
  });

  it("diffs string arrays (tags) with set semantics", () => {
    const base = [makeArtifact({ id: "APP-a", kind: "application", tags: ["a", "b", "c"] })];
    const head = [makeArtifact({ id: "APP-a", kind: "application", tags: ["b", "c", "d"] })];
    const report = diffEaArtifacts(base, head);

    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    const tagAdded = diff.fieldChanges.find((fc) => fc.field === "tags[+]" && fc.newValue === "d");
    const tagRemoved = diff.fieldChanges.find((fc) => fc.field === "tags[-]" && fc.oldValue === "a");
    expect(tagAdded).toBeDefined();
    expect(tagRemoved).toBeDefined();
  });

  it("diffs traceRefs using path as key", () => {
    const base = [makeArtifact({
      id: "APP-a",
      kind: "application",
      traceRefs: [
        { path: "docs/spec.md", role: "specification" as const },
        { path: "docs/old.md" },
      ],
    })];
    const head = [makeArtifact({
      id: "APP-a",
      kind: "application",
      traceRefs: [
        { path: "docs/spec.md", role: "evidence" as const },
        { path: "docs/new.md" },
      ],
    })];
    const report = diffEaArtifacts(base, head);

    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    expect(diff.fieldChanges.find((fc) => fc.field === "traceRefs[+]" && fc.changeType === "added")).toBeDefined();
    expect(diff.fieldChanges.find((fc) => fc.field === "traceRefs[-]" && fc.changeType === "removed")).toBeDefined();
    expect(diff.fieldChanges.find((fc) => fc.field === "traceRefs[docs/spec.md]" && fc.changeType === "modified")).toBeDefined();
  });

  it("diffs anchors sub-fields", () => {
    const base = [makeArtifact({
      id: "APP-a",
      kind: "application",
      anchors: { symbols: ["ClassA", "ClassB"], apis: ["GET /health"] },
    })];
    const head = [makeArtifact({
      id: "APP-a",
      kind: "application",
      anchors: { symbols: ["ClassB", "ClassC"], events: ["order.created"] },
    })];
    const report = diffEaArtifacts(base, head);

    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    expect(diff.fieldChanges.some((fc) => fc.field === "anchors.symbols[+]" && fc.newValue === "ClassC")).toBe(true);
    expect(diff.fieldChanges.some((fc) => fc.field === "anchors.symbols[-]" && fc.oldValue === "ClassA")).toBe(true);
    expect(diff.fieldChanges.some((fc) => fc.field === "anchors.apis" && fc.changeType === "removed")).toBe(true);
    expect(diff.fieldChanges.some((fc) => fc.field === "anchors.events" && fc.changeType === "added")).toBe(true);
  });

  it("classifies kind-specific fields as contractual", () => {
    const base = [makeArtifact({
      id: "API-a",
      kind: "api-contract",
      // kind-specific field
    })];
    // Add a kind-specific field
    (base[0] as Record<string, unknown>).protocol = "rest";
    const head = [makeArtifact({ id: "API-a", kind: "api-contract" })];
    (head[0] as Record<string, unknown>).protocol = "grpc";

    const report = diffEaArtifacts(base, head);
    const diff = report.diffs.find((d) => d.changeType === "modified")!;
    const protocolChange = diff.fieldChanges.find((fc) => fc.field === "protocol");
    expect(protocolChange).toBeDefined();
    expect(protocolChange!.semantic).toBe("contractual");
  });

  it("computes domain summary correctly", () => {
    const base = [
      makeArtifact({ id: "APP-a", kind: "application" }),
      makeArtifact({ id: "CE-b", kind: "canonical-entity" }),
    ];
    const head = [
      makeArtifact({ id: "APP-a", kind: "application", status: "deprecated" }),
      makeArtifact({ id: "CAP-c", kind: "capability" }),
    ];
    const report = diffEaArtifacts(base, head);

    // APP-a modified (systems), CE-b removed (information), CAP-c added (business)
    expect(report.summary.byDomain["systems"]?.modified).toBe(1);
    expect(report.summary.byDomain["information"]?.removed).toBe(1);
    expect(report.summary.byDomain["business"]?.added).toBe(1);
  });

  it("sorts diffs: added → removed → modified → unchanged", () => {
    const base = [
      makeArtifact({ id: "APP-a", kind: "application" }),
      makeArtifact({ id: "APP-b", kind: "application" }),
      makeArtifact({ id: "APP-c", kind: "application" }),
    ];
    const head = [
      makeArtifact({ id: "APP-a", kind: "application" }),
      makeArtifact({ id: "APP-b", kind: "application", status: "deprecated" }),
      makeArtifact({ id: "APP-d", kind: "application" }),
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
    const base = [makeArtifact({
      id: "APP-a",
      kind: "application",
      status: "draft",
      tags: ["old"],
    })];
    const head = [makeArtifact({
      id: "APP-a",
      kind: "application",
      status: "active",
      tags: ["new"],
      relations: [{ type: "uses", target: "SVC-b" }],
    })];
    const report = diffEaArtifacts(base, head);

    expect(report.summary.bySemantic.behavioral).toBeGreaterThan(0); // status change
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
    const base = [makeArtifact({ id: "APP-a", kind: "application" })];
    const head = [
      makeArtifact({ id: "APP-a", kind: "application", status: "deprecated" }),
      makeArtifact({ id: "APP-b", kind: "application" }),
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
    const head = [makeArtifact({ id: "APP-new", kind: "application" })];
    const md = renderDiffMarkdown(diffEaArtifacts([], head));
    expect(md).toContain("## Added (1)");
    expect(md).toContain("APP-new");
  });

  it("renders removed section", () => {
    const base = [makeArtifact({ id: "APP-old", kind: "application" })];
    const md = renderDiffMarkdown(diffEaArtifacts(base, []));
    expect(md).toContain("## Removed (1)");
    expect(md).toContain("APP-old");
  });

  it("renders modified section with field changes", () => {
    const base = [makeArtifact({ id: "APP-a", kind: "application", status: "draft" })];
    const head = [makeArtifact({ id: "APP-a", kind: "application", status: "active" })];
    const md = renderDiffMarkdown(diffEaArtifacts(base, head));
    expect(md).toContain("## Modified (1)");
    expect(md).toContain("### APP-a");
    expect(md).toContain("status");
    expect(md).toContain("behavioral");
  });

  it("renders relation changes table", () => {
    const base = [makeArtifact({ id: "APP-a", kind: "application", relations: [] })];
    const head = [makeArtifact({
      id: "APP-a",
      kind: "application",
      relations: [{ type: "uses", target: "SVC-b" }],
    })];
    const md = renderDiffMarkdown(diffEaArtifacts(base, head));
    expect(md).toContain("uses");
    expect(md).toContain("SVC-b");
  });
});
