# Anchored Spec — AI Agent Skill

> **Purpose:** Enforce spec-driven development (SDD) workflows when working in any codebase managed by [anchored-spec](https://github.com/AnchoredSpec/anchored-spec).
>
> **Activation:** This skill activates when the project contains `.anchored-spec/config.json` or a `specs/` directory with `requirements/`, `changes/`, or `decisions/` subdirectories.
>
> **Agent compatibility:** Works with any AI coding agent (GitHub Copilot, Cursor, Cline, Windsurf, Aider, Continue, etc.). Drop this file into your project root or reference it from your agent's configuration.

---

## 1. Detection — Is This an Anchored-Spec Project?

Before applying these rules, check for the presence of:

```
.anchored-spec/config.json   ← primary indicator
specs/requirements/           ← secondary indicator
specs/workflow-policy.json    ← secondary indicator
```

If none exist, this skill does not apply. Do not suggest initializing anchored-spec unless the user explicitly asks.

---

## 2. Core Principles

### Requirements Are Behavioral — Always

Requirements describe **what** the system does, never **how**. They use [EARS notation](https://en.wikipedia.org/wiki/Easy_Approach_to_Requirements_Syntax) (Easy Approach to Requirements Syntax):

| EARS Pattern | Template | Use When |
|---|---|---|
| **Event-driven** | _When \<trigger\>, the system shall \<response\>._ | Behavior triggered by a discrete event |
| **State-driven** | _While \<state\>, the system shall \<response\>._ | Behavior during an ongoing condition |
| **Unwanted** | _If \<condition\>, then the system shall \<response\>._ | Error handling, edge cases |
| **Optional** | _Where \<feature\>, the system shall \<response\>._ | Configurable or optional behavior |
| **Complex** | _While \<state\>, when \<trigger\>, the system shall \<response\>._ | Combination of state + event |

### The Functional/Technical Boundary

| Ask yourself | Stay functional (requirement) | Add technical detail |
|---|---|---|
| "Can I verify this by observing behavior?" | ✅ Keep it in the requirement | |
| "Does this name a specific interface, file, or route?" | | ✅ Put it in `semanticRefs` |
| "Is this an architectural choice among alternatives?" | | ✅ Put it in a decision (ADR) |
| "Could the implementation change without this statement becoming false?" | ✅ Good acceptance criterion | |

**Anti-pattern:** Writing behavior statements like "Uses `IDomainEventBus` for side effects" — that's a technical constraint masquerading as behavior. The functional version: "Side effects (webhooks, billing) fire exactly once per finalization." The technical binding (`IDomainEventBus`) goes in `semanticRefs.interfaces`.

### JSON Is the Source of Truth

All spec artifacts are JSON files validated against schemas. Markdown is always generated — never hand-edited. When making changes, always edit the JSON, then run `anchored-spec generate`.

---

## 3. Workflow Variants

Every code change must be classified into a workflow variant. Match the user's request against this table:

| User Request Pattern | Workflow Variant | Change Type | Ceremony Level |
|---|---|---|---|
| "Add feature", "new capability", "build X" | `feature-behavior-first` | `feature` | Full: requirement → decision → change → implement → verify |
| "Refactor", "redesign", "restructure" | `feature-design-first` | `refactor` | Full: design doc → requirement → change → implement → verify |
| "Fix bug", "broken", "not working" | `fix-root-cause-first` | `fix` | Medium: bugfix spec → root cause → change → implement → verify |
| "Update docs", "rename", "cleanup" | `chore` | `chore` | Light: change → implement → verify |

### When in Doubt

- If the change **affects observable behavior** → it's a `feature`, not a `chore`
- If the change **modifies an API contract** → it's a `feature` or `refactor`, not a `chore`
- If the change **adds/removes/modifies routes, error codes, or interfaces** → it's not a `chore`

---

## 4. Workflow Enforcement — Feature (Behavior First)

This is the default workflow for new features. Follow these steps **in order**:

### Step 1: Write the Requirement

```bash
anchored-spec create requirement --title "<descriptive title>"
```

Edit the created `REQ-*.json` to include:

- **`summary`** — One paragraph describing the feature in behavioral terms
- **`behaviorStatements`** — At least one EARS statement per observable behavior. Each must have:
  - `text`: Full EARS sentence
  - `trigger` or `precondition`: The When/While clause
  - `response`: The "shall" clause — what the system does
- **`priority`** — `must` / `should` / `could` / `wont` (MoSCoW)
- **`owners`** — Who is responsible

**Do NOT fill in** `semanticRefs`, `verification.testRefs`, or `implementation` at this stage. Those come later.

### Step 2: Record Decisions (if applicable)

If the feature involves a choice among alternatives:

```bash
anchored-spec create decision --title "<decision title>" --domain "<domain>"
```

Fill in `context` (why needed), `rationale` (why this choice), and `alternatives` (what was rejected and why). Link to the requirement via `relatedRequirements`.

### Step 3: Create a Change Record

```bash
anchored-spec create change --title "<change title>" --type feature --scope "<glob patterns>"
```

Edit the change to:
- Set `requirements: ["REQ-N"]` linking to the requirement
- Set `branch` to the git branch name
- Optionally set `designDoc` and `implementationPlan` paths

Then update the requirement's `implementation.activeChanges` to include the change ID (bidirectional link).

### Step 4: Activate the Requirement — Add Semantic Anchors

When transitioning from `draft` → `active`, add semantic refs that bind behavioral intent to code:

```json
"semanticRefs": {
  "interfaces": ["IMyService"],
  "routes": ["POST /api/v1/resource"],
  "errorCodes": ["RESOURCE_NOT_FOUND"],
  "symbols": ["createResource", "ResourceValidator"]
}
```

Also add `traceRefs` linking to relevant documentation:

```json
"traceRefs": [
  { "path": "docs/api.md", "role": "api", "label": "REST contract" },
  { "path": "specs/decisions/ADR-N.json", "role": "decision" }
]
```

### Step 5: Advance the Change Phase

```bash
anchored-spec transition <CHG-ID> --to implementation
```

### Step 6: Implement — Then Check Drift

After writing code, verify semantic refs still match:

```bash
anchored-spec drift
```

Every `interface`, `route`, `errorCode`, `symbol`, and `schema` in `semanticRefs` must resolve to at least one source file. Fix any "missing" findings before proceeding.

### Step 7: Write Tests — Link Them to Requirements

Reference requirement IDs in test descriptions:

```typescript
describe("REQ-N: Feature title", () => {
  it("BS-1: behavior description", () => { /* ... */ });
});
```

Update the requirement's `verification` section:

```json
"verification": {
  "coverageStatus": "full",
  "testRefs": [
    { "path": "src/__tests__/feature.test.ts", "kind": "unit" },
    { "path": "src/__tests__/feature.integration.test.ts", "kind": "integration" }
  ]
}
```

### Step 8: Verify Everything

```bash
anchored-spec verify
```

All checks must pass before shipping. In strict mode:

```bash
anchored-spec verify --strict
```

### Step 9: Ship

```bash
anchored-spec transition <CHG-ID> --to done
```

Update the requirement: `status: "shipped"`, `implementation.shippedBy: "<CHG-ID>"`, clear `activeChanges`.

---

## 5. Workflow Enforcement — Fix (Root Cause First)

For bug fixes, **understand before you fix**:

### Step 1: Create the Change with a Bugfix Spec

```bash
anchored-spec create change --title "Fix: <description>" --type fix
```

The change will include a `bugfixSpec` block. Fill in:

```json
"bugfixSpec": {
  "currentBehavior": "What actually happens (the bug)",
  "expectedBehavior": "What should happen (correct behavior)",
  "rootCauseHypothesis": "Why it's broken (your theory)",
  "regressionRisk": "What else might break when you fix this"
}
```

### Step 2: Write a Failing Test First

Before touching production code, write a test that reproduces the bug. Reference the requirement it violates.

### Step 3: Fix, Verify, Ship

Same as feature steps 6–9: check drift, run verify, transition to done.

---

## 6. Workflow Enforcement — Chore (Lightweight)

For changes with no behavioral impact:

```bash
anchored-spec create change --title "Chore: <description>" --type chore
```

Chores skip the full ceremony — no requirement needed, no design doc. But they still must:
- Pass `anchored-spec verify`
- Not introduce behavioral changes (if they do, escalate to a feature)

---

## 7. Lifecycle Rules

### Requirement Status Transitions

```
draft → planned → active → shipped
                         ↘ deferred
                         ↘ deprecated
```

| Transition | Gate |
|---|---|
| `planned → active` | Must have an active change record linked |
| `active → shipped` | Must have `coverageStatus` ≠ `none` |
| `* → deprecated` | Must have `statusReason` or `supersededBy` |

### Change Phase Transitions

```
design → planned → implementation → verification → done → archived
```

| Transition | Gate |
|---|---|
| `design → planned` | Requirements must be linked (non-chore) |
| `* → done` | Linked requirements must have test coverage |
| `* → done` | Verification sidecar commands should have passed |

---

## 8. Quality Rules

These rules are enforced by `anchored-spec verify`. When you see violations, fix them before proceeding:

| Rule ID | Severity | What It Checks |
|---|---|---|
| `schema:*` | error | JSON matches its schema |
| `lifecycle:active-requires-change` | error | Active requirements need a change record |
| `lifecycle:shipped-requires-coverage` | error | Shipped requirements need test coverage |
| `lifecycle:deprecated-requires-reason` | error | Deprecated requirements need a reason |
| `cross-ref:bidirectional-consistency` | warning | CHG↔REQ links must be bidirectional |
| `quality:no-vague-language` | warning | No "should work", "properly", "seamless" in behavior statements |
| `quality:semantic-refs-populated` | warning | Active/shipped requirements need semantic refs |
| `quality:missing-test-refs` | warning | Active/shipped requirements should have test references |
| `quality:test-linking` | warning | Tests mentioning REQ-* should be in testRefs |
| `dependency:missing-ref` | error | `dependsOn` targets must exist |
| `dependency:cycle` | error | No circular dependencies |

### Rule Severity Overrides

Projects can override rule severity in `.anchored-spec/config.json`:

```json
{
  "quality": {
    "rules": {
      "quality:no-vague-language": "off",
      "quality:semantic-refs-populated": "error"
    }
  }
}
```

Respect these overrides — if a rule is set to `"off"`, don't flag it.

---

## 9. Command Reference (Quick)

| Task | Command |
|---|---|
| Initialize project | `anchored-spec init` |
| Create requirement | `anchored-spec create requirement --title "..."` |
| Create change | `anchored-spec create change --title "..." --type feature` |
| Create decision | `anchored-spec create decision --title "..." --domain "..."` |
| Advance change phase | `anchored-spec transition <CHG-ID> --to <phase>` |
| Check for drift | `anchored-spec drift` |
| Verify everything | `anchored-spec verify` |
| Verify (CI/JSON) | `anchored-spec verify --json` |
| Generate markdown | `anchored-spec generate` |
| Project dashboard | `anchored-spec status` |
| Check policy | `anchored-spec check --paths <file...>` |
| Continuous watch | `anchored-spec verify --watch` |

---

## 10. Before Claiming Completion

Before telling the user a task is complete, **always** run:

```bash
anchored-spec verify
```

If it fails, fix the issues. Additionally:

- After any code change touching declared `semanticRefs` → run `anchored-spec drift`
- After any requirement status change → run `anchored-spec verify`
- After creating/editing JSON specs → run `anchored-spec verify` to catch schema errors
- After all changes → run `anchored-spec generate` if generated files exist

### Structured Verification (CI-friendly)

```bash
anchored-spec verify --json
```

Parse the output — `passed: true` means all checks passed. `findings` array contains any issues with `rule`, `message`, and `suggestion` fields.

---

## 11. Common Mistakes to Prevent

### ❌ Technical language in behavior statements

```
BAD:  "The system shall use PostgreSQL for persistence"
GOOD: "The system shall persist user data across sessions"
```

### ❌ Missing bidirectional links

If CHG-X references REQ-Y, then REQ-Y's `implementation.activeChanges` must include CHG-X. Always update both sides.

### ❌ Shipping without coverage

Never set `status: "shipped"` without setting `verification.coverageStatus` to `"partial"` or `"full"` and populating `testRefs`.

### ❌ Editing generated markdown

Files in `specs/generated/` are auto-generated. Edit the JSON source, then run `anchored-spec generate`.

### ❌ Skipping the change record

Every non-trivial code change needs a change record. Use `anchored-spec check --paths <files>` to see if your changed files are governed by the workflow policy.

### ❌ Empty semantic refs on active requirements

Active and shipped requirements must have at least one semantic ref (interface, route, or symbol) to anchor the spec to code. Without anchors, drift detection can't protect against silent breakage.

---

## 12. Integration Guide

### GitHub Copilot

Add to `.github/copilot-instructions.md`:

```markdown
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Cursor

Add to `.cursorrules`:

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Cline / Roo Code

Reference in `.clinerules`:

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Windsurf

Reference in `.windsurfrules`:

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Claude Code (CLAUDE.md)

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Generic / Other Agents

Any agent that reads project-root markdown files will pick up `SKILL.md` automatically. For agents that support custom instructions, point them to this file.
