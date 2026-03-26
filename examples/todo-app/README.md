# To-Do App — Anchored Spec Example

A self-contained Next.js to-do list managed by [anchored-spec](https://github.com/AnchoredSpec/anchored-spec). This example demonstrates the full **Feature (Behavior First)** workflow — from EARS requirements through shipped code with bidirectional test linking.

## Quick Start

```bash
cd examples/todo-app
npm install
npm run dev          # Start Next.js → http://localhost:3000
npm test             # Run unit tests (Vitest)
npm run spec:verify  # Validate all specs
npm run spec:drift   # Check semantic refs against source
```

## What This Example Shows

| Concept | Where to look |
|---------|---------------|
| **EARS requirements** with behavioral statements | `specs/requirements/REQ-1.json` through `REQ-5.json` |
| **Semantic refs** binding behavior to code | `semanticRefs` in each requirement → `lib/` and `components/` symbols |
| **Architecture decisions** with alternatives | `specs/decisions/ADR-1.json` |
| **Change records** with scope and verification | `specs/changes/CHG-2025-0001-initial-todo/` |
| **Bidirectional test linking** | Tests reference `REQ-*` IDs; requirements reference test files |
| **Workflow policy** with lifecycle rules | `specs/workflow-policy.json` |
| **Verification sidecar** tracking CI commands | `specs/changes/.../verification.json` |

## The Feature

A to-do list with five requirements:

1. **REQ-1: Add New Tasks** — Create tasks from text input, reject empty titles
2. **REQ-2: Display Task List** — Render tasks with completion indicators, show empty state
3. **REQ-3: Toggle Task Completion** — Mark done/undone with immediate visual update
4. **REQ-4: Delete Tasks** — Remove tasks, show empty state when last is deleted
5. **REQ-5: Filter Tasks by Status** — All / Active / Completed views

One architecture decision:

- **ADR-1:** Use React `useState` over Redux/Context/server persistence (simplest for MVP)

## Project Structure

```
todo-app/                         ← Standard Next.js app (create-next-app defaults)
├── app/
│   ├── layout.tsx                # Root layout (Geist fonts, Tailwind)
│   ├── page.tsx                  # Main page — wires state to components
│   └── globals.css               # Tailwind imports
├── components/
│   ├── TodoInput.tsx             # Text input + Add button
│   ├── TodoList.tsx              # Task list with toggle/delete + empty state
│   └── TodoFilter.tsx            # All / Active / Completed filter tabs
├── lib/
│   ├── types.ts                  # TaskItem, FilterMode
│   └── tasks.ts                  # addTask, toggleTask, deleteTask, filterTasks
├── __tests__/
│   └── todo.test.ts              # 12 unit tests linked to REQ-1–5
│
├── .anchored-spec/config.json    ← Framework configuration
├── specs/
│   ├── workflow-policy.json      # Governance rules + lifecycle gates
│   ├── requirements/REQ-{1..5}.json
│   ├── decisions/ADR-1.json
│   └── changes/CHG-2025-0001-initial-todo/
│       ├── change.json
│       └── verification.json
├── docs/features.md              # Feature spec (referenced by traceRefs)
│
├── package.json                  # Next.js + anchored-spec + vitest
├── tsconfig.json                 # Standard Next.js TypeScript config
├── next.config.ts
├── postcss.config.mjs
└── vitest.config.ts
```

## Key Patterns to Notice

### EARS Behavioral Statements

Every requirement uses structured EARS notation. Compare:

- ❌ "The app should have a delete button" (vague, UI-specific)
- ✅ "When a user deletes a task, the system shall remove it from the list immediately." (behavioral, verifiable)

### Semantic Refs as Code Anchors

Requirements don't specify *how* — they specify *what* and anchor to *where*:

```json
"semanticRefs": {
  "symbols": ["addTask", "TaskItem"],
  "interfaces": ["TodoInput"]
}
```

If `addTask` is renamed to `createTask`, drift detection catches it immediately.

### Bidirectional Test Linking

Tests reference requirement IDs in their descriptions:

```typescript
describe("REQ-1: Add New Tasks", () => {
  it("BS-1: adds a task with the given title and incomplete status", () => { /* ... */ });
});
```

Requirements link back to test files:

```json
"verification": {
  "testRefs": [{ "path": "__tests__/todo.test.ts", "kind": "unit" }]
}
```

The `verify` command checks both directions — unlinked tests get flagged.

### Separation of Concerns

Domain logic lives in `lib/tasks.ts` — pure functions with no React dependency. Components in `components/` handle rendering. The page in `app/page.tsx` wires state to components. This makes the domain logic easy to test without React rendering and keeps semantic refs pointing to stable, framework-independent symbols.

## Try It Yourself

### Verify the specs

```bash
npm run spec:verify
```

All checks pass — schema validation, cross-references, lifecycle rules, test linking.

### Introduce drift and catch it

Rename `deleteTask` to `removeTask` in `lib/tasks.ts` (and update imports), then:

```bash
npm run spec:drift
```

REQ-4 reports `deleteTask` as "missing" — the spec is now out of sync with the code.

### Add a new requirement

```bash
npx anchored-spec create requirement --title "Persist tasks to localStorage"
```

Edit the new `REQ-6.json`, create a change record, implement it, link tests — the full workflow.

### Try the fix workflow

```bash
npx anchored-spec create change --title "Fix: empty title allows whitespace" --type fix
```

Fill in the `bugfixSpec` block, write a failing test, fix the code, then ship.
