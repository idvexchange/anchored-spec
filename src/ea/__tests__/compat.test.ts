/**
 * Tests for the EA Compatibility Classifier
 */
import { describe, it, expect } from "vitest";
import { diffEntities } from "../diff.js";
import { assessCompatibility, renderCompatSummary, renderCompatMarkdown, } from "../compat.js";
import type { BackstageEntity } from "../backstage/types.js";
import { makeEntity as _makeEntity } from "./helpers/make-entity.js";
// ─── Helpers ────────────────────────────────────────────────────────────────────
/**
 * Create a BackstageEntity for compat testing.
 * and injects spec.status / spec.confidence so the diff engine produces field
 * names the compat rules can detect.
 */
function makeEntity(overrides: Parameters<typeof _makeEntity>[0]): BackstageEntity {
    const entity = _makeEntity(overrides);
    const spec = entity.spec as Record<string, unknown>;
    spec.status = overrides.status ?? "active";
    spec.confidence = overrides.confidence ?? "declared";
    return entity;
}
function assess(base: BackstageEntity[], head: BackstageEntity[]) {
    const diff = diffEntities(base, head);
    return assessCompatibility(diff, { base, head });
}
// ─── assessCompatibility ────────────────────────────────────────────────────────
describe("assessCompatibility", () => {
    it("returns 'none' for empty diff", () => {
        const report = assess([], []);
        expect(report.overallLevel).toBe("none");
        expect(report.assessments).toHaveLength(0);
    });
    it("returns 'none' for identical entities", () => {
        const entities = [makeEntity({ ref: "component:a", kind: "Component", type: "website" })];
        const report = assess(entities, [...entities]);
        expect(report.overallLevel).toBe("none");
    });
    it("classifies new entities as additive", () => {
        const head = [makeEntity({ ref: "component:new", kind: "Component", type: "website" })];
        const report = assess([], head);
        expect(report.overallLevel).toBe("additive");
        expect(report.summary.additive).toBe(1);
        expect(report.assessments[0].reasons[0].rule).toBe("compat:entity-added");
    });
    it("classifies removal of active entity as breaking", () => {
        const base = [makeEntity({ ref: "component:a", kind: "Component", type: "website", status: "active" })];
        const report = assess(base, []);
        expect(report.overallLevel).toBe("breaking");
        expect(report.assessments[0].reasons.some((r) => r.rule === "compat:entity-removed")).toBe(true);
    });
    it("classifies removal of deprecated entity as compatible", () => {
        const base = [makeEntity({ ref: "component:a", kind: "Component", type: "website", status: "deprecated" })];
        const report = assess(base, []);
        expect(report.overallLevel).toBe("compatible");
        expect(report.assessments[0].reasons.some((r) => r.rule === "compat:entity-removed-deprecated")).toBe(true);
    });
    it("classifies removal of retired entity as no breaking impact", () => {
        const base = [makeEntity({ ref: "component:a", kind: "Component", type: "website", status: "retired" })];
        const report = assess(base, []);
        // retired → not in LIVE_STATUSES, not deprecated → no specific rule fires
        const assessment = report.assessments[0];
        expect(assessment.reasons.every((r) => r.level !== "breaking")).toBe(true);
    });
    it("detects status regression as breaking", () => {
        const base = [makeEntity({ ref: "component:a", kind: "Component", type: "website", status: "active" })];
        const head = [makeEntity({ ref: "component:a", kind: "Component", type: "website", status: "draft" })];
        const report = assess(base, head);
        expect(report.overallLevel).toBe("breaking");
        expect(report.assessments[0].reasons.some((r) => r.rule === "compat:status-regression")).toBe(true);
    });
    it("detects status deprecation as compatible", () => {
        const base = [makeEntity({ ref: "component:a", kind: "Component", type: "website", status: "active" })];
        const head = [makeEntity({ ref: "component:a", kind: "Component", type: "website", status: "deprecated" })];
        const report = assess(base, head);
        const reasons = report.assessments[0].reasons;
        expect(reasons.some((r) => r.rule === "compat:status-deprecation")).toBe(true);
    });
    it("detects relation removal as breaking", () => {
        const base = [makeEntity({
                ref: "component:a",
                kind: "Component",
                type: "website",
                uses: ["component:b"]
            })];
        const head = [makeEntity({ ref: "component:a", kind: "Component", type: "website" })];
        const report = assess(base, head);
        expect(report.assessments[0].reasons.some((r) => r.rule === "compat:relation-removed")).toBe(true);
    });
    it("detects relation addition as additive", () => {
        const base = [makeEntity({ ref: "component:a", kind: "Component", type: "website" })];
        const head = [makeEntity({
                ref: "component:a",
                kind: "Component",
                type: "website",
                uses: ["component:b"]
            })];
        const report = assess(base, head);
        expect(report.assessments[0].reasons.some((r) => r.rule === "compat:relation-added")).toBe(true);
    });
    it("detects anchor removal as breaking", () => {
        const base = [makeEntity({
                ref: "component:a",
                kind: "Component",
                type: "website",
                anchors: { apis: ["GET /health"] }
            })];
        const head = [makeEntity({ ref: "component:a", kind: "Component", type: "website", anchors: {} })];
        const report = assess(base, head);
        expect(report.assessments[0].reasons.some((r) => r.rule === "compat:anchor-removed")).toBe(true);
    });
    it("detects anchor addition as additive", () => {
        const base = [makeEntity({ ref: "component:a", kind: "Component", type: "website", anchors: {} })];
        const head = [makeEntity({
                ref: "component:a",
                kind: "Component",
                type: "website",
                anchors: { apis: ["GET /health"] }
            })];
        const report = assess(base, head);
        expect(report.assessments[0].reasons.some((r) => r.rule === "compat:anchor-added")).toBe(true);
    });
    it("detects kind change as breaking", () => {
        // In Backstage model, changing kind creates a different entity ref,
        // so it manifests as removal of the old entity + addition of the new one
        const base = [makeEntity({ ref: "component:a", kind: "Component", type: "website", status: "active" })];
        const head = [makeEntity({ ref: "api:a", kind: "API", type: "openapi" })];
        const report = assess(base, head);
        expect(report.assessments.some((a) => a.reasons.some((r) => r.rule === "compat:entity-removed"))).toBe(true);
        expect(report.overallLevel).toBe("breaking");
    });
    it("classifies metadata-only changes as none", () => {
        const base = [makeEntity({ ref: "component:a", kind: "Component", type: "website", title: "Old Title" })];
        const head = [makeEntity({ ref: "component:a", kind: "Component", type: "website", title: "New Title" })];
        const report = assess(base, head);
        expect(report.assessments[0].reasons.some((r) => r.rule === "compat:metadata-only")).toBe(true);
        expect(report.assessments[0].level).toBe("none");
    });
    it("detects confidence downgrade as ambiguous", () => {
        const base = [makeEntity({ ref: "component:a", kind: "Component", type: "website", confidence: "declared" })];
        const head = [makeEntity({ ref: "component:a", kind: "Component", type: "website", confidence: "inferred" })];
        const report = assess(base, head);
        expect(report.assessments[0].reasons.some((r) => r.rule === "compat:confidence-downgrade")).toBe(true);
    });
    it("detects contractual field removal as breaking", () => {
        const base = [makeEntity({ ref: "api:a", kind: "API", type: "openapi" })];
        (base[0].spec as Record<string, unknown>).protocol = "rest";
        const head = [makeEntity({ ref: "api:a", kind: "API", type: "openapi" })];
        const report = assess(base, head);
        expect(report.assessments[0].reasons.some((r) => r.rule === "compat:contract-field-removed")).toBe(true);
    });
    it("detects contractual field addition as additive", () => {
        const base = [makeEntity({ ref: "api:a", kind: "API", type: "openapi" })];
        const head = [makeEntity({ ref: "api:a", kind: "API", type: "openapi" })];
        (head[0].spec as Record<string, unknown>).protocol = "rest";
        const report = assess(base, head);
        expect(report.assessments[0].reasons.some((r) => r.rule === "compat:contract-field-added")).toBe(true);
    });
    it("detects contractual field modification as ambiguous", () => {
        const base = [makeEntity({ ref: "api:a", kind: "API", type: "openapi" })];
        (base[0].spec as Record<string, unknown>).protocol = "rest";
        const head = [makeEntity({ ref: "api:a", kind: "API", type: "openapi" })];
        (head[0].spec as Record<string, unknown>).protocol = "grpc";
        const report = assess(base, head);
        expect(report.assessments[0].reasons.some((r) => r.rule === "compat:contract-field-modified")).toBe(true);
    });
    it("overall level is worst across all assessments", () => {
        const base = [
            makeEntity({ ref: "component:a", kind: "Component", type: "website", title: "A" }),
            makeEntity({ ref: "component:b", kind: "Component", type: "website", status: "active" }),
        ];
        const head = [
            makeEntity({ ref: "component:a", kind: "Component", type: "website", title: "A Updated" }),
            // APP-b removed → breaking
        ];
        const report = assess(base, head);
        expect(report.overallLevel).toBe("breaking");
    });
    it("includes baseRef and headRef from diff report", () => {
        const diff = diffEntities([], [], { baseRef: "v1.0", headRef: "v2.0" });
        const report = assessCompatibility(diff);
        expect(report.baseRef).toBe("v1.0");
        expect(report.headRef).toBe("v2.0");
    });
});
// ─── renderCompatSummary ────────────────────────────────────────────────────────
describe("renderCompatSummary", () => {
    it("returns 'No changes to assess' for empty report", () => {
        const report = assess([], []);
        expect(renderCompatSummary(report)).toBe("No changes to assess");
    });
    it("includes level counts", () => {
        const base = [makeEntity({ ref: "component:a", kind: "Component", type: "website", status: "active" })];
        const head = [
            makeEntity({ ref: "component:b", kind: "Component", type: "website" }),
        ];
        const report = assess(base, head);
        const summary = renderCompatSummary(report);
        expect(summary).toContain("BREAKING");
    });
});
// ─── renderCompatMarkdown ───────────────────────────────────────────────────────
describe("renderCompatMarkdown", () => {
    it("renders header with refs", () => {
        const diff = diffEntities([], [], { baseRef: "main", headRef: "dev" });
        const report = assessCompatibility(diff);
        const md = renderCompatMarkdown(report);
        expect(md).toContain("# Compatibility Assessment: main..dev");
    });
    it("renders breaking changes section", () => {
        const base = [makeEntity({ ref: "component:a", kind: "Component", type: "website", status: "active" })];
        const md = renderCompatMarkdown(assess(base, []));
        expect(md).toContain("Breaking Changes");
        expect(md).toContain("component:default/a");
    });
    it("renders additive changes section", () => {
        const head = [makeEntity({ ref: "component:new", kind: "Component", type: "website" })];
        const md = renderCompatMarkdown(assess([], head));
        expect(md).toContain("Additive Changes");
        expect(md).toContain("component:default/new");
    });
});
