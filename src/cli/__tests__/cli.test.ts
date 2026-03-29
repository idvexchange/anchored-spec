import { describe, it, expect } from "vitest";

describe("CLI", () => {
  it("exports all EA commands", async () => {
    const { eaInitCommand } = await import("../commands/ea-init.js");
    const { eaCreateCommand } = await import("../commands/ea-create.js");
    const { eaValidateCommand } = await import("../commands/ea-validate.js");
    const { eaGenerateCommand } = await import("../commands/ea-generate.js");
    const { eaStatusCommand } = await import("../commands/ea-status.js");
    const { eaTransitionCommand } = await import("../commands/ea-transition.js");
    const { eaDriftCommand } = await import("../commands/ea-drift.js");
    const { eaDiscoverCommand } = await import("../commands/ea-discover.js");
    const { eaReportCommand } = await import("../commands/ea-report.js");
    const { eaEvidenceCommand } = await import("../commands/ea-evidence.js");
    const { eaGraphCommand } = await import("../commands/ea-graph.js");
    const { eaImpactCommand } = await import("../commands/ea-impact.js");
    const { migrateConfigCommand } = await import("../commands/migrate-config.js");

    expect(typeof eaInitCommand).toBe("function");
    expect(typeof eaCreateCommand).toBe("function");
    expect(typeof eaValidateCommand).toBe("function");
    expect(typeof eaGenerateCommand).toBe("function");
    expect(typeof eaStatusCommand).toBe("function");
    expect(typeof eaTransitionCommand).toBe("function");
    expect(typeof eaDriftCommand).toBe("function");
    expect(typeof eaDiscoverCommand).toBe("function");
    expect(typeof eaReportCommand).toBe("function");
    expect(typeof eaEvidenceCommand).toBe("function");
    expect(typeof eaGraphCommand).toBe("function");
    expect(typeof eaImpactCommand).toBe("function");
    expect(typeof migrateConfigCommand).toBe("function");
  });
});
