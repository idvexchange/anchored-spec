import { describe, expect, it } from "vitest";
import { buildBackstageDiagram } from "../diagrams/backstage.js";
import { makeEntity } from "../../test-helpers/workspace.js";

describe("backstage diagrams", () => {
  it("builds a system-view projection from Backstage entities", () => {
    const projection = buildBackstageDiagram([
      makeEntity({ ref: "domain:commerce", kind: "Domain" }),
      makeEntity({
        ref: "system:checkout",
        kind: "System",
        domain: "commerce",
      }),
      makeEntity({
        ref: "component:web",
        kind: "Component",
        type: "website",
        system: "checkout",
        dependsOn: ["resource:checkout-db"],
        providesApis: ["api:checkout-api"],
      }),
      makeEntity({
        ref: "resource:checkout-db",
        kind: "Resource",
        type: "database",
        system: "checkout",
      }),
      makeEntity({
        ref: "api:checkout-api",
        kind: "API",
        type: "openapi",
        system: "checkout",
        definition: "openapi: 3.0.0",
      }),
      makeEntity({
        ref: "requirement:latency",
        kind: "Requirement",
        category: "technical",
        priority: "must",
        status: "accepted",
      }),
    ]);

    expect(projection.key).toBe("backstage");
    expect(projection.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "domain:default/commerce",
        "system:default/checkout",
        "component:default/web",
        "resource:default/checkout-db",
        "api:default/checkout-api",
      ]),
    );
    expect(projection.nodes.map((node) => node.id)).not.toContain(
      "requirement:default/latency",
    );
    expect(projection.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "system:default/checkout",
          target: "domain:default/commerce",
          type: "inDomain",
          category: "hierarchy",
        }),
        expect.objectContaining({
          source: "component:default/web",
          target: "system:default/checkout",
          type: "partOf",
          category: "hierarchy",
        }),
        expect.objectContaining({
          source: "component:default/web",
          target: "resource:default/checkout-db",
          type: "dependsOn",
          category: "relation",
        }),
        expect.objectContaining({
          source: "component:default/web",
          target: "api:default/checkout-api",
          type: "exposes",
          category: "relation",
        }),
      ]),
    );
  });
});
