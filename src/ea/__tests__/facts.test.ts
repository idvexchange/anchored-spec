/**
 * @module facts.test
 *
 * Comprehensive tests for the markdown prose resolver (fact extraction) system.
 *
 * Covers:
 *  1. Markdown parser — parseMarkdown, annotations, suppressions
 *  2. Table extractor — GFM tables, heuristic + annotated classification
 *  3. Code block extractor — TypeScript types/enums/interfaces, JSON facts
 *  4. Mermaid extractor — stateDiagram transitions, [*] normalization
 *  5. Heading+List extractor — HTTP endpoints, events, entities
 *  6. Frontmatter extractor — ea-entities, domain, status
 *  7. Orchestrator — buildFactManifest, extractFacts
 *  8. Consistency engine — cross-document value mismatch, naming, state conflicts
 *  9. Suppression engine — inline @anchored-spec:suppress matching
 * 10. Reconciler — fact↔entity anchor reconciliation
 */

import { describe, it, expect } from "vitest";
import type { BackstageEntity } from "../backstage/types.js";
import {
  parseMarkdown,
  buildFactManifest,
  tableExtractor,
  codeBlockExtractor,
  mermaidExtractor,
  headingListExtractor,
  frontmatterExtractor,
  checkConsistency,
  applySuppressions,
  collectSuppressions,
  reconcileFactsWithEntities,
} from "../facts/index.js";
import type {
  FactManifest,
  FactBlock,
  ExtractedFact,
  ConsistencyFinding,
  SuppressionAnnotation,
} from "../facts/index.js";

// ─── Helpers ────────────────────────────────────────────────────────

function makeEntity(overrides: {
  name: string;
  kind?: string;
  specType?: string;
  anchors?: Record<string, unknown>;
}): BackstageEntity {
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind: overrides.kind ?? "Component",
    metadata: {
      name: overrides.name,
      annotations: { "anchored-spec.dev/confidence": "declared" },
    },
    spec: {
      type: overrides.specType ?? "service",
      owner: "team-test",
      lifecycle: "production",
      ...(overrides.anchors && { anchors: overrides.anchors }),
    },
  };
}

function makeManifest(
  source: string,
  blocks: FactBlock[],
): FactManifest {
  const totalFacts = blocks.reduce((sum, b) => sum + b.facts.length, 0);
  return {
    source,
    extractedAt: new Date().toISOString(),
    blocks,
    totalFacts,
  };
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

// ─── 1. Markdown Parser ─────────────────────────────────────────────

describe("parseMarkdown", () => {
  it("produces an mdast tree with correct root type", () => {
    const doc = parseMarkdown("# Hello\n\nSome text.", "test.md");
    expect(doc.tree.type).toBe("root");
    expect(doc.tree.children.length).toBeGreaterThan(0);
    expect(doc.filePath).toBe("test.md");
  });

  it("extracts @anchored-spec:events annotation", () => {
    const md = `<!-- @anchored-spec:events webhook-events -->

| Event | Trigger |
| :--- | :--- |
| dossier.success | Verified |

<!-- @anchored-spec:end -->
`;
    const doc = parseMarkdown(md, "events.md");
    expect(doc.annotations).toHaveLength(1);
    expect(doc.annotations[0]!.annotation.kind).toBe("events");
    expect(doc.annotations[0]!.annotation.id).toBe("webhook-events");
  });

  it("extracts @anchored-spec:suppress annotation", () => {
    const md = `<!-- @anchored-spec:suppress ea:docs/value-mismatch reason="known divergence" -->

Some content

<!-- @anchored-spec:end -->
`;
    const doc = parseMarkdown(md, "suppress.md");
    expect(doc.suppressions).toHaveLength(1);
    expect(doc.suppressions[0]!.ruleId).toBe("ea:docs/value-mismatch");
    expect(doc.suppressions[0]!.reason).toBe("known divergence");
  });

  it("extracts @anchored-spec:end closing annotation", () => {
    const md = `<!-- @anchored-spec:events -->

| Event | Trigger |
| :--- | :--- |
| ev.one | desc |

<!-- @anchored-spec:end -->
`;
    const doc = parseMarkdown(md, "test.md");
    expect(doc.annotations).toHaveLength(1);
    // endOffset should be set from @anchored-spec:end
    expect(doc.annotations[0]!.endOffset).toBeGreaterThan(doc.annotations[0]!.startOffset);
  });

  it("unclosed annotations extend to EOF", () => {
    const md = `<!-- @anchored-spec:events -->

| Event | Trigger |
| :--- | :--- |
| ev.one | desc |
`;
    const doc = parseMarkdown(md, "unclosed.md");
    expect(doc.annotations).toHaveLength(1);
    // endOffset should be >= last line of tree
    expect(doc.annotations[0]!.endOffset).toBeGreaterThanOrEqual(5);
  });

  it("ignores malformed HTML comments", () => {
    const md = `<!-- not an ea annotation -->

<!-- @anchored-spec:events -->

| Event | Trigger |
| :--- | :--- |
| ev.one | desc |

<!-- @anchored-spec:end -->
`;
    const doc = parseMarkdown(md, "test.md");
    // Only the valid @anchored-spec:events should be captured
    expect(doc.annotations).toHaveLength(1);
    expect(doc.annotations[0]!.annotation.kind).toBe("events");
  });
});

// ─── 2. Table Extractor ─────────────────────────────────────────────

describe("tableExtractor", () => {
  it("extracts event-table facts from GFM table with Event/Trigger columns", () => {
    const md = `| Event | Trigger |
| :--- | :--- |
| \`dossier.success\` | Verification succeeded |
| \`dossier.cancelled\` | Cancelled by tenant |
`;
    const doc = parseMarkdown(md, "events.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("event-table");
    expect(blocks[0]!.facts).toHaveLength(2);
    expect(blocks[0]!.facts[0]!.key).toBe("dossier.success");
    expect(blocks[0]!.facts[1]!.key).toBe("dossier.cancelled");
  });

  it("extracts status-enum facts from table with Status/Value columns", () => {
    const md = `| Status | Description |
| :--- | :--- |
| open | Dossier is open |
| closed | Dossier is closed |
`;
    const doc = parseMarkdown(md, "status.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("status-enum");
    expect(blocks[0]!.facts).toHaveLength(2);
  });

  it("extracts endpoint-table facts from table with Endpoint/Method columns", () => {
    const md = `| Endpoint | Method | Description |
| :--- | :--- | :--- |
| /api/v1/users | GET | List users |
| /api/v1/users | POST | Create user |
`;
    const doc = parseMarkdown(md, "endpoints.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("endpoint-table");
    expect(blocks[0]!.facts).toHaveLength(2);
  });

  it("uses @anchored-spec:events annotation override", () => {
    const md = `<!-- @anchored-spec:events custom-events -->

| Name | Info |
| :--- | :--- |
| my.event | Something happened |

<!-- @anchored-spec:end -->
`;
    const doc = parseMarkdown(md, "annotated.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("event-table");
    expect(blocks[0]!.facts[0]!.key).toBe("my.event");
  });

  it("skips unrecognized table (no matching columns, no annotation)", () => {
    const md = `| Foo | Bar |
| :--- | :--- |
| hello | world |
`;
    const doc = parseMarkdown(md, "unknown.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(0);
  });

  it("strips backticks from cell values", () => {
    const md = `| Event | Trigger |
| :--- | :--- |
| \`my.event\` | \`something\` |
`;
    const doc = parseMarkdown(md, "backticks.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.facts[0]!.key).toBe("my.event");
    expect(blocks[0]!.facts[0]!.fields["trigger"]).toBe("something");
  });

  it("returns no facts for empty table (header only)", () => {
    const md = `| Event | Trigger |
| :--- | :--- |
`;
    const doc = parseMarkdown(md, "empty.md");
    const blocks = tableExtractor.extract(doc);
    expect(blocks).toHaveLength(0);
  });
});

// ─── 3. Code Block Extractor ────────────────────────────────────────

describe("codeBlockExtractor", () => {
  it("extracts type-enum fact from TypeScript type union", () => {
    const md = "```typescript\ntype DossierStatus = 'open' | 'cancelled' | 'expired';\n```\n";
    const doc = parseMarkdown(md, "types.md");
    const blocks = codeBlockExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("type-enum");
    expect(blocks[0]!.facts[0]!.key).toBe("DossierStatus");
    expect(blocks[0]!.facts[0]!.fields["values"]).toBe("open, cancelled, expired");
  });

  it("extracts type-enum fact from TypeScript enum", () => {
    const md = "```typescript\nenum Status {\n  Active = 'active',\n  Inactive = 'inactive',\n}\n```\n";
    const doc = parseMarkdown(md, "enum.md");
    const blocks = codeBlockExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("type-enum");
    expect(blocks[0]!.facts[0]!.key).toBe("Status");
    expect(blocks[0]!.facts[0]!.fields["values"]).toContain("Active");
    expect(blocks[0]!.facts[0]!.fields["values"]).toContain("Inactive");
  });

  it("extracts entity-fields fact from TypeScript interface", () => {
    const md = "```typescript\ninterface Dossier {\n  id: string;\n  status: DossierStatus;\n  createdAt: Date;\n}\n```\n";
    const doc = parseMarkdown(md, "interface.md");
    const blocks = codeBlockExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("entity-fields");
    expect(blocks[0]!.facts[0]!.key).toBe("Dossier");
    expect(blocks[0]!.facts[0]!.fields["id"]).toBe("string");
    expect(blocks[0]!.facts[0]!.fields["status"]).toBe("DossierStatus");
  });

  it("extracts event-table fact from JSON with event key", () => {
    const md = '```json\n{ "event": "dossier.created", "payload": "DossierPayload" }\n```\n';
    const doc = parseMarkdown(md, "json-event.md");
    const blocks = codeBlockExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("event-table");
    expect(blocks[0]!.facts[0]!.key).toBe("dossier.created");
  });

  it("extracts endpoint-table fact from JSON with method+path", () => {
    const md = '```json\n{ "method": "POST", "path": "/api/v1/dossiers" }\n```\n';
    const doc = parseMarkdown(md, "json-endpoint.md");
    const blocks = codeBlockExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("endpoint-table");
    expect(blocks[0]!.facts[0]!.key).toBe("POST /api/v1/dossiers");
  });

  it("skips malformed JSON", () => {
    const md = '```json\n{ broken json }\n```\n';
    const doc = parseMarkdown(md, "bad-json.md");
    const blocks = codeBlockExtractor.extract(doc);
    expect(blocks).toHaveLength(0);
  });

  it("skips non-TS/JSON code blocks", () => {
    const md = "```python\nprint('hello')\n```\n";
    const doc = parseMarkdown(md, "python.md");
    const blocks = codeBlockExtractor.extract(doc);
    expect(blocks).toHaveLength(0);
  });
});

// ─── 4. Mermaid Extractor ───────────────────────────────────────────

describe("mermaidExtractor", () => {
  it("extracts state-transition facts from stateDiagram-v2", () => {
    const md = `\`\`\`mermaid
stateDiagram-v2
    [*] --> open : Created
    open --> processing : Start
    processing --> success : Passed
    processing --> cancelled : User cancelled
\`\`\`
`;
    const doc = parseMarkdown(md, "states.md");
    const blocks = mermaidExtractor.extract(doc);

    const transitionBlock = blocks.find((b) => b.kind === "state-transition");
    expect(transitionBlock).toBeDefined();
    expect(transitionBlock!.facts).toHaveLength(4);

    const keys = transitionBlock!.facts.map((f) => f.key);
    expect(keys).toContain("[start]→open");
    expect(keys).toContain("open→processing");
    expect(keys).toContain("processing→success");
    expect(keys).toContain("processing→cancelled");
  });

  it("normalizes [*] to [start] on left and [end] on right", () => {
    const md = `\`\`\`mermaid
stateDiagram-v2
    [*] --> active : Begin
    active --> [*] : Finish
\`\`\`
`;
    const doc = parseMarkdown(md, "star.md");
    const blocks = mermaidExtractor.extract(doc);
    const transitionBlock = blocks.find((b) => b.kind === "state-transition");
    expect(transitionBlock).toBeDefined();

    const keys = transitionBlock!.facts.map((f) => f.key);
    expect(keys).toContain("[start]→active");
    expect(keys).toContain("active→[end]");
  });

  it("produces status-enum summary block with all unique states", () => {
    const md = `\`\`\`mermaid
stateDiagram-v2
    [*] --> open : Created
    open --> processing : Start
    processing --> success : Passed
\`\`\`
`;
    const doc = parseMarkdown(md, "enum.md");
    const blocks = mermaidExtractor.extract(doc);

    const enumBlock = blocks.find((b) => b.kind === "status-enum");
    expect(enumBlock).toBeDefined();
    expect(enumBlock!.facts).toHaveLength(1);
    const values = enumBlock!.facts[0]!.fields["values"]!;
    expect(values).toContain("open");
    expect(values).toContain("processing");
    expect(values).toContain("success");
    // [*] should NOT appear in the status enum
    expect(values).not.toContain("[*]");
    expect(values).not.toContain("[start]");
  });

  it("skips non-stateDiagram mermaid blocks", () => {
    const md = `\`\`\`mermaid
flowchart TD
    A --> B
    B --> C
\`\`\`
`;
    const doc = parseMarkdown(md, "flowchart.md");
    const blocks = mermaidExtractor.extract(doc);
    expect(blocks).toHaveLength(0);
  });

  it("ignores direction and note lines", () => {
    const md = `\`\`\`mermaid
stateDiagram-v2
    direction LR
    note right of open : This is a note
    [*] --> open : Created
    open --> done : Finish
\`\`\`
`;
    const doc = parseMarkdown(md, "notes.md");
    const blocks = mermaidExtractor.extract(doc);
    const transitionBlock = blocks.find((b) => b.kind === "state-transition");
    expect(transitionBlock).toBeDefined();
    // Only the actual transitions should be extracted
    expect(transitionBlock!.facts).toHaveLength(2);
  });
});

// ─── 5. Heading+List Extractor ──────────────────────────────────────

describe("headingListExtractor", () => {
  it("extracts endpoint-table from ### POST /api/v1/path + bullet list", () => {
    const md = `### POST /api/v1/dossiers

- **method**: POST
- **path**: /api/v1/dossiers
- **description**: Create a new dossier
`;
    const doc = parseMarkdown(md, "endpoint.md");
    const blocks = headingListExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("endpoint-table");
    expect(blocks[0]!.facts[0]!.key).toBe("POST /api/v1/dossiers");
  });

  it("extracts event-table from ### Event: dossier.cancelled + bullets", () => {
    const md = `### Event: dossier.cancelled

- **trigger**: Cancelled by tenant
- **payload**: DossierCancelledPayload
`;
    const doc = parseMarkdown(md, "event-heading.md");
    const blocks = headingListExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("event-table");
    expect(blocks[0]!.facts[0]!.key).toBe("dossier.cancelled");
  });

  it("extracts entity-fields from ### DossierStatus + bullets", () => {
    const md = `### DossierStatus

- **open**: Dossier is open
- **closed**: Dossier is closed
`;
    const doc = parseMarkdown(md, "entity.md");
    const blocks = headingListExtractor.extract(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("entity-fields");
    expect(blocks[0]!.facts[0]!.key).toBe("DossierStatus");
  });

  it("skips headings at depth < 3", () => {
    const md = `## POST /api/v1/dossiers

- **method**: POST
- **path**: /api/v1/dossiers
`;
    const doc = parseMarkdown(md, "h2.md");
    const blocks = headingListExtractor.extract(doc);
    expect(blocks).toHaveLength(0);
  });

  it("skips heading without following list", () => {
    const md = `### POST /api/v1/dossiers

Some paragraph text, not a list.
`;
    const doc = parseMarkdown(md, "no-list.md");
    const blocks = headingListExtractor.extract(doc);
    expect(blocks).toHaveLength(0);
  });
});

// ─── 6. Frontmatter Extractor ───────────────────────────────────────

describe("frontmatterExtractor", () => {
  it("extracts ea-entities as generic facts with trace role", () => {
    const md = `---
ea-entities:
  - SVC-identity-hub
  - API-dossier-v1
---

# Document
`;
    const doc = parseMarkdown(md, "frontmatter.md");
    const blocks = frontmatterExtractor.extract(doc);
    const artifactBlock = blocks.find((b) =>
      b.facts.some((f) => f.fields["role"] === "trace"),
    );
    expect(artifactBlock).toBeDefined();
    expect(artifactBlock!.facts).toHaveLength(2);
    expect(artifactBlock!.facts[0]!.key).toBe("SVC-identity-hub");
    expect(artifactBlock!.facts[1]!.key).toBe("API-dossier-v1");
  });

  it("extracts domain as generic facts", () => {
    const md = `---
domain:
  - identity
  - verification
---

# Document
`;
    const doc = parseMarkdown(md, "domain.md");
    const blocks = frontmatterExtractor.extract(doc);
    const domainBlock = blocks.find((b) =>
      b.facts.some((f) => f.fields["source"] === "frontmatter"),
    );
    expect(domainBlock).toBeDefined();
    expect(domainBlock!.facts).toHaveLength(2);
    expect(domainBlock!.facts[0]!.key).toBe("identity");
    expect(domainBlock!.facts[1]!.key).toBe("verification");
  });

  it("extracts status as generic fact", () => {
    const md = `---
status: current
type: spec
---

# Specification
`;
    const doc = parseMarkdown(md, "docs/my-spec.md");
    const blocks = frontmatterExtractor.extract(doc);
    const statusBlock = blocks.find((b) =>
      b.facts.some((f) => f.fields["status"] === "current"),
    );
    expect(statusBlock).toBeDefined();
    expect(statusBlock!.facts[0]!.key).toBe("my-spec.md");
    expect(statusBlock!.facts[0]!.fields["type"]).toBe("spec");
  });

  it("returns empty for document without frontmatter", () => {
    const md = `# No Frontmatter

Just a regular document.
`;
    const doc = parseMarkdown(md, "no-fm.md");
    const blocks = frontmatterExtractor.extract(doc);
    expect(blocks).toHaveLength(0);
  });
});

// ─── 7. Orchestrator ────────────────────────────────────────────────

describe("buildFactManifest", () => {
  it("combines facts from table and code block in a single document", () => {
    const md = `| Event | Trigger |
| :--- | :--- |
| dossier.success | Verified |

\`\`\`typescript
type DossierStatus = 'open' | 'cancelled';
\`\`\`
`;
    const doc = parseMarkdown(md, "combined.md");
    const manifest = buildFactManifest(doc);
    expect(manifest.source).toBe("combined.md");
    expect(manifest.blocks.length).toBeGreaterThanOrEqual(2);
    expect(manifest.totalFacts).toBeGreaterThanOrEqual(2);

    const kinds = manifest.blocks.map((b) => b.kind);
    expect(kinds).toContain("event-table");
    expect(kinds).toContain("type-enum");
  });

  it("returns zero facts for empty document", () => {
    const doc = parseMarkdown("", "empty.md");
    const manifest = buildFactManifest(doc);
    expect(manifest.blocks).toHaveLength(0);
    expect(manifest.totalFacts).toBe(0);
  });

  it("totalFacts count matches sum of all block facts", () => {
    const md = `| Event | Trigger |
| :--- | :--- |
| ev.one | First |
| ev.two | Second |
| ev.three | Third |
`;
    const doc = parseMarkdown(md, "count.md");
    const manifest = buildFactManifest(doc);
    const expected = manifest.blocks.reduce(
      (sum, b) => sum + b.facts.length,
      0,
    );
    expect(manifest.totalFacts).toBe(expected);
  });
});

// ─── 8. Consistency Engine ──────────────────────────────────────────

describe("checkConsistency", () => {
  it("reports value-mismatch when same event key has different trigger values across docs", () => {
    const m1 = makeManifest("doc-a.md", [
      makeBlock("event-table", [
        makeFact({
          key: "dossier.success",
          kind: "event-table",
          fields: { event: "dossier.success", trigger: "Verification passed" },
          source: { file: "doc-a.md", line: 5 },
        }),
      ]),
    ]);
    const m2 = makeManifest("doc-b.md", [
      makeBlock("event-table", [
        makeFact({
          key: "dossier.success",
          kind: "event-table",
          fields: { event: "dossier.success", trigger: "Identity verified" },
          source: { file: "doc-b.md", line: 10 },
        }),
      ]),
    ]);

    const report = checkConsistency([m1, m2]);
    expect(report.passed).toBe(false);
    const mismatch = report.findings.find(
      (f) => f.rule === "ea:docs/value-mismatch",
    );
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe("error");
  });

  it("reports no findings when same event key has same values across docs", () => {
    const fact = makeFact({
      key: "dossier.success",
      kind: "event-table",
      fields: { event: "dossier.success", trigger: "Verified" },
    });
    const m1 = makeManifest("doc-a.md", [
      makeBlock("event-table", [
        { ...fact, source: { file: "doc-a.md", line: 5 } },
      ]),
    ]);
    const m2 = makeManifest("doc-b.md", [
      makeBlock("event-table", [
        { ...fact, source: { file: "doc-b.md", line: 10 } },
      ]),
    ]);

    const report = checkConsistency([m1, m2]);
    expect(report.findings).toHaveLength(0);
    expect(report.passed).toBe(true);
  });

  it("reports state-machine-conflict when same from state has different to across docs", () => {
    const m1 = makeManifest("doc-a.md", [
      makeBlock("state-transition", [
        makeFact({
          key: "open→processing",
          kind: "state-transition",
          fields: { from: "open", to: "processing", trigger: "Start" },
          source: { file: "doc-a.md", line: 5 },
        }),
      ]),
    ]);
    const m2 = makeManifest("doc-b.md", [
      makeBlock("state-transition", [
        makeFact({
          key: "open→reviewing",
          kind: "state-transition",
          fields: { from: "open", to: "reviewing", trigger: "Start" },
          source: { file: "doc-b.md", line: 8 },
        }),
      ]),
    ]);

    const report = checkConsistency([m1, m2]);
    const conflict = report.findings.find(
      (f) => f.rule === "ea:docs/state-machine-conflict",
    );
    expect(conflict).toBeDefined();
    expect(conflict!.severity).toBe("error");
  });

  it("reports missing-entry when annotated blocks share blockId but differ in keys", () => {
    const annotation = { kind: "events", id: "webhook-events", raw: "<!-- @anchored-spec:events webhook-events -->", line: 1 };
    const m1 = makeManifest("doc-a.md", [
      makeBlock("event-table", [
        makeFact({ key: "ev.one", kind: "event-table", source: { file: "doc-a.md", line: 2 } }),
        makeFact({ key: "ev.two", kind: "event-table", source: { file: "doc-a.md", line: 3 } }),
      ], { id: "webhook-events", annotation, source: { file: "doc-a.md", line: 1 } }),
    ]);
    const m2 = makeManifest("doc-b.md", [
      makeBlock("event-table", [
        makeFact({ key: "ev.one", kind: "event-table", source: { file: "doc-b.md", line: 2 } }),
      ], { id: "webhook-events", annotation: { ...annotation, line: 1 }, source: { file: "doc-b.md", line: 1 } }),
    ]);

    const report = checkConsistency([m1, m2]);
    const missing = report.findings.find(
      (f) => f.rule === "ea:docs/missing-entry",
    );
    expect(missing).toBeDefined();
    expect(missing!.severity).toBe("warning");
  });

  it("reports naming-inconsistency for similar keys across docs", () => {
    const m1 = makeManifest("doc-a.md", [
      makeBlock("event-table", [
        makeFact({
          key: "dossier.success",
          kind: "event-table",
          fields: { event: "dossier.success" },
          source: { file: "doc-a.md", line: 5 },
        }),
      ]),
    ]);
    const m2 = makeManifest("doc-b.md", [
      makeBlock("event-table", [
        makeFact({
          key: "dossier.succes",
          kind: "event-table",
          fields: { event: "dossier.succes" },
          source: { file: "doc-b.md", line: 5 },
        }),
      ]),
    ]);

    const report = checkConsistency([m1, m2]);
    const naming = report.findings.find(
      (f) => f.rule === "ea:docs/naming-inconsistency",
    );
    expect(naming).toBeDefined();
    expect(naming!.severity).toBe("error");
  });

  it("respects kindFilter option", () => {
    const m1 = makeManifest("doc-a.md", [
      makeBlock("event-table", [
        makeFact({
          key: "dossier.success",
          kind: "event-table",
          fields: { event: "dossier.success", trigger: "A" },
          source: { file: "doc-a.md", line: 5 },
        }),
      ]),
      makeBlock("status-enum", [
        makeFact({
          key: "open",
          kind: "status-enum",
          fields: { status: "open", description: "X" },
          source: { file: "doc-a.md", line: 20 },
        }),
      ]),
    ]);
    const m2 = makeManifest("doc-b.md", [
      makeBlock("event-table", [
        makeFact({
          key: "dossier.success",
          kind: "event-table",
          fields: { event: "dossier.success", trigger: "B" },
          source: { file: "doc-b.md", line: 5 },
        }),
      ]),
      makeBlock("status-enum", [
        makeFact({
          key: "open",
          kind: "status-enum",
          fields: { status: "open", description: "Y" },
          source: { file: "doc-b.md", line: 20 },
        }),
      ]),
    ]);

    // Filter to only status-enum — should NOT see event-table mismatches
    const report = checkConsistency([m1, m2], { kindFilter: "status-enum" });
    const eventMismatch = report.findings.find(
      (f) =>
        f.rule === "ea:docs/value-mismatch" &&
        f.message.includes("event-table"),
    );
    expect(eventMismatch).toBeUndefined();
  });
});

// ─── 9. Suppression ─────────────────────────────────────────────────

describe("applySuppressions", () => {
  it("marks finding as suppressed when suppression matches rule and location", () => {
    const findings: ConsistencyFinding[] = [
      {
        rule: "ea:docs/value-mismatch",
        severity: "error",
        message: "Field mismatch",
        locations: [{ file: "doc-a.md", line: 10, value: "foo" }],
      },
    ];
    const suppressions = new Map<string, SuppressionAnnotation[]>([
      [
        "doc-a.md",
        [
          {
            ruleId: "ea:docs/value-mismatch",
            reason: "known issue",
            raw: '<!-- @anchored-spec:suppress ea:docs/value-mismatch reason="known issue" -->',
            line: 1,
            endLine: 50,
          },
        ],
      ],
    ]);

    applySuppressions(findings, suppressions);
    expect(findings[0]!.suppressed).toBe(true);
    expect(findings[0]!.suppressedBy).toEqual({
      file: "doc-a.md",
      reason: "known issue",
    });
  });

  it("leaves finding unsuppressed when suppression does not match rule", () => {
    const findings: ConsistencyFinding[] = [
      {
        rule: "ea:docs/value-mismatch",
        severity: "error",
        message: "Field mismatch",
        locations: [{ file: "doc-a.md", line: 10, value: "foo" }],
      },
    ];
    const suppressions = new Map<string, SuppressionAnnotation[]>([
      [
        "doc-a.md",
        [
          {
            ruleId: "ea:docs/naming-inconsistency",
            reason: "not relevant",
            raw: '<!-- @anchored-spec:suppress ea:docs/naming-inconsistency reason="not relevant" -->',
            line: 1,
            endLine: 50,
          },
        ],
      ],
    ]);

    applySuppressions(findings, suppressions);
    expect(findings[0]!.suppressed).toBeUndefined();
  });

  it("supports glob pattern matching (ea:docs/*)", () => {
    const findings: ConsistencyFinding[] = [
      {
        rule: "ea:docs/value-mismatch",
        severity: "error",
        message: "Field mismatch",
        locations: [{ file: "doc-a.md", line: 10, value: "foo" }],
      },
    ];
    const suppressions = new Map<string, SuppressionAnnotation[]>([
      [
        "doc-a.md",
        [
          {
            ruleId: "ea:docs/*",
            reason: "suppress all doc rules",
            raw: '<!-- @anchored-spec:suppress ea:docs/* reason="suppress all doc rules" -->',
            line: 1,
            endLine: 50,
          },
        ],
      ],
    ]);

    applySuppressions(findings, suppressions);
    expect(findings[0]!.suppressed).toBe(true);
  });
});

describe("collectSuppressions", () => {
  it("groups suppressions by source file path", () => {
    const manifests = [
      {
        source: "doc-a.md",
        suppressions: [
          { ruleId: "ea:docs/value-mismatch", reason: "ok", raw: "", line: 5 },
        ] as SuppressionAnnotation[],
      },
      {
        source: "doc-b.md",
        suppressions: [] as SuppressionAnnotation[],
      },
    ];

    const result = collectSuppressions(manifests);
    expect(result.has("doc-a.md")).toBe(true);
    expect(result.has("doc-b.md")).toBe(false);
    expect(result.get("doc-a.md")).toHaveLength(1);
  });
});

// ─── 10. Reconciler ─────────────────────────────────────────────────

describe("reconcileFactsWithEntities", () => {
  it("reports no findings when entity anchor matches doc fact", () => {
    const annotation = { kind: "events", raw: "<!-- @anchored-spec:events -->", line: 1 };
    const manifest = makeManifest("events.md", [
      makeBlock(
        "event-table",
        [
          makeFact({
            key: "dossier.success",
            kind: "event-table",
            source: { file: "events.md", line: 5 },
          }),
        ],
        { annotation, source: { file: "events.md", line: 1 } },
      ),
    ]);
    const entity = makeEntity({
      name: "svc-identity",
      anchors: { events: ["dossier.success"] },
    });

    const report = reconcileFactsWithEntities([manifest], [entity]);
    expect(report.findings).toHaveLength(0);
    expect(report.passed).toBe(true);
  });

  it("reports entity-missing-fact when entity declares anchor not in docs", () => {
    const manifest = makeManifest("events.md", [
      makeBlock("event-table", [
        makeFact({
          key: "dossier.success",
          kind: "event-table",
          source: { file: "events.md", line: 5 },
        }),
      ]),
    ]);
    const entity = makeEntity({
      name: "svc-identity",
      anchors: { events: ["dossier.success", "dossier.unknown"] },
    });

    const report = reconcileFactsWithEntities([manifest], [entity]);
    const missing = report.findings.find(
      (f) => f.rule === "ea:docs/entity-missing-fact",
    );
    expect(missing).toBeDefined();
    expect(missing!.severity).toBe("warning");
    expect(missing!.message).toContain("dossier.unknown");
  });

  it("reports fact-missing-entity when annotated doc fact has no entity anchor", () => {
    const annotation = { kind: "events", raw: "<!-- @anchored-spec:events -->", line: 1 };
    const manifest = makeManifest("events.md", [
      makeBlock(
        "event-table",
        [
          makeFact({
            key: "dossier.orphan",
            kind: "event-table",
            source: { file: "events.md", line: 5 },
          }),
        ],
        { annotation, source: { file: "events.md", line: 1 } },
      ),
    ]);
    const entity = makeEntity({
      name: "svc-identity",
      anchors: { events: ["dossier.success"] },
    });

    const report = reconcileFactsWithEntities([manifest], [entity]);
    const orphan = report.findings.find(
      (f) => f.rule === "ea:docs/fact-missing-entity",
    );
    expect(orphan).toBeDefined();
    expect(orphan!.severity).toBe("warning");
    expect(orphan!.message).toContain("dossier.orphan");
  });

  it("reports entity-mismatch for near-miss (same prefix, different suffix)", () => {
    const annotation = { kind: "events", raw: "<!-- @anchored-spec:events -->", line: 1 };
    const manifest = makeManifest("events.md", [
      makeBlock(
        "event-table",
        [
          makeFact({
            key: "dossier.succesful",
            kind: "event-table",
            source: { file: "events.md", line: 5 },
          }),
        ],
        { annotation, source: { file: "events.md", line: 1 } },
      ),
    ]);
    const entity = makeEntity({
      name: "svc-identity",
      anchors: { events: ["dossier.successful"] },
    });

    const report = reconcileFactsWithEntities([manifest], [entity]);
    const mismatch = report.findings.find(
      (f) => f.rule === "ea:docs/entity-mismatch",
    );
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe("error");
    expect(mismatch!.message).toContain("dossier.succesful");
    expect(mismatch!.message).toContain("dossier.successful");
  });
});
