import { afterEach, describe, expect, it } from "vitest";

import { EaRoot } from "../loader.js";
import { runEaVerification } from "../verify.js";
import {
  cleanupTestWorkspace,
  createTestWorkspace,
  makeArtifact,
  writeManifestProject,
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

async function verifyArtifacts(
  prefix: string,
  artifacts: Array<ReturnType<typeof makeArtifact>>,
  options?: Parameters<typeof runEaVerification>[1],
) {
  const dir = makeWorkspace(prefix);
  const config = writeManifestProject(dir, artifacts);
  const root = new EaRoot(dir, config);
  return runEaVerification(root, options);
}

describe("runEaVerification", () => {
  it("reports broken relation targets as errors", async () => {
    const result = await verifyArtifacts("verify-broken-relation", [
      makeArtifact({
        id: "APP-payments",
        kind: "application",
        relations: [{ type: "uses", target: "SVC-missing" }],
      }),
    ]);

    expect(result.passed).toBe(false);
    expect(
      result.findings.some(
        (finding) => finding.rule === "ea:verify:broken-relation-target",
      ),
    ).toBe(true);
  });

  it("passes a singly owned active entity without treating owner linkage as orphaned", async () => {
    const result = await verifyArtifacts("verify-orphan", [
      makeArtifact({ id: "SVC-auth", kind: "service" }),
    ]);

    expect(result.passed).toBe(true);
    expect(result.findings.some((finding) => finding.severity === "error")).toBe(false);
  });

  it("flags deprecated artifacts that lack an explanation", async () => {
    const result = await verifyArtifacts("verify-deprecated", [
      makeArtifact({
        id: "SVC-legacy",
        kind: "service",
        status: "deprecated",
        summary: "Old service",
        tags: [],
      }),
    ]);

    expect(
      result.findings.some(
        (finding) => finding.rule === "ea:verify:deprecated-needs-reason",
      ),
    ).toBe(true);
  });

  it("supports strict mode and rule overrides for current v2 findings", async () => {
    const artifacts = [
      makeArtifact({
        id: "BASE-migration",
        kind: "baseline",
        status: "active",
      }),
    ];

    const strictResult = await verifyArtifacts("verify-strict", artifacts, {
      strict: true,
    });
    expect(strictResult.passed).toBe(false);
    expect(
      strictResult.findings.some(
        (finding) =>
          finding.rule === "ea:verify:transition-needs-target" &&
          finding.severity === "error",
      ),
    ).toBe(true);

    const overriddenResult = await verifyArtifacts(
      "verify-overrides",
      artifacts,
      {
        ruleOverrides: { "ea:verify:transition-needs-target": "off" },
      },
    );
    expect(
      overriddenResult.findings.some(
        (finding) => finding.rule === "ea:verify:transition-needs-target",
      ),
    ).toBe(false);
  });
});
