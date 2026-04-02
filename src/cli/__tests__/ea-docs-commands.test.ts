import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTestWorkspace,
  createTestWorkspace,
  runCli,
  writeTextFile,
} from "../../test-helpers/workspace.js";

let workspace: string;

beforeEach(() => {
  workspace = createTestWorkspace("docs-cli");
  expect(runCli(["init", "--force"], workspace).exitCode).toBe(0);
});

afterEach(() => {
  cleanupTestWorkspace(workspace);
});

describe("docs-oriented CLI commands", () => {
  it("discovers markdown facts with the top-level discover command", () => {
    writeTextFile(
      workspace,
      "docs/events.md",
      `# Events\n\n| Event | Trigger |\n|-------|---------|\n| order.placed | Order submitted |\n| order.shipped | Order shipped |\n`,
    );

    const result = runCli(
      ["discover", "--resolver", "markdown", "--dry-run", "--json"],
      workspace,
    );
    expect(result.exitCode).toBe(0);

    const payload = JSON.parse(result.stdout) as {
      resolversUsed: string[];
      summary: { newEntities: number };
      newEntities: Array<{ kind: string; schema: string }>;
    };
    expect(payload.resolversUsed).toContain("markdown");
    expect(payload.summary.newEntities).toBeGreaterThanOrEqual(1);
    expect(payload.newEntities[0]?.kind).toBe("API");
    expect(payload.newEntities[0]?.schema).toBe("event-contract");
  });

  it("reports document drift conflicts in JSON", () => {
    writeTextFile(
      workspace,
      "docs/api.md",
      `| Event | Trigger |\n|-------|---------|\n| dossier.success | Verification passed |\n`,
    );
    writeTextFile(
      workspace,
      "docs/guide.md",
      `| Event | Trigger |\n|-------|---------|\n| dossier.success | Identity verified |\n`,
    );

    const result = runCli(["drift", "--domain", "docs", "--json"], workspace);
    expect(result.exitCode).toBe(1);

    const payload = JSON.parse(result.stdout) as {
      consistency: { passed: boolean; findings: Array<{ message: string }> };
    };
    expect(payload.consistency.passed).toBe(false);
    expect(
      payload.consistency.findings.some((finding) =>
        finding.message.includes("dossier.success"),
      ),
    ).toBe(true);
  });

  it("suggests @anchored-spec annotations without relying on legacy command aliases", () => {
    writeTextFile(
      workspace,
      "docs/orders.md",
      `| Event | Trigger |\n|-------|---------|\n| order.cancelled | Customer requested cancellation |\n`,
    );

    const result = runCli(["link-docs", "--annotate", "--json"], workspace);
    expect(result.exitCode).toBe(0);

    const payload = JSON.parse(result.stdout) as {
      suggestions: Array<{ annotation: string }>;
      summary: { total: number };
    };
    expect(payload.summary.total).toBeGreaterThanOrEqual(1);
    expect(payload.suggestions[0]?.annotation).toContain("@anchored-spec:");
  });
});
