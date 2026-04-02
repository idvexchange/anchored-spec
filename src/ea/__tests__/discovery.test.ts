import { afterEach, describe, expect, it } from "vitest";
import { createDraft, discoverEntities, matchDraftToExisting, renderDiscoveryReportMarkdown, type EntityDraft, } from "../discovery.js";
import { getSchemaDescriptor } from "../backstage/kind-mapping.js";
import { resolveConfigV1 } from "../config.js";
import { cleanupTestWorkspace, createTestWorkspace, makeEntity, readTextFile, runCli, writeTextFile } from "../../test-helpers/workspace.js";
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
function makeDraft(overrides: Partial<EntityDraft> = {}): EntityDraft {
    return {
        suggestedId: overrides.suggestedId ?? "component:payments",
        apiVersion: overrides.apiVersion ?? "backstage.io/v1alpha1",
        kind: overrides.kind ?? "Component",
        type: overrides.type ?? "website",
        schema: overrides.schema ?? "application",
        title: overrides.title ?? "Payments",
        summary: overrides.summary ?? "Discovered application",
        status: "draft",
        confidence: overrides.confidence ?? "inferred",
        anchors: overrides.anchors,
        relations: overrides.relations,
        discoveredBy: overrides.discoveredBy ?? "test-resolver",
        discoveredAt: overrides.discoveredAt ?? new Date().toISOString(),
        schemaFields: overrides.schemaFields
    };
}
describe("discovery helpers", () => {
    it("matches drafts by anchors before falling back to title", () => {
        const draft = makeDraft({
            title: "Payments",
            anchors: { repositoryUrl: ["https://github.com/acme/payments"] }
        });
        const existing = [
            makeEntity({ ref: "component:title", kind: "Component", type: "website", title: "Payments" }),
            makeEntity({
                ref: "component:anchor",
                kind: "Component",
                type: "website",
                title: "Different Title",
                anchors: { repositoryUrl: ["https://github.com/acme/payments"] }
            }),
        ];
        const match = matchDraftToExisting(draft, existing);
        expect(match?.match.metadata.name).toBe("anchor");
        expect(match?.matchedBy).toBe("anchor");
    });
    it("creates drafts with current resolver metadata and custom fields", () => {
        const draft = createDraft(getSchemaDescriptor("api-contract")!, "Orders API", "openapi", {
            confidence: "observed",
            anchors: { specUrl: ["specs/orders.yaml"] },
            schemaFields: { protocol: "rest", specification: "openapi" }
        });
        expect(draft.suggestedId).toBe("api:orders-api");
        expect(draft.kind).toBe("API");
        expect(draft.type).toBe("openapi");
        expect(draft.schema).toBe("api-contract");
        expect(draft.confidence).toBe("observed");
        expect(draft.anchors).toEqual({ specUrl: ["specs/orders.yaml"] });
        expect(draft.schemaFields).toEqual({
            protocol: "rest",
            specification: "openapi"
        });
    });
    it("writes unmatched drafts into the configured entity storage", async () => {
        const dir = makeWorkspace("discovery-write");
        const config = resolveConfigV1();
        const report = await discoverEntities({
            existingEntities: [
                makeEntity({
                    ref: "component:existing",
                    kind: "Component",
                    type: "website",
                    title: "Existing"
                })
            ],
            drafts: [makeDraft({ title: "Fresh App", suggestedId: "component:fresh-app" })],
            resolverNames: ["test-resolver"],
            projectRoot: dir,
            config
        });
        expect(report.summary.newEntities).toBe(1);
        expect(report.newEntities[0]?.writtenTo).toContain("catalog-info.yaml");
        expect(readTextFile(dir, report.newEntities[0]!.writtenTo!)).toContain("kind: Component");
    });
    it("renders concise markdown reports for current discovery output", () => {
        const markdown = renderDiscoveryReportMarkdown({
            discoveredAt: "2025-01-01T00:00:00.000Z",
            resolversUsed: ["markdown"],
            summary: { newEntities: 1, matchedExisting: 0, suggestedUpdates: 0 },
            newEntities: [
                {
                    suggestedId: "api:order-placed",
                    kind: "API",
                    type: "asyncapi",
                    schema: "event-contract",
                    title: "order.placed",
                    confidence: "observed",
                    discoveredBy: "markdown",
                    writtenTo: null
                }
            ],
            matchedExisting: [],
            suggestedUpdates: []
        });
        expect(markdown).toContain("# Discovery Report");
        expect(markdown).toContain("API");
        expect(markdown).toContain("order.placed");
    });
});
describe("discover CLI", () => {
    it("discovers markdown facts from an initialized inline workspace", () => {
        const dir = makeWorkspace("discovery-cli");
        expect(runCli(["init", "--force"], dir).exitCode).toBe(0);
        writeTextFile(dir, "docs/events.md", `| Event | Trigger |\n|-------|---------|\n| order.placed | Order submitted |\n`);
        const result = runCli(["discover", "--resolver", "markdown", "--dry-run", "--json"], dir);
        expect(result.exitCode).toBe(0);
        const payload = JSON.parse(result.stdout) as {
            resolversUsed: string[];
            summary: {
                newEntities: number;
            };
            newEntities: Array<{
                kind: string;
                schema: string;
            }>;
        };
        expect(payload.resolversUsed).toContain("markdown");
        expect(payload.summary.newEntities).toBeGreaterThanOrEqual(1);
        expect(payload.newEntities[0]?.kind).toBe("API");
        expect(payload.newEntities[0]?.schema).toBe("event-contract");
    });
    it("rejects unknown resolvers with the current top-level command surface", () => {
        const dir = makeWorkspace("discovery-cli-error");
        expect(runCli(["init", "--force"], dir).exitCode).toBe(0);
        const result = runCli(["discover", "--resolver", "not-a-resolver"], dir);
        expect(result.exitCode).not.toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain('Unknown resolver "not-a-resolver"');
    });
});
