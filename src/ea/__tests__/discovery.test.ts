import { afterEach, describe, expect, it } from "vitest";

import {
  createDraft,
  discoverArtifacts,
  matchDraftToExisting,
  renderDiscoveryReportMarkdown,
  type EaArtifactDraft,
} from "../discovery.js";
import { resolveConfigV1 } from "../config.js";
import {
  cleanupTestWorkspace,
  createTestWorkspace,
  makeArtifact,
  readTextFile,
  runCli,
  toBackstageEntity,
  writeTextFile,
} from "../../test-helpers/workspace.js";

const workspaces: string[] = [];

function makeWorkspace(prefix: string): string {
  const dir = createTestWorkspace(prefix);
  workspaces.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of workspaces.splice(0)) {
    cleanupTestWorkspace(dir);
  }
});

function makeDraft(overrides: Partial<EaArtifactDraft> = {}): EaArtifactDraft {
  return {
    suggestedId: overrides.suggestedId ?? "APP-payments",
    kind: overrides.kind ?? "application",
    title: overrides.title ?? "Payments",
    summary: overrides.summary ?? "Discovered application",
    status: "draft",
    confidence: overrides.confidence ?? "inferred",
    anchors: overrides.anchors,
    relations: overrides.relations,
    discoveredBy: overrides.discoveredBy ?? "test-resolver",
    discoveredAt: overrides.discoveredAt ?? new Date().toISOString(),
    kindSpecificFields: overrides.kindSpecificFields,
  };
}

describe("discovery helpers", () => {
  it("matches drafts by anchors before falling back to title", () => {
    const draft = makeDraft({
      title: "Payments",
      anchors: { repositoryUrl: ["https://github.com/acme/payments"] },
    });
    const existing = [
      toBackstageEntity(makeArtifact({ id: "APP-title", kind: "application", title: "Payments" })),
      toBackstageEntity(makeArtifact({
        id: "APP-anchor",
        kind: "application",
        title: "Different Title",
        anchors: { repositoryUrl: ["https://github.com/acme/payments"] },
      })),
    ];

    const match = matchDraftToExisting(draft, existing);
    expect(match?.match.metadata.name).toBe("anchor");
    expect(match?.matchedBy).toBe("anchor");
  });

  it("creates drafts with current resolver metadata and custom fields", () => {
    const draft = createDraft("api-contract", "Orders API", "openapi", {
      confidence: "observed",
      anchors: { specUrl: ["specs/orders.yaml"] },
      kindSpecificFields: { protocol: "rest", specification: "openapi" },
    });

    expect(draft.suggestedId).toBe("API-orders-api");
    expect(draft.confidence).toBe("observed");
    expect(draft.anchors).toEqual({ specUrl: ["specs/orders.yaml"] });
    expect(draft.kindSpecificFields).toEqual({
      protocol: "rest",
      specification: "openapi",
    });
  });

  it("writes unmatched drafts into the configured entity storage", async () => {
    const dir = makeWorkspace("discovery-write");
    const config = resolveConfigV1();

    const report = await discoverArtifacts({
      existingArtifacts: [
        toBackstageEntity(makeArtifact({
          id: "APP-existing",
          kind: "application",
          title: "Existing",
        })),
      ],
      drafts: [makeDraft({ title: "Fresh App", suggestedId: "APP-fresh-app" })],
      resolverNames: ["test-resolver"],
      projectRoot: dir,
      config,
    });

    expect(report.summary.newArtifacts).toBe(1);
    expect(report.newArtifacts[0]?.writtenTo).toContain("catalog-info.yaml");
    expect(readTextFile(dir, report.newArtifacts[0]!.writtenTo!)).toContain(
      "kind: Component",
    );
  });

  it("renders concise markdown reports for current discovery output", () => {
    const markdown = renderDiscoveryReportMarkdown({
      discoveredAt: "2025-01-01T00:00:00.000Z",
      resolversUsed: ["markdown"],
      summary: { newArtifacts: 1, matchedExisting: 0, suggestedUpdates: 0 },
      newArtifacts: [
        {
          suggestedId: "EVENT-order-placed",
          kind: "event-contract",
          title: "order.placed",
          confidence: "observed",
          discoveredBy: "markdown",
          writtenTo: null,
        },
      ],
      matchedExisting: [],
      suggestedUpdates: [],
    });

    expect(markdown).toContain("# Discovery Report");
    expect(markdown).toContain("event-contract");
    expect(markdown).toContain("order.placed");
  });
});

describe("discover CLI", () => {
  it("discovers markdown facts from an initialized inline workspace", () => {
    const dir = makeWorkspace("discovery-cli");
    expect(runCli(["init", "--force"], dir).exitCode).toBe(0);
    writeTextFile(
      dir,
      "docs/events.md",
      `| Event | Trigger |\n|-------|---------|\n| order.placed | Order submitted |\n`,
    );

    const result = runCli(
      ["discover", "--resolver", "markdown", "--dry-run", "--json"],
      dir,
    );
    expect(result.exitCode).toBe(0);

    const payload = JSON.parse(result.stdout) as {
      resolversUsed: string[];
      summary: { newArtifacts: number };
      newArtifacts: Array<{ kind: string }>;
    };
    expect(payload.resolversUsed).toContain("markdown");
    expect(payload.summary.newArtifacts).toBeGreaterThanOrEqual(1);
    expect(payload.newArtifacts[0]?.kind).toBe("event-contract");
  });

  it("rejects unknown resolvers with the current top-level command surface", () => {
    const dir = makeWorkspace("discovery-cli-error");
    expect(runCli(["init", "--force"], dir).exitCode).toBe(0);

    const result = runCli(["discover", "--resolver", "not-a-resolver"], dir);
    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      'Unknown resolver "not-a-resolver"',
    );
  });
});
