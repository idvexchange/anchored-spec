# Evidence & Impact

Prove that tests actually pass and trace which requirements are affected by code changes.

## Test Evidence Pipeline

Evidence-based verification goes beyond declaring test coverage — it ingests real test runner output to prove tests actually pass.

### Collecting Evidence

```bash
# 1. Run tests and generate a JSON report
npx vitest run --reporter=json --outputFile=vitest-report.json

# 2. Ingest the report into an evidence artifact
npx anchored-spec evidence collect --from vitest-report.json --format vitest

# 3. Validate evidence against requirements
npx anchored-spec evidence validate
```

### Supported Formats

| Format | Test Runner | Output Flag |
|--------|-------------|-------------|
| `vitest` | Vitest | `--reporter=json --outputFile=report.json` |
| `jest` | Jest | `--json --outputFile=report.json` |
| `junit` | Any JUnit-compatible | Varies by runner |

### Execution Policy

Requirements can declare that they require evidence:

```json
{
  "verification": {
    "executionPolicy": {
      "requiresEvidence": true,
      "requiredKinds": ["unit", "integration"]
    }
  }
}
```

When `requiresEvidence` is `true`:
- `anchored-spec evidence validate` checks that evidence records exist for the requirement
- `anchored-spec verify` includes evidence validation (when `evidence.json` exists)
- Missing or failing evidence produces errors

### Evidence File

The evidence artifact is written to `specs/generated/evidence.json`:

```json
{
  "generatedAt": "2025-01-15T10:00:00Z",
  "records": [
    {
      "requirementId": "REQ-1",
      "testName": "user authentication",
      "kind": "unit",
      "status": "passed",
      "duration": 150,
      "source": "vitest-report.json"
    }
  ]
}
```

### Custom Evidence Parsers

Implement the `EvidenceParser` interface for unsupported formats:

```typescript
import type { EvidenceParser, EvidenceRecord, Requirement } from "anchored-spec";

const myParser: EvidenceParser = {
  name: "my-runner",
  parse(filePath: string, requirements: Requirement[]): EvidenceRecord[] {
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    // Map test results to requirement IDs
    return raw.tests.map(t => ({
      requirementId: extractReqId(t),
      testName: t.name,
      kind: "unit",
      status: t.passed ? "passed" : "failed",
      duration: t.time,
      source: filePath,
    }));
  },
};
```

## Impact Analysis

Impact analysis tells you which requirements are affected by file changes — useful for targeted testing, code review, and change assessment.

### CLI Usage

```bash
# Which requirements does this file affect?
npx anchored-spec impact src/auth/login.ts

# Multiple files
npx anchored-spec impact src/auth/login.ts src/auth/session.ts

# Machine-readable output
npx anchored-spec impact --json src/auth/login.ts

# Generate full impact map
npx anchored-spec impact --generate
```

### Matching Strategy

Impact analysis uses three strategies to find affected requirements:

1. **Change scope patterns** — If a file matches a change's `scope.include` glob, all linked requirements are affected
2. **Semantic ref content matching** — If a file contains a requirement's semantic ref (interface, route, symbol, error code), it's affected
3. **Test ref path matching** — If a file is listed in a requirement's `testFiles` or `testRefs`, it's affected

### Programmatic Usage

```typescript
import { analyzeImpact, generateImpactMap } from "anchored-spec";

// Analyze specific files
const results = analyzeImpact(
  ["src/auth/login.ts"],
  requirements,
  changes,
);

for (const result of results) {
  console.log(result.filePath, result.matchedRequirements);
}

// Generate a full impact map
const map = generateImpactMap(requirements, changes, {
  projectRoot: "/path/to/project",
  sourceRoots: ["src"],
});
```

## Traceability Reports

Generate comprehensive traceability matrices linking requirements, changes, and decisions:

```bash
# Generate markdown report
npx anchored-spec report

# Machine-readable output
npx anchored-spec report --json

# Custom output path
npx anchored-spec report --out docs/traceability.md
```

### Report Contents

The report includes:

- **Overview** — Counts of requirements, changes, and decisions
- **Status breakdown** — How many requirements are draft, active, shipped, etc.
- **Priority breakdown** — Distribution by must, should, could, wont
- **Test coverage** — How many requirements have test coverage
- **Traceability matrix** — REQ ↔ CHG ↔ ADR mapping with coverage status
- **Change verification** — Per-change command status (passed, failed, pending)
- **Orphan detection** — Changes and decisions not linked to any requirement
