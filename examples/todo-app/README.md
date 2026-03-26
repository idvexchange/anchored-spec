# To-Do App — Anchored Spec Example

This is a complete example showing how [anchored-spec](https://github.com/AnchoredSpec/anchored-spec) manages a real feature from requirements to shipped code. It demonstrates the **Feature (Behavior First)** workflow using a simple to-do list application.

## What This Example Shows

| Concept | Where to look |
|---------|---------------|
| **EARS requirements** with behavioral statements | `specs/requirements/REQ-1.json` through `REQ-5.json` |
| **Semantic refs** binding behavior to code | `semanticRefs` in each requirement → `src/` symbols |
| **Architecture decisions** with alternatives | `specs/decisions/ADR-1.json` |
| **Change records** with scope and verification | `specs/changes/CHG-2025-0001-initial-todo/` |
| **Bidirectional test linking** | Tests reference `REQ-*` IDs; requirements reference test files |
| **Workflow policy** with lifecycle rules | `specs/workflow-policy.json` |
| **Verification sidecar** tracking CI commands | `specs/changes/CHG-2025-0001-initial-todo/verification.json` |

## The Feature

A to-do list with five requirements:

1. **REQ-1: Add New Tasks** — Create tasks from text input, reject empty titles
2. **REQ-2: Display Task List** — Render tasks with completion indicators, show empty state
3. **REQ-3: Toggle Task Completion** — Mark done/undone with immediate visual update
4. **REQ-4: Delete Tasks** — Remove tasks, show empty state when last is deleted
5. **REQ-5: Filter Tasks by Status** — All / Active / Completed views

One architecture decision:

- **ADR-1:** Use React `useState` over Redux/Context/server-side persistence (simplest for MVP)

## Project Structure

```
todo-app/
├── .anchored-spec/
│   └── config.json                    # Framework configuration
├── specs/
│   ├── workflow-policy.json           # Governance rules + lifecycle gates
│   ├── requirements/
│   │   ├── REQ-1.json                 # Add tasks
│   │   ├── REQ-2.json                 # Display list
│   │   ├── REQ-3.json                 # Toggle completion
│   │   ├── REQ-4.json                 # Delete tasks
│   │   └── REQ-5.json                 # Filter by status
│   ├── decisions/
│   │   └── ADR-1.json                 # State management choice
│   └── changes/
│       └── CHG-2025-0001-initial-todo/
│           ├── change.json            # Feature change record
│           └── verification.json      # CI verification sidecar
├── src/
│   ├── types.ts                       # TaskItem, FilterMode
│   ├── tasks.ts                       # addTask, toggleTask, deleteTask, filterTasks
│   ├── components/
│   │   └── interfaces.ts             # TodoInput, TodoList, TodoFilter
│   └── __tests__/
│       └── todo.test.ts               # Unit tests linked to REQ-1 through REQ-5
└── docs/
    └── features.md                    # Feature spec (referenced by traceRefs)
```

## Try It Yourself

### 1. Verify the specs

```bash
cd examples/todo-app
npx anchored-spec verify
```

Expected output: all checks pass — schema validation, cross-references, lifecycle rules, and test linking.

### 2. Check for semantic drift

```bash
npx anchored-spec drift
```

Every `interface`, `symbol`, and `route` in the requirements' `semanticRefs` resolves to source files.

### 3. Generate documentation

```bash
npx anchored-spec generate
```

Creates human-readable markdown in `specs/generated/` from the JSON specs.

### 4. View project health

```bash
npx anchored-spec status
```

Shows a dashboard of requirements by status, changes by phase, and coverage metrics.

### 5. Explore structured output

```bash
npx anchored-spec verify --json
npx anchored-spec drift --json
```

Machine-readable JSON for CI pipelines.

## Key Patterns to Notice

### EARS Behavioral Statements

Every requirement uses structured EARS notation. Compare:

- ❌ "The app should have a delete button" (vague, UI-specific)
- ✅ "When a user deletes a task, the system shall remove it from the list immediately." (behavioral, verifiable)

### Semantic Refs as Code Anchors

Requirements don't specify *how* — they specify *what* and anchor to *where*:

```json
"semanticRefs": {
  "interfaces": ["TodoInput"],
  "symbols": ["addTask", "TaskItem"]
}
```

If `addTask` is renamed to `createTask`, drift detection catches it immediately.

### Bidirectional Test Linking

Tests reference requirement IDs in their descriptions:

```typescript
describe("REQ-1: Add New Tasks", () => {
  it("BS-1: adds a task with the given title...", () => { /* ... */ });
});
```

Requirements link back to test files:

```json
"verification": {
  "testRefs": [{ "path": "src/__tests__/todo.test.ts", "kind": "unit" }]
}
```

The `verify` command checks both directions — unlinked tests get flagged.

### Change Record as Work Tracker

The change record captures scope, requirements, branch, and phase:

```json
{
  "type": "feature",
  "phase": "done",
  "requirements": ["REQ-1", "REQ-2", "REQ-3", "REQ-4", "REQ-5"],
  "scope": { "include": ["src/**"] }
}
```

Lifecycle gates enforce that shipping requires test coverage.

## Extending This Example

Try these exercises to learn the framework:

1. **Add REQ-6: Persist tasks** — Create a new requirement for localStorage persistence, an ADR choosing localStorage over IndexedDB, and a change record. Transition through all phases.

2. **Introduce a bug** — Rename `deleteTask` to `removeTask` in `tasks.ts` without updating REQ-4's `semanticRefs`. Run `anchored-spec drift` to see it caught.

3. **Add a custom plugin** — Write a plugin that checks all requirements have at least 2 behavior statements. Register it in `config.json`.

4. **Try the fix workflow** — Create a `fix` change to address a hypothetical bug, including a `bugfixSpec` block.
