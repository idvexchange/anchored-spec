# Todo App Example

This example is a full application plus a historical architecture fixture set used for richer regression coverage.

## What this example is for

Use this directory when you want to see how anchored-spec can be applied to a realistic app and how repository-local architecture workflows fit around a product codebase.

It includes:

- a Next.js application
- a non-trivial workflow policy
- configured resolvers
- transition and exception examples
- enough architecture material to exercise drift, reports, traceability, and review flows

## Important note about the layout

This example still uses an older `ea/` directory fixture layout. That makes it useful for tests and migration-oriented reference work, but it is not the preferred starting structure for a new anchored-spec repository.

For greenfield projects, start from the Backstage-aligned manifest or inline examples.

## Running the app

```bash
cd examples/todo-app
npm install
npm run dev
```

## Running anchored-spec workflows

From the repository root:

```bash
npx anchored-spec --cwd examples/todo-app validate
npx anchored-spec --cwd examples/todo-app drift
npx anchored-spec --cwd examples/todo-app status
npx anchored-spec --cwd examples/todo-app diff --base main --compat --policy
```

## Why this example still matters

Even though it is not the preferred layout for new projects, it is useful because it shows:

- how architecture workflows interact with a real application repo
- how workflow policy, transitions, and exceptions behave together
- how configured resolvers can participate in repository analysis
- how teams migrating older architecture material can still reason about it using current anchored-spec commands
