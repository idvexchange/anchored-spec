# Getting Started

## Installation

```bash
# As a dev dependency (recommended)
npm install --save-dev anchored-spec
# or
pnpm add -D anchored-spec

# Or run directly with npx
npx anchored-spec init
```

Anchored Spec ships as both ESM and CJS — it works with any module system.

## Initialize Your Project

```bash
npx anchored-spec init
```

This creates the spec infrastructure in your project:

```
your-repo/
├── .anchored-spec/
│   └── config.json          # Framework configuration
├── specs/
│   ├── schemas/             # JSON Schema files (reference)
│   ├── requirements/        # REQ-*.json files (behavioral specs)
│   │   └── REQ-1.json       # Starter example (edit or replace)
│   ├── changes/             # CHG-*/change.json (work tracking)
│   ├── decisions/           # ADR-*.json (architecture decisions)
│   ├── generated/           # Generated markdown (gitignored)
│   └── workflow-policy.json # Governance rules
├── .gitignore               # Updated with specs/generated/
└── package.json             # Gets spec:* scripts added
```

### Init Options

| Flag | Effect |
|------|--------|
| `--bare` | Skip adding the TypeScript AST drift resolver — regex-only scanning |
| `--dry-run` | Preview what would be created without writing anything |
| `--no-examples` | Skip creating the starter REQ-1.json example file |
| `--spec-root <path>` | Use a custom directory instead of `specs/` |

## Your First Requirement

```bash
npx anchored-spec create requirement --title "User can log in"
```

This creates a JSON file like `specs/requirements/REQ-1.json` with EARS-formatted behavior statements:

```json
{
  "id": "REQ-1",
  "title": "User can log in",
  "behaviorStatements": [
    {
      "id": "BS-1",
      "text": "When a user submits valid credentials, the system shall return an auth token.",
      "format": "EARS",
      "trigger": "user submits valid credentials",
      "response": "the system shall return an auth token"
    }
  ]
}
```

## Create a Change Record

```bash
npx anchored-spec create change --title "Add login" --type feature --slug add-login
```

Change records link implementation work to requirements and carry file scope, phase tracking, and a verification sidecar.

## Verify Everything

```bash
npx anchored-spec verify
```

This runs 15+ quality and integrity checks across all your specs — schema validation, cross-reference integrity, EARS compliance, vague language detection, and more.

## Generate Documentation

```bash
npx anchored-spec generate
```

Produces human-readable markdown from your JSON specs into `specs/generated/`.

## Check Project Health

```bash
npx anchored-spec status
```

Shows a dashboard of requirement counts, change status, and overall project health.

## End-to-End Walkthrough: Feature (Behavior First)

This walkthrough builds a complete feature — **user registration with email verification** — from behavioral requirement through shipped code. It demonstrates the full ceremony of the "Feature (Behavior First)" workflow variant.

### Step 1: Write the Requirement (Behavior First)

Start by describing _what_ the system does, not _how_. Create a requirement:

```bash
npx anchored-spec create requirement --title "User registration with email verification"
```

This creates `specs/requirements/REQ-2.json` with TODO placeholders. Open it and fill in the behavioral specification:

```json
{
  "$schema": "../schemas/requirement.schema.json",
  "id": "REQ-2",
  "title": "User registration with email verification",
  "summary": "New users register with an email and password. The system sends a verification email. Unverified accounts cannot access protected resources.",
  "priority": "must",
  "status": "draft",
  "category": "functional",
  "behaviorStatements": [
    {
      "id": "BS-1",
      "text": "When a new user submits a valid email and password, the system shall create a pending account and send a verification email.",
      "format": "EARS",
      "trigger": "a new user submits a valid email and password",
      "response": "the system shall create a pending account and send a verification email"
    },
    {
      "id": "BS-2",
      "text": "When a user clicks the verification link within 24 hours, the system shall activate the account.",
      "format": "EARS",
      "trigger": "a user clicks the verification link within 24 hours",
      "response": "the system shall activate the account"
    },
    {
      "id": "BS-3",
      "text": "While an account is unverified, the system shall reject access to protected resources with a 403 status.",
      "format": "EARS",
      "precondition": "an account is unverified",
      "response": "the system shall reject access to protected resources with a 403 status"
    }
  ],
  "traceRefs": [],
  "semanticRefs": {
    "interfaces": [],
    "routes": [],
    "errorCodes": [],
    "symbols": []
  },
  "verification": {
    "requiredTestKinds": ["unit", "integration"],
    "coverageStatus": "none",
    "testRefs": [],
    "testFiles": []
  },
  "implementation": {
    "activeChanges": [],
    "shippedBy": null
  },
  "owners": ["backend-team"],
  "tags": ["auth", "onboarding"],
  "docSource": "canonical-json",
  "schemaVersion": "0.2.0"
}
```

> **Key principle:** Notice the behavior statements describe _observable outcomes_ ("shall create a pending account", "shall reject access with a 403"), not implementation details. No mention of database tables, JWT tokens, or middleware.

Run a quick verify to check your EARS formatting:

```bash
npx anchored-spec verify
```

### Step 2: Record an Architecture Decision

Before implementation, document the key technical choice:

```bash
npx anchored-spec create decision \
  --title "Use time-limited signed tokens for email verification" \
  --domain auth
```

Edit `specs/decisions/ADR-2.json`:

```json
{
  "id": "ADR-2",
  "title": "Use time-limited signed tokens for email verification",
  "slug": "email-verification-tokens",
  "status": "accepted",
  "domain": "auth",
  "decision": "We will use HMAC-signed tokens with a 24-hour TTL embedded in verification URLs.",
  "context": "Email verification requires a mechanism to prove the user owns the email address. The token must be tamper-proof and time-limited.",
  "rationale": "Signed tokens are stateless (no database lookup required to validate), and embedding the TTL in the token avoids a separate expiry cleanup job.",
  "alternatives": [
    { "name": "Random token stored in database", "verdict": "rejected", "reason": "Requires DB lookup on every verification and a cleanup job for expired tokens" },
    { "name": "One-time-use codes (6-digit)", "verdict": "rejected", "reason": "Worse UX — requires manual entry instead of click-to-verify" }
  ],
  "relatedRequirements": ["REQ-2"]
}
```

### Step 3: Create a Change Record

Now create the change record that links work to the requirement:

```bash
npx anchored-spec create change \
  --title "Implement user registration" \
  --type feature \
  --scope "src/auth/**" "src/routes/auth/**"
```

This creates `specs/changes/CHG-2026-0001-implement-user-registration/change.json`. Edit it to link to your requirement:

```json
{
  "id": "CHG-2026-0001-implement-user-registration",
  "title": "Implement user registration",
  "slug": "implement-user-registration",
  "type": "feature",
  "workflowVariant": "feature-behavior-first",
  "phase": "design",
  "status": "active",
  "scope": {
    "include": ["src/auth/**", "src/routes/auth/**"]
  },
  "requirements": ["REQ-2"],
  "branch": "feat/user-registration",
  "timestamps": { "createdAt": "2026-03-26" },
  "owners": ["backend-team"],
  "designDoc": null,
  "implementationPlan": null,
  "docSource": "canonical-json"
}
```

And update REQ-2 to reference the change back (bidirectional link):

```json
"implementation": {
  "activeChanges": ["CHG-2026-0001-implement-user-registration"],
  "shippedBy": null
}
```

### Step 4: Transition to Active — Add Semantic Anchors

When you're ready to start coding, transition the requirement from `draft` → `planned` → `active`. At this point, you bind the behavioral spec to the codebase by adding semantic refs:

```json
"status": "active",
"semanticRefs": {
  "interfaces": ["IRegistrationService", "IEmailVerifier"],
  "routes": ["POST /api/v1/auth/register", "GET /api/v1/auth/verify-email"],
  "errorCodes": ["EMAIL_ALREADY_EXISTS", "VERIFICATION_TOKEN_EXPIRED"],
  "symbols": ["registerUser", "verifyEmailToken"]
},
"traceRefs": [
  {
    "path": "docs/api/auth.md",
    "role": "api",
    "label": "REST contract for registration endpoints"
  },
  {
    "path": "specs/decisions/ADR-2.json",
    "role": "decision",
    "label": "Token strategy for email verification"
  }
]
```

> **Key principle:** The behavioral text doesn't change — you're adding _anchor points_ from functional intent to technical reality. The behavioral statements still describe _what_; the semantic refs describe _where it lives in code_.

Advance the change to the implementation phase:

```bash
npx anchored-spec transition CHG-2026-0001-implement-user-registration --to implementation
```

### Step 5: Implement the Code

Write your code. The key symbols you declared in `semanticRefs` should exist:

```typescript
// src/auth/registration-service.ts
export interface IRegistrationService {
  registerUser(email: string, password: string): Promise<{ userId: string }>;
}

// src/auth/email-verifier.ts
export interface IEmailVerifier {
  verifyEmailToken(token: string): Promise<{ verified: boolean }>;
}

// src/routes/auth/register.ts
router.post("/api/v1/auth/register", async (req, res) => { /* ... */ });

// src/routes/auth/verify-email.ts
router.get("/api/v1/auth/verify-email", async (req, res) => { /* ... */ });
```

### Step 6: Check for Drift

Verify your semantic refs still match the codebase:

```bash
npx anchored-spec drift
```

```
🔍 Semantic Drift Report

  REQ-2: interface "IRegistrationService" → found in src/auth/registration-service.ts
  REQ-2: interface "IEmailVerifier" → found in src/auth/email-verifier.ts
  REQ-2: route "POST /api/v1/auth/register" → found in src/routes/auth/register.ts
  REQ-2: route "GET /api/v1/auth/verify-email" → found in src/routes/auth/verify-email.ts
  REQ-2: errorCode "EMAIL_ALREADY_EXISTS" → found in src/auth/errors.ts
  REQ-2: errorCode "VERIFICATION_TOKEN_EXPIRED" → found in src/auth/errors.ts
  REQ-2: symbol "registerUser" → found in src/auth/registration-service.ts
  REQ-2: symbol "verifyEmailToken" → found in src/auth/email-verifier.ts

  8 refs | 8 found | 0 missing

✓ No drift detected.
```

If you rename an interface or delete a route, drift detection catches it immediately. Use `--watch` during development:

```bash
npx anchored-spec drift --watch
```

### Step 7: Write Tests and Link Them

Write your tests, referencing the requirement ID:

```typescript
// src/auth/__tests__/registration.test.ts
describe("REQ-2: User registration", () => {
  it("BS-1: creates pending account and sends verification email", async () => {
    // ...
  });

  it("BS-2: activates account on valid verification link", async () => {
    // ...
  });

  it("BS-3: rejects unverified accounts with 403", async () => {
    // ...
  });
});
```

Update REQ-2's verification section to link the tests:

```json
"verification": {
  "requiredTestKinds": ["unit", "integration"],
  "coverageStatus": "full",
  "testRefs": [
    {
      "path": "src/auth/__tests__/registration.test.ts",
      "kind": "unit",
      "notes": "Covers all three behavior statements"
    },
    {
      "path": "src/auth/__tests__/registration.integration.test.ts",
      "kind": "integration",
      "notes": "End-to-end register → verify → access flow"
    }
  ]
}
```

### Step 8: Verify Everything

Run the full verification suite:

```bash
npx anchored-spec verify
```

```
🔍 Anchored Spec — Verification

  Validating 2 requirement(s)...
  Validating 1 change(s)...
  Validating 2 decision(s)...
  Validating workflow policy...
  Checking cross-reference integrity...
  Checking lifecycle rules...
  Checking requirement dependencies...
  Checking file path references...
  Checking test linking...

  10 checks | 10 passed | 0 warnings | 0 errors
  5 artifacts (2 REQs, 1 CHGs, 2 ADRs)

✓ All checks passed.
```

For CI, use structured output:

```bash
npx anchored-spec verify --json
```

```json
{
  "passed": true,
  "summary": {
    "totalChecks": 10,
    "passed": 10,
    "warnings": 0,
    "errors": 0,
    "artifacts": { "requirements": 2, "changes": 1, "decisions": 2 }
  },
  "findings": []
}
```

### Step 9: Ship It

Transition the change to done:

```bash
npx anchored-spec transition CHG-2026-0001-implement-user-registration --to done
```

The gate checks that all linked requirements have test coverage before allowing the transition.

Update REQ-2's status to `shipped` and record which change shipped it:

```json
"status": "shipped",
"implementation": {
  "activeChanges": [],
  "shippedBy": "CHG-2026-0001-implement-user-registration"
}
```

### Step 10: Generate Documentation

```bash
npx anchored-spec generate
```

This produces human-readable markdown in `specs/generated/` — requirements index, decisions index, changes log, and a status dashboard. All generated from your JSON source of truth.

### What You've Built

At the end of this workflow, you have:

| Artifact | Purpose |
|----------|---------|
| `REQ-2.json` | Behavioral spec with EARS statements, semantic anchors, and test links |
| `ADR-2.json` | Documented design decision with rejected alternatives |
| `CHG-2026-0001-*/change.json` | Change record tracking scope, phase, and linked requirements |
| `CHG-2026-0001-*/verification.json` | Verification sidecar with required checks |
| `specs/generated/*.md` | Human-readable docs generated from JSON |

The behavioral requirement (`REQ-2`) is **anchored** to your codebase through semantic refs and test links. If someone renames `IRegistrationService`, deletes the `/register` route, or removes the test file — `anchored-spec drift` and `anchored-spec verify` will catch it.

---

## Enterprise Architecture

For teams managing architecture beyond individual requirements, Anchored Spec includes an EA extension with 44 artifact kinds across 7 domains (systems, delivery, data, information, business, transitions, legacy).

```bash
# Initialize EA
npx anchored-spec ea init

# Create an application artifact
npx anchored-spec ea create --kind application --id APP-my-service

# Validate and visualize
npx anchored-spec ea validate
npx anchored-spec ea graph
```

See the [EA Adoption Playbook](ea-adoption-playbook.md) for a step-by-step brownfield adoption guide.

## Next Steps

- Read [Core Concepts](concepts.md) to understand requirements, changes, and decisions
- See [Commands Reference](commands.md) for the full CLI
- Set up [CI Integration](ci-integration.md) to enforce specs in your pipeline
- Learn about [Drift Detection](drift-detection.md) and pluggable resolvers
- Explore the [Programmatic API](programmatic-api.md) for custom tooling
