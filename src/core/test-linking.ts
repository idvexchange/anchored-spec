/**
 * Anchored Spec — Bidirectional Test Linking
 *
 * Scans test files for requirement ID references and cross-checks
 * against requirement testRefs for bidirectional traceability.
 */

import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { minimatch } from "minimatch";
import type { Requirement, TestMetadataConfig } from "./types.js";
import { discoverSourceFiles } from "./files.js";

const DEFAULT_TEST_GLOBS = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.test.js",
  "**/*.test.jsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/*.spec.js",
  "**/*.spec.jsx",
];

// Default pattern matches: REQ-1, REQ-123, etc.
const DEFAULT_REQ_PATTERN = /REQ-\d+/g;

export interface TestLinkFinding {
  reqId: string;
  testFile: string;
  direction: "req-to-test" | "test-to-req";
  status: "linked" | "orphan";
  message: string;
}

export interface TestLinkReport {
  findings: TestLinkFinding[];
  summary: {
    linkedTests: number;
    orphanTests: number;
    reqsMissingTests: number;
    reqsWithTests: number;
  };
}

/**
 * Check bidirectional test linking:
 * 1. Test files that mention REQ-* should be in that requirement's testRefs
 * 2. Requirements with testRefs should have files that mention them
 */
export function checkTestLinking(
  requirements: Requirement[],
  projectRoot: string,
  config?: TestMetadataConfig,
): TestLinkReport {
  const testGlobs = config?.testGlobs ?? DEFAULT_TEST_GLOBS;
  const reqPattern = config?.requirementPattern
    ? new RegExp(config.requirementPattern, "g")
    : DEFAULT_REQ_PATTERN;

  // Discover test files
  const testFiles = discoverSourceFiles([""], testGlobs, projectRoot, {
    ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
  });

  // Build map: testFile → Set<reqId>
  const testToReqs = new Map<string, Set<string>>();
  for (const file of testFiles) {
    const relPath = relative(projectRoot, file);
    try {
      const content = readFileSync(file, "utf-8");
      reqPattern.lastIndex = 0;
      const matches = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = reqPattern.exec(content)) !== null) {
        matches.add(match[0]);
      }
      if (matches.size > 0) {
        testToReqs.set(relPath, matches);
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Build map: reqId → Set<testFile> from testRefs
  const reqToTests = new Map<string, Set<string>>();
  const reqIds = new Set<string>();
  for (const req of requirements) {
    reqIds.add(req.id);
    const paths = new Set<string>();
    for (const ref of req.verification?.testRefs ?? []) {
      paths.add(ref.path);
    }
    for (const file of req.verification?.testFiles ?? []) {
      paths.add(file);
    }
    if (paths.size > 0) {
      reqToTests.set(req.id, paths);
    }
  }

  const findings: TestLinkFinding[] = [];

  // Check direction 1: test→req — test mentions REQ-* but isn't in testRefs
  for (const [testFile, reqs] of testToReqs) {
    for (const reqId of reqs) {
      if (!reqIds.has(reqId)) continue; // Skip unknown requirement IDs
      const reqTests = reqToTests.get(reqId);
      const isLinked =
        reqTests !== undefined &&
        (reqTests.has(testFile) ||
          [...reqTests].some((p) => minimatch(testFile, p)));

      if (!isLinked) {
        findings.push({
          reqId,
          testFile,
          direction: "test-to-req",
          status: "orphan",
          message: `Test file "${testFile}" references ${reqId} but is not listed in its testRefs/testFiles.`,
        });
      } else {
        findings.push({
          reqId,
          testFile,
          direction: "test-to-req",
          status: "linked",
          message: `Test file "${testFile}" correctly linked to ${reqId}.`,
        });
      }
    }
  }

  // Check direction 2: req→test — requirement lists testRef but no test file mentions it
  for (const req of requirements) {
    if (req.status !== "active" && req.status !== "shipped") continue;
    const testPaths = reqToTests.get(req.id);
    if (!testPaths || testPaths.size === 0) continue;

    const mentionedBy = new Set<string>();
    for (const [testFile, reqs] of testToReqs) {
      if (reqs.has(req.id)) mentionedBy.add(testFile);
    }

    if (mentionedBy.size === 0) {
      findings.push({
        reqId: req.id,
        testFile: [...testPaths][0]!,
        direction: "req-to-test",
        status: "orphan",
        message: `${req.id} has testRefs but no test file contains a reference back to it.`,
      });
    }
  }

  const linked = findings.filter((f) => f.status === "linked").length;
  const orphan = findings.filter((f) => f.status === "orphan").length;
  const reqsMissingTests = requirements.filter(
    (r) =>
      (r.status === "active" || r.status === "shipped") &&
      (!r.verification?.testRefs || r.verification.testRefs.length === 0) &&
      (!r.verification?.testFiles || r.verification.testFiles.length === 0),
  ).length;
  const reqsWithTests = requirements.filter(
    (r) =>
      (r.verification?.testRefs && r.verification.testRefs.length > 0) ||
      (r.verification?.testFiles && r.verification.testFiles.length > 0),
  ).length;

  return {
    findings,
    summary: {
      linkedTests: linked,
      orphanTests: orphan,
      reqsMissingTests,
      reqsWithTests,
    },
  };
}
