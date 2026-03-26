# Core Concepts

Anchored Spec is built around four first-class artifact types and a workflow policy that ties them together.

## Requirements (REQ)

Requirements describe **what** the system does — never **how**. They use [EARS notation](https://ieeexplore.ieee.org/document/5328509) (Easy Approach to Requirements Syntax) for structured behavioral statements:

```json
{
  "id": "REQ-1",
  "title": "User Authentication",
  "summary": "Users can authenticate with email and password.",
  "priority": "must",
  "status": "active",
  "behaviorStatements": [
    {
      "id": "BS-1",
      "text": "When a user submits valid credentials, the system shall return an auth token.",
      "format": "EARS",
      "trigger": "user submits valid credentials",
      "response": "the system shall return an auth token"
    }
  ],
  "semanticRefs": {
    "interfaces": ["IAuthService"],
    "routes": ["POST /api/v1/auth/login"],
    "errorCodes": ["AUTH_INVALID_CREDENTIALS"],
    "symbols": ["AuthService.login"]
  },
  "owners": ["auth-team"]
}
```

### Key Principles

- **Requirements stay functional forever.** Acceptance criteria describe observable behavior, not implementation details.
- **Technical detail goes in `semanticRefs`** — these are code anchors that bind functional intent to specific interfaces, routes, error codes, and symbols in your codebase.
- **Statuses track lifecycle:** `draft` → `active` → `shipped` → (optionally `deprecated`).

### Semantic Refs

Semantic refs are the bridge between specs and code. They enable [drift detection](drift-detection.md) — the framework scans your source files to verify these references still exist:

| Kind | Example | What it anchors |
|------|---------|-----------------|
| `interfaces` | `"IAuthService"` | TypeScript interface, class, or type |
| `routes` | `"POST /api/v1/auth/login"` | HTTP endpoint handler |
| `errorCodes` | `"AUTH_INVALID_CREDENTIALS"` | Error code enum member or constant |
| `symbols` | `"AuthService.login"` | Exported function, const, or class method |

### Verification & Evidence

Requirements can declare execution policy for evidence-based verification:

```json
{
  "verification": {
    "requiredTestKinds": ["unit", "integration"],
    "coverageStatus": "partial",
    "executionPolicy": {
      "requiresEvidence": true,
      "requiredKinds": ["unit"]
    },
    "testFiles": ["src/__tests__/auth.test.ts"],
    "testRefs": [
      { "path": "src/__tests__/auth.test.ts", "kind": "unit" }
    ]
  }
}
```

See [Evidence & Impact](evidence-pipeline.md) for details on the evidence pipeline.

## Change Records (CHG)

Changes are born technical — they carry file scope, affected symbols, and policy enforcement. Each change links to the requirements it implements:

```json
{
  "id": "CHG-2025-0001-add-auth",
  "title": "Add user authentication",
  "type": "feature",
  "workflowVariant": "feature-behavior-first",
  "phase": "implementation",
  "status": "active",
  "scope": {
    "include": ["src/auth/**"],
    "exclude": ["src/auth/__tests__/**"]
  },
  "requirements": ["REQ-1"],
  "branch": "feat/add-auth",
  "timestamps": { "createdAt": "2025-01-15" },
  "owners": ["alice"]
}
```

### Phases

Changes progress through phases that vary by workflow variant:

| Phase | Purpose |
|-------|---------|
| `design` | Requirements and design doc |
| `planned` | Approved for implementation |
| `implementation` | Active coding |
| `review` | PR review and testing |
| `done` | Merged and shipped |

Use `anchored-spec transition <id>` to advance a change. Gates enforce quality at each transition (e.g., "done" requires test coverage).

### Verification Sidecar

Each change gets a `verification.json` sidecar that tracks verification commands:

```json
{
  "changeId": "CHG-2025-0001-add-auth",
  "commands": [
    { "name": "Build", "command": "pnpm build", "required": true, "status": "passed" },
    { "name": "Tests", "command": "pnpm test", "required": true, "status": "pending" }
  ]
}
```

## Decisions (ADR)

Architecture Decision Records capture choices among alternatives. They document **why** a particular approach was chosen:

```json
{
  "id": "ADR-1",
  "title": "Use PostgreSQL for persistence",
  "slug": "use-postgresql",
  "status": "accepted",
  "decision": "We will use PostgreSQL as the primary database.",
  "context": "The application needs ACID transactions and complex queries.",
  "rationale": "PostgreSQL offers the best balance of features and ecosystem support.",
  "alternatives": [
    { "name": "MySQL", "verdict": "rejected", "reason": "Fewer advanced features" },
    { "name": "MongoDB", "verdict": "rejected", "reason": "No ACID transactions" }
  ],
  "relatedRequirements": ["REQ-1"]
}
```

### Decision Statuses

| Status | Meaning |
|--------|---------|
| `proposed` | Under discussion |
| `accepted` | Approved and active |
| `deprecated` | Superseded by a newer decision |
| `rejected` | Considered but not adopted |

## Workflow Policy

The workflow policy (`specs/workflow-policy.json`) defines governance rules for your project:

```json
{
  "workflowVariants": [
    {
      "id": "feature-behavior-first",
      "name": "Feature (Behavior First)",
      "defaultTypes": ["feature"],
      "artifacts": ["requirements", "design-doc"]
    },
    {
      "id": "fix-root-cause",
      "name": "Bug Fix",
      "defaultTypes": ["fix"],
      "artifacts": ["requirements"]
    },
    {
      "id": "chore",
      "name": "Chore",
      "defaultTypes": ["chore"],
      "artifacts": []
    }
  ],
  "changeRequiredRules": [
    { "id": "governed-source", "pattern": "src/**/*.ts", "message": "Source files need a change record" }
  ],
  "trivialExemptions": ["README.md", ".github/**", "*.config.*"],
  "lifecycleRules": {
    "shipped": { "requiresCoverage": true }
  }
}
```

### Three Workflow Sizes

| Variant | Ceremony | When to use |
|---------|----------|-------------|
| **Feature** | Full — requirements, design doc, all phases | New capabilities, major changes |
| **Fix** | Medium — root-cause analysis, focused phases | Bug fixes, regressions |
| **Chore** | Light — minimal artifacts | Config, docs, CI, dependencies |

### Path-Based Enforcement

`changeRequiredRules` use glob patterns to automatically detect which file changes need formal governance. `trivialExemptions` define paths that never need a change record (README, CI config, etc.).

Use `anchored-spec check --staged` to enforce these rules in a pre-commit hook.
