# EA CI/CD Integration Guide

This document describes how to integrate enterprise architecture validation, drift detection, and generation checks into CI/CD pipelines.

Read [ea-design-overview.md](./ea-design-overview.md) for context and [ci-integration.md](./ci-integration.md) for existing (non-EA) CI patterns.

## GitHub Actions — Full EA Pipeline

```yaml
# .github/workflows/ea.yml
name: Enterprise Architecture Checks
on: [push, pull_request]

jobs:
  ea-validate:
    name: EA Validation
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci

      # Stage 1: Schema and quality validation
      - name: Validate EA artifacts
        run: npx anchored-spec ea validate --strict --json > ea-validate.json

      # Stage 2: Relation graph integrity
      - name: Validate relation graph
        run: npx anchored-spec ea graph --format json > /dev/null

      # Stage 3: Check generated outputs are up to date
      - name: Check generation freshness
        run: npx anchored-spec ea generate --check

      # Stage 4: Run existing spec checks alongside EA
      - name: Verify all specs (legacy + EA)
        run: npx anchored-spec verify --strict

      # Upload validation results as artifact
      - name: Upload EA validation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ea-validation
          path: ea-validate.json

  ea-drift:
    name: EA Drift Detection
    runs-on: ubuntu-latest
    needs: ea-validate
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci

      # Run drift detection with resolvers
      - name: Detect EA drift
        run: npx anchored-spec ea drift --json > ea-drift.json

      # Fail on errors, warn on warnings
      - name: Check drift results
        run: |
          ERRORS=$(jq '.summary.errors' ea-drift.json)
          if [ "$ERRORS" -gt 0 ]; then
            echo "::error::EA drift detected: $ERRORS error(s)"
            jq '.findings[] | select(.severity == "error")' ea-drift.json
            exit 1
          fi
          WARNINGS=$(jq '.summary.warnings' ea-drift.json)
          if [ "$WARNINGS" -gt 0 ]; then
            echo "::warning::EA drift warnings: $WARNINGS warning(s)"
            jq '.findings[] | select(.severity == "warning")' ea-drift.json
          fi

      - name: Upload drift report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ea-drift-report
          path: ea-drift.json

  ea-reports:
    name: EA Report Generation
    runs-on: ubuntu-latest
    needs: ea-validate
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci

      # Generate all EA reports
      - name: Generate EA reports
        run: npx anchored-spec ea report --all --json

      # Upload generated reports
      - name: Upload EA reports
        uses: actions/upload-artifact@v4
        with:
          name: ea-reports
          path: specs/ea/generated/
```

## Pipeline Stages Explained

### Stage 1: Validation (Every PR)

```bash
npx anchored-spec ea validate --strict --json
```

**What it checks:**
- JSON Schema compliance for every EA artifact
- Quality rules (missing owners, empty summaries, orphan artifacts)
- Relation validation (targets exist, kind pairs valid, no forbidden cycles)
- Transition plan integrity (baseline/target references, milestone consistency)
- Exception validity (not expired, scope not empty)

**Fail gate:** Any schema or relation integrity error blocks the PR.

**Why:** Catches structural problems immediately. Fast (< 10s for hundreds of artifacts).

### Stage 2: Graph Integrity (Every PR)

```bash
npx anchored-spec ea graph --format json > /dev/null
```

**What it checks:**
- The relation graph can be built without errors
- No unresolved references
- No orphan subgraphs (warning, not error)

**Fail gate:** Graph build failure blocks the PR.

**Why:** Validates the relation graph is internally consistent.

### Stage 3: Generation Freshness (Every PR)

```bash
npx anchored-spec ea generate --check
```

**What it checks:**
- Generated files (OpenAPI stubs, JSON Schema, etc.) match what the generators would produce from current EA artifacts
- No manual edits to generated files that would be overwritten

**Fail gate:** Generation drift blocks the PR (someone edited a generated file instead of the source EA artifact).

### Stage 4: Full Drift Detection (Main Branch or Scheduled)

```bash
npx anchored-spec ea drift --json
```

**What it checks:**
- Anchor resolution against resolvers (APIs exist, schemas match, infra resources present)
- Topology comparison (observed deployments vs declared deployments)
- Graph integrity rules (business capabilities have realizing systems, etc.)
- Exception suppression (findings suppressed by active exceptions are flagged but not errors)

**Fail gate:** Configurable. Recommended: errors block, warnings are advisory.

**Why:** Slower (requires resolver execution, possibly cached). Run on main branch merges or on a schedule rather than every PR.

### Stage 5: Report Generation (Main Branch Only)

```bash
npx anchored-spec ea report --all --json
```

**What it produces:**
- Capability map
- System-data matrix
- Target gap analysis
- Drift heatmap
- Exception report
- Report index

**Fail gate:** None. Report generation should not block merges.

**Why:** Reports are the output of the EA model — useful for architecture review meetings, stakeholder communication, and compliance audits.

## Staged Adoption for CI

Teams don't need to enable all stages at once. Recommended rollout:

### Week 1: Validation Only

```yaml
- run: npx anchored-spec ea validate --json
  # Don't use --strict yet — fix warnings gradually
```

### Week 2: Add Strict Mode

```yaml
- run: npx anchored-spec ea validate --strict --json
```

### Week 3: Add Graph Checks

```yaml
- run: npx anchored-spec ea validate --strict --json
- run: npx anchored-spec ea graph --format json > /dev/null
```

### Week 4: Add Drift Detection (Non-Blocking)

```yaml
- name: Detect drift (advisory)
  run: npx anchored-spec ea drift --json || true
```

### Week 5+: Make Drift Blocking

```yaml
- name: Detect drift (blocking)
  run: npx anchored-spec ea drift --fail-on-warning
```

## PR Comment Integration

For teams that want drift findings as PR comments:

```yaml
- name: Post drift summary as PR comment
  if: github.event_name == 'pull_request' && always()
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('fs');
      const report = JSON.parse(fs.readFileSync('ea-drift.json', 'utf-8'));
      const body = `## EA Drift Report
      
      | Category | Errors | Warnings |
      |----------|--------|----------|
      ${Object.entries(report.byDomain).map(([d, c]) => 
        `| ${d} | ${c.errors} | ${c.warnings} |`
      ).join('\n')}
      
      **Total:** ${report.summary.errors} errors, ${report.summary.warnings} warnings
      ${report.summary.suppressed > 0 ? `\n${report.summary.suppressed} findings suppressed by exceptions` : ''}
      `;
      
      github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        body
      });
```

## Scheduled Drift Checks

For teams with external resolvers (K8s, Terraform, cloud inventory), run drift on a schedule to catch infrastructure changes that happen outside of code PRs:

```yaml
# .github/workflows/ea-scheduled-drift.yml
name: Scheduled EA Drift
on:
  schedule:
    - cron: '0 6 * * 1-5'  # Weekdays at 6am UTC
  workflow_dispatch: {}

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci

      - name: Run full drift with fresh resolver data
        run: npx anchored-spec ea drift --no-cache --json > ea-drift.json

      - name: Create issue if drift detected
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('ea-drift.json', 'utf-8'));
            if (report.summary.errors > 0) {
              github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: `EA Drift Alert: ${report.summary.errors} error(s) detected`,
                body: `Scheduled drift check found ${report.summary.errors} errors and ${report.summary.warnings} warnings.\n\nSee workflow run for details.`,
                labels: ['ea-drift', 'automated']
              });
            }
```

## Combining with Existing CI

If you already have `anchored-spec verify` in CI, the EA checks run alongside:

```yaml
jobs:
  spec-checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci

      # Existing spec checks (REQ/CHG/ADR)
      - run: npx anchored-spec verify --strict
      - run: npx anchored-spec generate --check
      - run: npx anchored-spec drift --fail-on-missing

      # EA checks (additive)
      - run: npx anchored-spec ea validate --strict
      - run: npx anchored-spec ea drift --json || true  # Advisory until confident
```

Both pipelines produce independent results. They share the same `.anchored-spec/config.json` — the `ea.enabled` flag controls whether EA checks are active.
