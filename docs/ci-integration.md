# CI Integration

Add Anchored Spec verification to your CI pipeline to enforce spec quality on every commit and pull request.

## GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  verify-specs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      # Validate all specs
      - run: npx anchored-spec verify --strict

      # Or use --json for structured output in CI
      # - run: npx anchored-spec verify --strict --json

      # Ensure generated docs are up to date
      - run: npx anchored-spec generate --check

      # Check for semantic drift
      - run: npx anchored-spec drift --fail-on-missing

      # Ensure semantic link map is fresh
      - run: npx anchored-spec drift --check-map

      # Validate test evidence
      - run: npx anchored-spec evidence validate
```

### What Each Check Does

| Command | Purpose | Failure means |
|---------|---------|---------------|
| `verify --strict` | Schema, quality, integrity checks | Spec files are invalid or inconsistent |
| `generate --check` | Compares generated markdown to JSON | Someone edited generated files instead of JSON source |
| `drift --fail-on-missing` | Scans code for semantic refs | An interface, route, or symbol was renamed/removed |
| `drift --check-map` | Compares semantic link map | The link map needs regenerating |
| `evidence validate` | Checks test evidence integrity | Required tests are missing or failing |

## Pre-commit Hook

Use `anchored-spec check --staged` as a git pre-commit hook to enforce governance locally before pushing:

### With Husky (recommended)

```bash
npx husky add .husky/pre-commit "npx anchored-spec check --staged"
```

### Manual Setup

```bash
# .git/hooks/pre-commit
#!/bin/sh
npx anchored-spec check --staged
```

### What It Does

The `check --staged` command:

1. Gets the list of staged files from git
2. Matches them against `changeRequiredRules` in your workflow policy
3. Checks `trivialExemptions` for excluded paths
4. Verifies that an **active change record** covers any governed paths
5. Blocks the commit if governed paths aren't covered

### Checking Against a Branch

For PR-level enforcement (e.g., in a CI job), compare against the base branch:

```bash
npx anchored-spec check --against main
```

This diffs against `main` instead of using staged files.

### Manual Path Checking

Skip git entirely and specify paths directly:

```bash
npx anchored-spec check --paths src/auth.ts src/routes/login.ts
```

## CI Best Practices

### Run Verification Early

Put spec verification before tests and builds — invalid specs should fail fast:

```yaml
jobs:
  specs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx anchored-spec verify --strict
      - run: npx anchored-spec drift --fail-on-missing

  test:
    needs: specs
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
```

### Use `--strict` in CI

The `--strict` flag treats warnings as errors, ensuring nothing slips through:

```bash
npx anchored-spec verify --strict
```

### Use `--json` for Programmatic Processing

All read-only commands support `--json` for machine-readable output:

```bash
npx anchored-spec drift --json | jq '.summary.missing'
npx anchored-spec status --json | jq '.requirements.active'
npx anchored-spec impact --json src/auth.ts | jq '.[].matchedRequirements'
```

### Cache Dependencies

Anchored Spec is a dev dependency — cache `node_modules` to speed up CI:

```yaml
- uses: actions/cache@v4
  with:
    path: node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}
```
