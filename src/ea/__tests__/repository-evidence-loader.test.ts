import { describe, expect, it } from "vitest";

import { resolveConfigV1 } from "../config.js";
import { loadRepositoryEvidenceAdapters } from "../repository-evidence-loader.js";

describe("repository evidence loader", () => {
  it("loads a custom adapter module from v1.2 config", async () => {
    const fixtureUrl = new URL("./fixtures/repository-evidence/custom-service-adapter.mjs", import.meta.url);
    const config = resolveConfigV1({
      schemaVersion: "1.2",
      repositoryEvidence: {
        adapters: [
          { path: fixtureUrl.pathname },
        ],
      },
    });

    const adapters = await loadRepositoryEvidenceAdapters(config, "/");

    expect(adapters).toHaveLength(1);
    expect(adapters[0]?.id).toBe("custom-service-adapter");
    expect(adapters[0]?.discoverTargets("/")).toEqual([
      {
        id: "payments-service",
        name: "payments-service",
        path: "services/payments",
        kind: "service-unit",
      },
    ]);
  });
});
