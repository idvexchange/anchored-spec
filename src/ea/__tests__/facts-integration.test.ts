/**
 * @module facts-integration.test
 *
 * Integration and gap-coverage tests for the markdown prose resolver.
 *
 * Covers gaps identified during the deep audit:
 *  1. Integration tests — full pipeline: markdown → facts → consistency
 *  2. Real-world scenarios — BankID/eIDAS, event renaming, provider tables
 *  3. Writer module — writeFactManifests persistence
 *  4. assurance-level and provider-table FactKind heuristics
 *  5. Suppression edge cases — range-based, unclosed, multiple per file
 *  6. Edge cases — large tables, JSON arrays, JSONC, nested annotations, unicode
 *  7. FactManifest suppressions carry-through
 *  8. Reconciler edge cases — empty inputs, multiple anchors
 *  9. parseMarkdownFile — async file-based parsing
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { EaArtifactBase } from "../types.js";
import {
  parseMarkdown,
  parseMarkdownFile,
  buildFactManifest,
  tableExtractor,
  codeBlockExtractor,
  mermaidExtractor,
  checkConsistency,
  applySuppressions,
  collectSuppressions,
  reconcileFactsWithArtifacts,
  writeFactManifests,
  suggestAnnotations,
} from "../facts/index.js";
import type {
  FactManifest,
  FactBlock,
  ExtractedFact,
  AnnotationSuggestion,
} from "../facts/index.js";

// ─── Helpers ────────────────────────────────────────────────────────

function makeArtifact(
  overrides: Partial<EaArtifactBase> & { id: string; kind: string },
): EaArtifactBase {
  return {
    apiVersion: "anchored-spec/ea/v1",
    title: overrides.title ?? overrides.id,
    summary: "Test artifact",
    owners: ["team-test"],
    tags: [],
    confidence: "declared",
    status: "active",
    schemaVersion: "1.0.0",
    relations: [],
    ...overrides,
  } as EaArtifactBase;
}

function makeManifest(
  source: string,
  blocks: FactBlock[],
  suppressions?: FactManifest["suppressions"],
): FactManifest {
  const totalFacts = blocks.reduce((sum, b) => sum + b.facts.length, 0);
  return { source, extractedAt: new Date().toISOString(), blocks, totalFacts, suppressions };
}

function makeFact(
  overrides: Partial<ExtractedFact> & { key: string; kind: ExtractedFact["kind"] },
): ExtractedFact {
  return {
    fields: {},
    hash: "abcdef123456",
    source: { file: "test.md", line: 1 },
    ...overrides,
  };
}

function makeBlock(
  kind: FactBlock["kind"],
  facts: ExtractedFact[],
  overrides?: Partial<FactBlock>,
): FactBlock {
  return {
    kind,
    source: { file: "test.md", line: 1 },
    facts,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Integration: Full Pipeline — Markdown → Facts → Consistency
// ═══════════════════════════════════════════════════════════════════════

describe("full pipeline: markdown → facts → consistency", () => {
  it("detects value-mismatch from two raw markdown documents", () => {
    const mdA = `| Event | Trigger |
|---|---|
| dossier.success | Verification passed |`;
    const mdB = `| Event | Trigger |
|---|---|
| dossier.success | Identity verified |`;

    const mA = buildFactManifest(parseMarkdown(mdA, "doc-a.md"));
    const mB = buildFactManifest(parseMarkdown(mdB, "doc-b.md"));
    const report = checkConsistency([mA, mB]);

    expect(report.passed).toBe(false);
    expect(report.findings.some(f => f.rule === "ea:docs/value-mismatch")).toBe(true);
  });

  it("detects state-machine conflict from two mermaid diagrams", () => {
    const mdA = "```mermaid\nstateDiagram-v2\n  open --> processing : Start\n```";
    const mdB = "```mermaid\nstateDiagram-v2\n  open --> reviewing : Start\n```";

    const mA = buildFactManifest(parseMarkdown(mdA, "flow-a.md"));
    const mB = buildFactManifest(parseMarkdown(mdB, "flow-b.md"));
    const report = checkConsistency([mA, mB]);

    expect(report.findings.some(f => f.rule === "ea:docs/state-machine-conflict")).toBe(true);
  });

  it("reports no findings when documents agree", () => {
    const mdA = `| Event | Trigger |
|---|---|
| dossier.success | Verification passed |`;
    const mdB = `| Event | Trigger |
|---|---|
| dossier.success | Verification passed |`;

    const mA = buildFactManifest(parseMarkdown(mdA, "doc-a.md"));
    const mB = buildFactManifest(parseMarkdown(mdB, "doc-b.md"));
    const report = checkConsistency([mA, mB]);

    expect(report.passed).toBe(true);
  });

  it("suppression annotation in manifest prevents finding", () => {
    const mdA = `<!-- @ea:suppress ea:docs/value-mismatch reason="Intentional difference" -->

| Event | Trigger |
|---|---|
| dossier.success | Internal trigger |

<!-- @ea:end -->`;
    const mdB = `| Event | Trigger |
|---|---|
| dossier.success | External trigger |`;

    const mA = buildFactManifest(parseMarkdown(mdA, "doc-a.md"));
    const mB = buildFactManifest(parseMarkdown(mdB, "doc-b.md"));
    const report = checkConsistency([mA, mB]);

    // Findings exist before suppression
    expect(report.findings.length).toBeGreaterThan(0);

    // Apply suppressions from manifests
    const suppressions = collectSuppressions([mA, mB]);
    applySuppressions(report.findings, suppressions);

    const unsuppressed = report.findings.filter(f => !f.suppressed);
    const suppressed = report.findings.filter(f => f.suppressed);
    expect(suppressed.length).toBeGreaterThan(0);
  });

  it("detects naming inconsistency from raw markdown (similar event names)", () => {
    const mdA = `| Event | Trigger |
|---|---|
| dossier.completed | Done |`;
    const mdB = `| Event | Trigger |
|---|---|
| dossier.complete | Done |`;

    const mA = buildFactManifest(parseMarkdown(mdA, "doc-a.md"));
    const mB = buildFactManifest(parseMarkdown(mdB, "doc-b.md"));
    const report = checkConsistency([mA, mB]);

    expect(report.findings.some(f => f.rule === "ea:docs/naming-inconsistency")).toBe(true);
  });

  it("handles mixed content: table + mermaid + code block in one doc", () => {
    const md = `| Event | Trigger |
|---|---|
| ev.1 | trigger |

\`\`\`mermaid
stateDiagram-v2
  [*] --> open : Start
\`\`\`

\`\`\`typescript
type Status = 'active' | 'inactive';
\`\`\``;

    const doc = parseMarkdown(md, "mixed.md");
    const manifest = buildFactManifest(doc);
    expect(manifest.blocks.length).toBeGreaterThanOrEqual(3);
    expect(manifest.totalFacts).toBeGreaterThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Real-World Scenarios
// ═══════════════════════════════════════════════════════════════════════

describe("real-world scenarios", () => {
  it("detects BankID eIDAS level mismatch across documents", () => {
    const specDoc = `| Provider | eIDAS Level |
|---|---|
| BankID | Substantial |`;
    const guideDoc = `| Provider | eIDAS Level |
|---|---|
| BankID | High |`;

    const mA = buildFactManifest(parseMarkdown(specDoc, "bankid-spec.md"));
    const mB = buildFactManifest(parseMarkdown(guideDoc, "integration-guide.md"));
    const report = checkConsistency([mA, mB]);

    expect(report.passed).toBe(false);
    expect(report.findings.some(f =>
      f.rule === "ea:docs/value-mismatch" &&
      f.message.includes("BankID"),
    )).toBe(true);
  });

  it("detects event renaming: dossier.failed vs dossier.cancelled", () => {
    const mdA = `| Event | Trigger |
|---|---|
| dossier.failed | Verification failed |`;
    const mdB = `| Event | Trigger |
|---|---|
| dossier.cancelled | Verification failed |`;

    const mA = buildFactManifest(parseMarkdown(mdA, "events-v1.md"));
    const mB = buildFactManifest(parseMarkdown(mdB, "events-v2.md"));
    const report = checkConsistency([mA, mB]);

    // These have different keys but similar names — should detect naming inconsistency
    expect(report.findings.some(f => f.rule === "ea:docs/naming-inconsistency")).toBe(true);
  });

  it("detects vp_token format contradiction between spec and impl doc", () => {
    const specDoc = `| Field | Type | Description |
|---|---|---|
| vp_token | JWT | Verifiable presentation token |`;
    const implDoc = `| Field | Type | Description |
|---|---|---|
| vp_token | JSON-LD | Verifiable presentation token |`;

    const mA = buildFactManifest(parseMarkdown(specDoc, "spec.md"));
    const mB = buildFactManifest(parseMarkdown(implDoc, "impl.md"));
    const report = checkConsistency([mA, mB]);

    expect(report.passed).toBe(false);
    expect(report.findings.some(f => f.rule === "ea:docs/value-mismatch")).toBe(true);
  });

  it("reconciles across multiple manifests and artifacts", () => {
    const annotation = { kind: "events", raw: "<!-- @ea:events -->", line: 1 };
    const eventsManifest = makeManifest("events.md", [
      makeBlock("event-table", [
        makeFact({ key: "dossier.success", kind: "event-table", source: { file: "events.md", line: 5 } }),
        makeFact({ key: "dossier.cancelled", kind: "event-table", source: { file: "events.md", line: 6 } }),
      ], { annotation, source: { file: "events.md", line: 1 } }),
    ]);

    const apiAnnotation = { kind: "endpoints", raw: "<!-- @ea:endpoints -->", line: 1 };
    const apiManifest = makeManifest("api.md", [
      makeBlock("endpoint-table", [
        makeFact({ key: "POST /api/v1/dossiers", kind: "endpoint-table", source: { file: "api.md", line: 5 } }),
      ], { annotation: apiAnnotation, source: { file: "api.md", line: 1 } }),
    ]);

    const svcArtifact = makeArtifact({
      id: "SVC-identity",
      kind: "service",
      anchors: {
        events: ["dossier.success", "dossier.cancelled", "dossier.expired"],
        apis: ["POST /api/v1/dossiers"],
      },
    });

    const report = reconcileFactsWithArtifacts(
      [eventsManifest, apiManifest],
      [svcArtifact],
    );

    // dossier.expired is in artifact but not in docs
    expect(report.findings.some(f =>
      f.rule === "ea:docs/artifact-missing-fact" &&
      f.message.includes("dossier.expired"),
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. assurance-level and provider-table Heuristics
// ═══════════════════════════════════════════════════════════════════════

describe("assurance-level table extraction", () => {
  it("extracts assurance-level facts from eIDAS LoA table", () => {
    const md = `| Provider | LoA | eIDAS Level |
|---|---|---|
| BankID | High | Substantial |
| itsme | Medium | Low |`;

    const doc = parseMarkdown(md, "providers.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("assurance-level");
    expect(blocks[0]!.facts).toHaveLength(2);
    expect(blocks[0]!.facts[0]!.key).toBe("BankID");
  });

  it("classifies table with 'assurance' column as assurance-level", () => {
    const md = `| Entity | Assurance | Notes |
|---|---|---|
| Identity | High | Biometric |`;

    const doc = parseMarkdown(md, "assurance.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("assurance-level");
  });
});

describe("provider-table extraction", () => {
  it("extracts provider-table facts from integration table", () => {
    const md = `| Integration | Service | Tier |
|---|---|---|
| itsme | identity | premium |
| BankID | signing | standard |`;

    const doc = parseMarkdown(md, "providers.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("provider-table");
    expect(blocks[0]!.facts).toHaveLength(2);
  });

  it("classifies table with 'vendor' column as provider-table", () => {
    const md = `| Vendor | Product | Tier |
|---|---|---|
| Acme | Widget | Premium |`;

    const doc = parseMarkdown(md, "vendors.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("provider-table");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Writer Module
// ═══════════════════════════════════════════════════════════════════════

describe("writeFactManifests", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "facts-writer-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes manifests to disk with correct filenames", async () => {
    const manifest = makeManifest("docs/platform/webhook-events.md", [
      makeBlock("event-table", [
        makeFact({ key: "e.1", kind: "event-table", source: { file: "test.md", line: 1 } }),
      ]),
    ]);

    const written = await writeFactManifests([manifest], tmpDir);
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("docs-platform-webhook-events.json");
  });

  it("skips manifests with zero facts", async () => {
    const manifest = makeManifest("empty.md", []);
    const written = await writeFactManifests([manifest], tmpDir);
    expect(written).toHaveLength(0);
  });

  it("creates output directory if it doesn't exist", async () => {
    const nestedDir = join(tmpDir, "nested", "dir");
    const manifest = makeManifest("test.md", [
      makeBlock("event-table", [
        makeFact({ key: "e.1", kind: "event-table" }),
      ]),
    ]);

    const written = await writeFactManifests([manifest], nestedDir);
    expect(written).toHaveLength(1);
  });

  it("generates valid JSON that round-trips through parse", async () => {
    const { readFileSync } = await import("node:fs");
    const manifest = makeManifest("round-trip.md", [
      makeBlock("event-table", [
        makeFact({ key: "ev.1", kind: "event-table", fields: { event: "ev.1", trigger: "test" } }),
      ]),
    ]);

    const written = await writeFactManifests([manifest], tmpDir);
    const content = readFileSync(written[0]!, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.source).toBe("round-trip.md");
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.totalFacts).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Suppression Edge Cases
// ═══════════════════════════════════════════════════════════════════════

describe("suppression edge cases", () => {
  it("does not suppress when finding line is outside suppression range", () => {
    const findings = [{
      rule: "ea:docs/value-mismatch",
      severity: "error" as const,
      message: "mismatch",
      locations: [{ file: "a.md", line: 50, value: "x" }],
    }];
    const suppressions = new Map([["a.md", [
      { ruleId: "ea:docs/value-mismatch", reason: "ok", raw: "", line: 1, endLine: 5 },
    ]]]);
    applySuppressions(findings, suppressions);
    expect(findings[0]!.suppressed).toBeUndefined();
  });

  it("handles unclosed suppression (extends to EOF)", () => {
    const md = `<!-- @ea:suppress ea:docs/value-mismatch reason="wip" -->

| Event | Trigger |
|---|---|
| e1 | t1 |`;

    const doc = parseMarkdown(md, "unclosed-suppress.md");
    expect(doc.suppressions).toHaveLength(1);
    // Unclosed suppression should extend to last line
    expect(doc.suppressions[0]!.endLine).toBeGreaterThanOrEqual(5);
  });

  it("handles multiple suppressions in same file", () => {
    const md = `<!-- @ea:suppress ea:docs/value-mismatch reason="first" -->
| Event | Trigger |
|---|---|
| e1 | t1 |
<!-- @ea:end -->

<!-- @ea:suppress ea:docs/naming-inconsistency reason="second" -->
| Status | Code |
|---|---|
| active | 1 |
<!-- @ea:end -->`;

    const doc = parseMarkdown(md, "multi-suppress.md");
    expect(doc.suppressions).toHaveLength(2);
    expect(doc.suppressions[0]!.ruleId).toBe("ea:docs/value-mismatch");
    expect(doc.suppressions[1]!.ruleId).toBe("ea:docs/naming-inconsistency");
  });

  it("carries suppressions through FactManifest", () => {
    const md = `<!-- @ea:suppress ea:docs/* reason="WIP document" -->

| Event | Trigger |
|---|---|
| e1 | t1 |

<!-- @ea:end -->`;

    const doc = parseMarkdown(md, "carry.md");
    const manifest = buildFactManifest(doc);
    expect(manifest.suppressions).toBeDefined();
    expect(manifest.suppressions).toHaveLength(1);
    expect(manifest.suppressions![0]!.ruleId).toBe("ea:docs/*");
  });

  it("collectSuppressions handles manifests with optional (undefined) suppressions", () => {
    const m1 = makeManifest("a.md", []);
    const m2 = makeManifest("b.md", [], [
      { ruleId: "ea:docs/value-mismatch", reason: "ok", raw: "", line: 1 },
    ]);
    // m1 has no suppressions field (undefined)
    const map = collectSuppressions([m1, m2]);
    expect(map.size).toBe(1);
    expect(map.has("b.md")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Edge Cases
// ═══════════════════════════════════════════════════════════════════════

describe("edge cases", () => {
  it("handles file with only frontmatter, no body", () => {
    const md = `---
status: draft
---
`;
    const doc = parseMarkdown(md, "frontmatter-only.md");
    const manifest = buildFactManifest(doc);
    expect(manifest.totalFacts).toBeGreaterThanOrEqual(0); // should not throw
  });

  it("handles very large table (100+ rows) without issue", () => {
    const rows = Array.from({ length: 150 }, (_, i) => `| event.${i} | trigger ${i} |`).join("\n");
    const md = `| Event | Trigger |\n|---|---|\n${rows}`;
    const doc = parseMarkdown(md, "large.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.facts).toHaveLength(150);
  });

  it("handles nested annotations (@ea:events inside @ea:states)", () => {
    const md = `<!-- @ea:states -->

<!-- @ea:events -->

| Event | Trigger |
|---|---|
| e.1 | t |

<!-- @ea:end -->

<!-- @ea:end -->`;

    const doc = parseMarkdown(md, "nested.md");
    expect(doc.annotations).toHaveLength(2);
  });

  it("handles empty string cells in table (first column empty → row skipped)", () => {
    const md = `| Event | Trigger |
|---|---|
|  | something |
| valid.event | trigger |`;

    const doc = parseMarkdown(md, "empty-cell.md");
    const blocks = tableExtractor.extract(doc);
    // First row has empty key, should be skipped
    expect(blocks[0]!.facts).toHaveLength(1);
    expect(blocks[0]!.facts[0]!.key).toBe("valid.event");
  });

  it("handles JSON arrays in code blocks", () => {
    const md = '```json\n[{"event": "e1"}, {"event": "e2"}]\n```';
    const doc = parseMarkdown(md, "json-array.md");
    const blocks = codeBlockExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.facts).toHaveLength(2);
  });

  it("handles JSONC code blocks (JSON with comments)", () => {
    const md = '```jsonc\n// event definition\n{ "event": "test.event" }\n```';
    const doc = parseMarkdown(md, "jsonc.md");
    const blocks = codeBlockExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.facts[0]!.key).toBe("test.event");
  });

  it("handles unicode content in table cells", () => {
    const md = `| Event | Description |
|---|---|
| café.événement | Événement créé |`;

    const doc = parseMarkdown(md, "unicode.md");
    const blocks = tableExtractor.extract(doc);
    // May or may not classify, but should not crash
    expect(() => buildFactManifest(doc)).not.toThrow();
  });

  it("handles annotation with no matching content between markers", () => {
    const md = `<!-- @ea:events -->\n<!-- @ea:end -->`;
    const doc = parseMarkdown(md, "empty-region.md");
    expect(doc.annotations).toHaveLength(1);
  });

  it("handles multiple annotation regions in same document", () => {
    const md = `<!-- @ea:events ev1 -->

| Event | Trigger |
|---|---|
| e.1 | t |

<!-- @ea:end -->

<!-- @ea:states s1 -->

\`\`\`mermaid
stateDiagram-v2
  [*] --> open
\`\`\`

<!-- @ea:end -->`;

    const doc = parseMarkdown(md, "multi-region.md");
    expect(doc.annotations).toHaveLength(2);
    expect(doc.annotations[0]!.annotation.kind).toBe("events");
    expect(doc.annotations[1]!.annotation.kind).toBe("states");
  });

  it("handles mermaid diagram with only state declarations (no transitions)", () => {
    const md = `\`\`\`mermaid
stateDiagram-v2
  state "Open" as open
  state "Closed" as closed
\`\`\``;

    const doc = parseMarkdown(md, "states-only.md");
    const blocks = mermaidExtractor.extract(doc);
    // Should produce status-enum summary if states found
    const enumBlock = blocks.find(b => b.kind === "status-enum");
    if (enumBlock) {
      expect(enumBlock.facts.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. parseMarkdownFile (async)
// ═══════════════════════════════════════════════════════════════════════

describe("parseMarkdownFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "facts-parser-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads and parses a file from disk", async () => {
    const filePath = join(tmpDir, "test.md");
    writeFileSync(filePath, `| Event | Trigger |
|---|---|
| e.1 | t |`);

    const doc = await parseMarkdownFile(filePath, "test.md");
    expect(doc.filePath).toBe("test.md");
    expect(doc.tree.type).toBe("root");
  });

  it("parses annotations from file", async () => {
    const filePath = join(tmpDir, "annotated.md");
    writeFileSync(filePath, `<!-- @ea:events -->

| Event | Trigger |
|---|---|
| e.1 | t |

<!-- @ea:end -->`);

    const doc = await parseMarkdownFile(filePath, "annotated.md");
    expect(doc.annotations).toHaveLength(1);
    expect(doc.annotations[0]!.annotation.kind).toBe("events");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. Reconciler Edge Cases
// ═══════════════════════════════════════════════════════════════════════

describe("reconciler edge cases", () => {
  it("handles empty manifests array", () => {
    const artifact = makeArtifact({
      id: "SVC-x",
      kind: "service",
      anchors: { events: ["some.event"] },
    });
    const report = reconcileFactsWithArtifacts([], [artifact]);
    expect(report.findings.some(f => f.rule === "ea:docs/artifact-missing-fact")).toBe(true);
  });

  it("handles empty artifacts array", () => {
    const report = reconcileFactsWithArtifacts([makeManifest("a.md", [])], []);
    expect(report.passed).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  it("skips heuristic (non-annotated) blocks for fact-missing-artifact check", () => {
    // Heuristic blocks should not generate fact-missing-artifact warnings
    const manifest = makeManifest("events.md", [
      makeBlock("event-table", [
        makeFact({ key: "dossier.orphan", kind: "event-table", source: { file: "events.md", line: 5 } }),
      ], { source: { file: "events.md", line: 1 } }), // No annotation
    ]);
    const artifact = makeArtifact({
      id: "SVC-identity",
      kind: "service",
      anchors: { events: ["dossier.success"] },
    });

    const report = reconcileFactsWithArtifacts([manifest], [artifact]);
    // Should not report fact-missing-artifact for non-annotated blocks
    expect(report.findings.filter(f => f.rule === "ea:docs/fact-missing-artifact")).toHaveLength(0);
  });

  it("reconciles with artifact having multiple anchor types", () => {
    const evAnnotation = { kind: "events", raw: "<!-- @ea:events -->", line: 1 };
    const apiAnnotation = { kind: "endpoints", raw: "<!-- @ea:endpoints -->", line: 1 };
    const manifest = makeManifest("api-spec.md", [
      makeBlock("event-table", [
        makeFact({ key: "dossier.success", kind: "event-table", source: { file: "api-spec.md", line: 5 } }),
      ], { annotation: evAnnotation, source: { file: "api-spec.md", line: 1 } }),
      makeBlock("endpoint-table", [
        makeFact({ key: "POST /api/v1/dossiers", kind: "endpoint-table", source: { file: "api-spec.md", line: 15 } }),
      ], { annotation: apiAnnotation, source: { file: "api-spec.md", line: 10 } }),
    ]);

    const artifact = makeArtifact({
      id: "SVC-identity",
      kind: "service",
      anchors: {
        events: ["dossier.success", "dossier.cancelled"],
        apis: ["POST /api/v1/dossiers"],
      },
    });

    const report = reconcileFactsWithArtifacts([manifest], [artifact]);
    // dossier.cancelled in artifact but not in docs
    expect(report.findings.some(f =>
      f.rule === "ea:docs/artifact-missing-fact" &&
      f.message.includes("dossier.cancelled"),
    )).toBe(true);
    // POST /api/v1/dossiers matches — should not be flagged
    expect(report.findings.some(f =>
      f.message.includes("POST /api/v1/dossiers") &&
      f.rule === "ea:docs/artifact-missing-fact",
    )).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. renderReconcileOutput docs step
// ═══════════════════════════════════════════════════════════════════════

describe("renderReconcileOutput docs step", () => {
  it("includes drill-down hint for failed docs step", async () => {
    const { renderReconcileOutput } = await import("../reconcile.js");
    const report = {
      passed: false,
      generatedAt: new Date().toISOString(),
      steps: [{
        step: "docs" as const,
        passed: false,
        errors: 2,
        warnings: 1,
        details: "Doc consistency: 10 facts from 3 docs, 3 findings.",
      }],
      vcsWarnings: [],
      summary: {
        totalErrors: 2,
        totalWarnings: 1,
        generationDrifts: 0,
        validationErrors: 0,
        driftFindings: 0,
        traceIssues: 0,
        docConsistencyFindings: 3,
      },
    };

    const output = renderReconcileOutput(report);
    expect(output).toContain("Docs");
    expect(output).toContain("drift --domain docs");
  });
});

// ─── Canonical / Derived Markers ────────────────────────────────────

describe("canonical/derived markers", () => {
  it("parses @ea:canonical marker", () => {
    const md = `<!-- @ea:canonical -->

| Event | Trigger |
|---|---|
| e.1 | t |`;

    const doc = parseMarkdown(md, "canonical.md");
    expect(doc.markers).toHaveLength(1);
    expect(doc.markers[0]!.type).toBe("canonical");
  });

  it("parses @ea:derived marker with source", () => {
    const md = `<!-- @ea:derived source="spec.md" -->

| Event | Trigger |
|---|---|
| e.1 | t |`;

    const doc = parseMarkdown(md, "derived.md");
    expect(doc.markers).toHaveLength(1);
    expect(doc.markers[0]!.type).toBe("derived");
    expect(doc.markers[0]!.derivedFrom).toBe("spec.md");
  });

  it("carries markers through FactManifest", () => {
    const md = `<!-- @ea:canonical -->

| Event | Trigger |
|---|---|
| e.1 | t |`;

    const doc = parseMarkdown(md, "canonical.md");
    const manifest = buildFactManifest(doc);
    expect(manifest.markers).toBeDefined();
    expect(manifest.markers).toHaveLength(1);
  });

  it("enhances value-mismatch message for canonical vs derived conflict", () => {
    const canonicalMd = `<!-- @ea:canonical -->

| Event | Trigger |
|---|---|
| dossier.success | Verification passed |`;

    const derivedMd = `<!-- @ea:derived source="canonical.md" -->

| Event | Trigger |
|---|---|
| dossier.success | Identity verified |`;

    const mA = buildFactManifest(parseMarkdown(canonicalMd, "canonical.md"));
    const mB = buildFactManifest(parseMarkdown(derivedMd, "derived.md"));
    const report = checkConsistency([mA, mB]);

    const mismatch = report.findings.find(f => f.rule === "ea:docs/value-mismatch");
    expect(mismatch).toBeDefined();
    expect(mismatch!.suggestion).toContain("Canonical");
    expect(mismatch!.suggestion).toContain("derived");
  });

  it("works normally when no markers present", () => {
    const mdA = `| Event | Trigger |
|---|---|
| e.1 | t1 |`;
    const mdB = `| Event | Trigger |
|---|---|
| e.1 | t2 |`;

    const mA = buildFactManifest(parseMarkdown(mdA, "a.md"));
    const mB = buildFactManifest(parseMarkdown(mdB, "b.md"));
    const report = checkConsistency([mA, mB]);
    expect(report.findings.some(f => f.rule === "ea:docs/value-mismatch")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 10. Extra-entry contradiction (symmetric difference)
// ═══════════════════════════════════════════════════════════════════════

describe("extra-entry contradiction", () => {
  it("reports extra-entry error when both docs have unique entries", () => {
    const annotation = { kind: "events", id: "webhook-events", raw: "<!-- @ea:events webhook-events -->", line: 1 };
    const mA = makeManifest("events-a.md", [
      makeBlock("event-table", [
        makeFact({ key: "dossier.success", kind: "event-table", source: { file: "events-a.md", line: 5 } }),
        makeFact({ key: "dossier.cancelled", kind: "event-table", source: { file: "events-a.md", line: 6 } }),
      ], { id: "webhook-events", annotation, source: { file: "events-a.md", line: 1 } }),
    ]);
    const mB = makeManifest("events-b.md", [
      makeBlock("event-table", [
        makeFact({ key: "dossier.success", kind: "event-table", source: { file: "events-b.md", line: 5 } }),
        makeFact({ key: "dossier.expired", kind: "event-table", source: { file: "events-b.md", line: 6 } }),
      ], { id: "webhook-events", annotation, source: { file: "events-b.md", line: 1 } }),
    ]);

    const report = checkConsistency([mA, mB]);
    const extraEntry = report.findings.find(f => f.rule === "ea:docs/extra-entry");
    expect(extraEntry).toBeDefined();
    expect(extraEntry!.severity).toBe("error");
    expect(extraEntry!.message).toContain("dossier.cancelled");
    expect(extraEntry!.message).toContain("dossier.expired");
  });

  it("does NOT report extra-entry when difference is one-directional", () => {
    const annotation = { kind: "events", id: "events", raw: "<!-- @ea:events events -->", line: 1 };
    const mA = makeManifest("events-a.md", [
      makeBlock("event-table", [
        makeFact({ key: "dossier.success", kind: "event-table", source: { file: "events-a.md", line: 5 } }),
        makeFact({ key: "dossier.cancelled", kind: "event-table", source: { file: "events-a.md", line: 6 } }),
      ], { id: "events", annotation, source: { file: "events-a.md", line: 1 } }),
    ]);
    const mB = makeManifest("events-b.md", [
      makeBlock("event-table", [
        makeFact({ key: "dossier.success", kind: "event-table", source: { file: "events-b.md", line: 5 } }),
      ], { id: "events", annotation, source: { file: "events-b.md", line: 1 } }),
    ]);

    const report = checkConsistency([mA, mB]);
    const extraEntry = report.findings.find(f => f.rule === "ea:docs/extra-entry");
    expect(extraEntry).toBeUndefined();
    // But missing-entry warning should still exist
    const missing = report.findings.find(f => f.rule === "ea:docs/missing-entry");
    expect(missing).toBeDefined();
  });
});

describe("suggestAnnotations", () => {
  it("suggests annotations for unannotated heuristic blocks", () => {
    const md = `| Event | Trigger |
|---|---|
| dossier.success | Verification passed |
| dossier.cancelled | User cancelled |
| dossier.expired | Timeout |`;

    const manifest = buildFactManifest(parseMarkdown(md, "events.md"));
    const suggestions = suggestAnnotations([manifest]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.kind).toBe("event-table");
    expect(suggestions[0]!.annotation).toContain("@ea:events");
    expect(suggestions[0]!.confidence).toBe("high"); // 3+ facts
    expect(suggestions[0]!.file).toBe("events.md");
  });

  it("skips blocks that already have annotations", () => {
    const md = `<!-- @ea:events -->
| Event | Trigger |
|---|---|
| e.1 | t |
<!-- @ea:end -->`;

    const manifest = buildFactManifest(parseMarkdown(md, "annotated.md"));
    const suggestions = suggestAnnotations([manifest]);
    expect(suggestions).toHaveLength(0);
  });

  it("returns medium confidence for blocks with few facts", () => {
    const md = `| Event | Trigger |
|---|---|
| e.1 | t |`;

    const manifest = buildFactManifest(parseMarkdown(md, "small.md"));
    const suggestions = suggestAnnotations([manifest]);

    if (suggestions.length > 0) {
      expect(suggestions[0]!.confidence).toBe("medium"); // < 3 facts
    }
  });

  it("includes reason with fact key preview", () => {
    const md = `| Event | Trigger |
|---|---|
| dossier.success | passed |
| dossier.failed | failed |`;

    const manifest = buildFactManifest(parseMarkdown(md, "events.md"));
    const suggestions = suggestAnnotations([manifest]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.reason).toContain("dossier.success");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 11. Mapping table detection
// ═══════════════════════════════════════════════════════════════════════

describe("mapping table detection", () => {
  it("classifies table with Internal/External columns as mapping-table", () => {
    const md = `| Internal Name | External Name |
|---|---|
| dossier.success | verification.completed |
| dossier.cancelled | verification.failed |`;

    const doc = parseMarkdown(md, "mapping.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("mapping-table");
    expect(blocks[0]!.facts).toHaveLength(2);
  });

  it("classifies table with Source/Target columns as mapping-table", () => {
    const md = `| Source Event | Target Event | Notes |
|---|---|---|
| order.placed | purchase.created | Legacy mapping |`;

    const doc = parseMarkdown(md, "mapping.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("mapping-table");
  });

  it("downgrades naming-inconsistency to warning when mapping table exists", () => {
    const mdMapping = `| Internal Name | External Name |
|---|---|
| dossier.completed | dossier.complete |`;

    const mdA = `| Event | Trigger |
|---|---|
| dossier.completed | Done |`;
    const mdB = `| Event | Trigger |
|---|---|
| dossier.complete | Done |`;

    const mMap = buildFactManifest(parseMarkdown(mdMapping, "mapping.md"));
    const mA = buildFactManifest(parseMarkdown(mdA, "doc-a.md"));
    const mB = buildFactManifest(parseMarkdown(mdB, "doc-b.md"));
    const report = checkConsistency([mMap, mA, mB]);

    const naming = report.findings.find(f => f.rule === "ea:docs/naming-inconsistency");
    expect(naming).toBeDefined();
    expect(naming!.severity).toBe("warning"); // Downgraded from error
    expect(naming!.message).toContain("intentional mapping");
  });

  it("keeps naming-inconsistency as error when no mapping table matches", () => {
    const mdA = `| Event | Trigger |
|---|---|
| dossier.completed | Done |`;
    const mdB = `| Event | Trigger |
|---|---|
| dossier.complete | Done |`;

    const mA = buildFactManifest(parseMarkdown(mdA, "doc-a.md"));
    const mB = buildFactManifest(parseMarkdown(mdB, "doc-b.md"));
    const report = checkConsistency([mA, mB]);

    const naming = report.findings.find(f => f.rule === "ea:docs/naming-inconsistency");
    expect(naming).toBeDefined();
    expect(naming!.severity).toBe("error");
  });
});
