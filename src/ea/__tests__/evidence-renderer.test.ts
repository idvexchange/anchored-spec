import { describe, expect, it } from "vitest";

import {
  renderExplanation,
  renderExplanationList,
} from "../evidence-renderer.js";
import type { ExplainableItem } from "../evidence-renderer.js";
import type { GraphEdge } from "../graph.js";

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeEdge(overrides: Partial<GraphEdge> & { source: string; target: string; type: string }): GraphEdge {
  return {
    isVirtual: false,
    criticality: "medium",
    confidence: "declared",
    status: "active",
    ...overrides,
  };
}

const fullItem: ExplainableItem = {
  ref: "component:identity-gateway",
  kind: "service",
  title: "Identity Gateway",
  reason: "Directly depends on Component:auth via `dependsOn` relation (depth 1)",
  evidence: [
    "Relation declared in entity spec",
    "Traced via docs/api-spec.md",
  ],
  path: [
    makeEdge({ source: "component:auth", target: "component:identity-gateway", type: "dependsOn" }),
  ],
  scoreBreakdown: {
    distance: 0.25,
    edgeType: 0.22,
    confidence: 0.15,
    canonicality: 0.12,
    directionality: 0.06,
    changeType: 0.05,
  },
};

const minimalItem: ExplainableItem = {
  ref: "component:payments",
  kind: "application",
  reason: "Referenced in frontmatter of docs/payments.md",
  evidence: [],
};

// ─── Tests ────────────────────────────────────────────────────────────

describe("evidence-renderer", () => {
  describe("renderExplanation — markdown", () => {
    it("renders a full item with all fields", () => {
      const result = renderExplanation(fullItem, "markdown");

      // Header with ref, kind, and title
      expect(result).toContain("### component:identity-gateway (service) — Identity Gateway");

      // Reason
      expect(result).toContain("**Why:** Directly depends on Component:auth via `dependsOn` relation (depth 1)");

      // Score breakdown — all 6 dimensions
      expect(result).toContain("**Score breakdown:**");
      expect(result).toContain("- Path distance: 0.25");
      expect(result).toContain("- Edge type: 0.22");
      expect(result).toContain("- Confidence: 0.15");
      expect(result).toContain("- Canonicality: 0.12");
      expect(result).toContain("- Directionality: 0.06");
      expect(result).toContain("- Change type: 0.05");

      // Path
      expect(result).toContain("**Path:**");
      expect(result).toContain("component:auth →[dependsOn]→ component:identity-gateway");

      // Evidence
      expect(result).toContain("**Evidence:**");
      expect(result).toContain("- Relation declared in entity spec");
      expect(result).toContain("- Traced via docs/api-spec.md");
    });

    it("renders a minimal item without optional fields", () => {
      const result = renderExplanation(minimalItem, "markdown");

      expect(result).toContain("### component:payments (application)");
      expect(result).toContain("**Why:** Referenced in frontmatter of docs/payments.md");

      // No title suffix
      expect(result).not.toContain("—");

      // No optional sections
      expect(result).not.toContain("**Score breakdown:**");
      expect(result).not.toContain("**Path:**");
      expect(result).not.toContain("**Evidence:**");
    });

    it("omits score breakdown when empty object", () => {
      const item: ExplainableItem = {
        ...minimalItem,
        scoreBreakdown: {},
      };
      const result = renderExplanation(item, "markdown");
      expect(result).not.toContain("**Score breakdown:**");
    });

    it("omits path when empty array", () => {
      const item: ExplainableItem = {
        ...minimalItem,
        path: [],
      };
      const result = renderExplanation(item, "markdown");
      expect(result).not.toContain("**Path:**");
    });
  });

  describe("renderExplanation — json", () => {
    it("renders a full item as structured JSON", () => {
      const result = renderExplanation(fullItem, "json");
      const parsed = JSON.parse(result);

      expect(parsed.ref).toBe("component:identity-gateway");
      expect(parsed.kind).toBe("service");
      expect(parsed.title).toBe("Identity Gateway");
      expect(parsed.reason).toContain("dependsOn");
      expect(parsed.evidence).toHaveLength(2);
      expect(parsed.path).toHaveLength(1);
      expect(parsed.path[0].type).toBe("dependsOn");
      expect(parsed.scoreBreakdown).toEqual({
        distance: 0.25,
        edgeType: 0.22,
        confidence: 0.15,
        canonicality: 0.12,
        directionality: 0.06,
        changeType: 0.05,
      });
    });

    it("renders a minimal item as JSON", () => {
      const result = renderExplanation(minimalItem, "json");
      const parsed = JSON.parse(result);

      expect(parsed.ref).toBe("component:payments");
      expect(parsed.kind).toBe("application");
      expect(parsed.title).toBeUndefined();
      expect(parsed.path).toBeUndefined();
      expect(parsed.scoreBreakdown).toBeUndefined();
      expect(parsed.evidence).toEqual([]);
    });
  });

  describe("renderExplanationList — markdown", () => {
    it("renders multiple items separated by horizontal rules", () => {
      const result = renderExplanationList([fullItem, minimalItem], "markdown");

      expect(result).toContain("### component:identity-gateway (service)");
      expect(result).toContain("---");
      expect(result).toContain("### component:payments (application)");
    });

    it("returns placeholder for empty list", () => {
      const result = renderExplanationList([], "markdown");
      expect(result).toContain("_No items to explain._");
    });

    it("renders single item without separator", () => {
      const result = renderExplanationList([minimalItem], "markdown");
      expect(result).not.toContain("---");
      expect(result).toContain("### component:payments (application)");
    });
  });

  describe("renderExplanationList — json", () => {
    it("renders as JSON array", () => {
      const result = renderExplanationList([fullItem, minimalItem], "json");
      const parsed = JSON.parse(result);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].ref).toBe("component:identity-gateway");
      expect(parsed[1].ref).toBe("component:payments");
    });

    it("renders empty array for no items", () => {
      const result = renderExplanationList([], "json");
      const parsed = JSON.parse(result);
      expect(parsed).toEqual([]);
    });
  });

  describe("evidence strings formatting", () => {
    it("formats each evidence string as a bullet point in markdown", () => {
      const item: ExplainableItem = {
        ref: "component:test",
        kind: "service",
        reason: "test reason",
        evidence: [
          "First evidence line",
          "Second evidence line",
          "Third evidence line",
        ],
      };
      const result = renderExplanation(item, "markdown");

      expect(result).toContain("- First evidence line");
      expect(result).toContain("- Second evidence line");
      expect(result).toContain("- Third evidence line");
    });

    it("preserves evidence strings verbatim in JSON", () => {
      const item: ExplainableItem = {
        ref: "component:test",
        kind: "service",
        reason: "test reason",
        evidence: ["A --[dependsOn]--> B", "Traced via docs/spec.md"],
      };
      const result = renderExplanation(item, "json");
      const parsed = JSON.parse(result);
      expect(parsed.evidence).toEqual(["A --[dependsOn]--> B", "Traced via docs/spec.md"]);
    });
  });

  describe("score breakdown — all 6 dimensions", () => {
    it("renders all 6 scoring dimensions with human-readable labels", () => {
      const item: ExplainableItem = {
        ref: "component:test",
        kind: "service",
        reason: "test",
        evidence: [],
        scoreBreakdown: {
          distance: 1.0,
          edgeType: 0.9,
          confidence: 0.8,
          canonicality: 0.7,
          directionality: 0.6,
          changeType: 0.5,
        },
      };
      const result = renderExplanation(item, "markdown");

      expect(result).toContain("Path distance: 1.00");
      expect(result).toContain("Edge type: 0.90");
      expect(result).toContain("Confidence: 0.80");
      expect(result).toContain("Canonicality: 0.70");
      expect(result).toContain("Directionality: 0.60");
      expect(result).toContain("Change type: 0.50");
    });

    it("handles unknown dimension keys gracefully", () => {
      const item: ExplainableItem = {
        ref: "component:test",
        kind: "service",
        reason: "test",
        evidence: [],
        scoreBreakdown: { customDimension: 0.42 },
      };
      const result = renderExplanation(item, "markdown");
      expect(result).toContain("customDimension: 0.42");
    });
  });

  describe("path rendering", () => {
    it("renders multi-hop paths in order", () => {
      const item: ExplainableItem = {
        ref: "component:c",
        kind: "service",
        reason: "transitive impact",
        evidence: [],
        path: [
          makeEdge({ source: "component:a", target: "component:b", type: "dependsOn" }),
          makeEdge({ source: "component:b", target: "component:c", type: "uses" }),
        ],
      };
      const result = renderExplanation(item, "markdown");

      expect(result).toContain("**Path:**");
      expect(result).toContain("component:a →[dependsOn]→ component:b");
      expect(result).toContain("component:b →[uses]→ component:c");

      // Verify order
      const pathIdx1 = result.indexOf("component:a →[dependsOn]→ component:b");
      const pathIdx2 = result.indexOf("component:b →[uses]→ component:c");
      expect(pathIdx1).toBeLessThan(pathIdx2);
    });
  });
});
