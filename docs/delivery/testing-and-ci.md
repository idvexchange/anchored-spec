---
type: guide
status: current
audience:
  - developer
  - maintainer
  - reviewer
domain:
  - delivery
ea-entities:
  - capability:default/drift-detection
  - capability:default/governed-evolution
  - capability:default/ai-context-assembly
  - api:default/anchored-spec-cli-api
  - component:default/anchored-spec-library
  - component:default/anchored-spec-cli
---

# Testing and CI

Architecture workflows are only valuable if teams trust them during day-to-day delivery.

## Local Checks

Useful local commands:

```bash
pnpm run build
pnpm run test
pnpm run lint
pnpm exec anchored-spec validate
pnpm exec anchored-spec trace --summary
```

Add `drift`, `diff --compat --policy`, or `reconcile` when the change affects contracts, discovery sources, or linked documentation.

## CI Gates

Good CI patterns for Anchored Spec repositories:

- run `validate` on every PR
- run `diff --compat --policy` when the PR changes architecture-sensitive files
- publish graph or report outputs as CI artifacts
- keep `reconcile --include-trace --include-docs` available for stronger gates

Useful stage-level recipes:

### Fast validation stage

Run early on every pull request:

```bash
pnpm exec anchored-spec validate
pnpm exec anchored-spec trace --summary
```

### Architecture consistency stage

Run when the repository depends on discovery, docs, or drift-sensitive workflows:

```bash
pnpm exec anchored-spec drift
pnpm exec anchored-spec report --view drift-heatmap --format markdown
```

### Change review stage

Use semantic diff in PR workflows:

```bash
pnpm exec anchored-spec diff --base main --compat --policy
```

### Impact analysis stage

Use change-aware impact analysis to surface downstream effects of a PR:

```bash
# Resolve changed files -> entities -> impacted entities
pnpm exec anchored-spec impact --from-diff HEAD~1 --format markdown

# Use --staged for pre-commit hooks
pnpm exec anchored-spec impact --from-diff --staged --format json

# Gate: fail the pipeline if high-impact changes are detected
pnpm exec anchored-spec impact --from-diff HEAD~1 --min-score 0.7 --fail-on-impact

# Sort by score for triage
pnpm exec anchored-spec impact --from-diff HEAD~1 --sort score --max-results 20

# Detailed rationale for reviewers
pnpm exec anchored-spec impact --from-diff HEAD~1 --explain --format markdown
```

### Constraints gate stage

Check whether changed entities are governed by architectural decisions or requirements:

```bash
# Gate: fail if a changed entity has governing constraints
pnpm exec anchored-spec constraints --from-diff HEAD~1 --fail-on-constraints

# View constraints for a specific entity
pnpm exec anchored-spec constraints Component:identity-gateway --format markdown

# JSON output for further processing
pnpm exec anchored-spec constraints --from-diff HEAD~1 --format json --output constraints.json
```

### Context assembly stage

Generate architecture context bundles for downstream tools such as LLMs, review bots, or documentation pipelines:

```bash
# Standard tier: balanced depth + size for PR descriptions
pnpm exec anchored-spec context Component:my-service --tier standard --format markdown

# LLM tier: optimized for language model consumption
pnpm exec anchored-spec context Component:my-service --tier llm --format markdown

# Deep tier: full investigation context for incident review
pnpm exec anchored-spec context Component:my-service --tier deep --format json

# Include rationale for each document's inclusion
pnpm exec anchored-spec context Component:my-service --tier standard --why-included

# Budget-constrained output
pnpm exec anchored-spec context Component:my-service --tier llm --budget 4000
```

### Deep gate stage

Use `reconcile` when the repository wants a fuller architecture gate:

```bash
pnpm exec anchored-spec reconcile --include-trace --include-docs
```

## Exit Codes for CI Gates

| Flag | Command | Exit code | Meaning |
|---|---|---|---|
| `--fail-on-impact` | `impact` | 1 | At least one impacted entity above threshold |
| `--fail-on-constraints` | `constraints` | 1 | At least one governing constraint found |

Commands exit `0` on success, `2` on input errors such as a missing entity or missing EA root, and `1` when a CI gate flag triggers.

## Reverse Resolution

The `--from-diff`, `--from-file`, and `--from-symbol` flags on `impact` and `constraints` commands use reverse resolution to map source changes back to EA entities. This works through:

1. File path matching using entity anchor paths and trace refs
2. Symbol matching through `@anchored-spec:` annotations in source code
3. Diff parsing from `git diff` output

This keeps CI pipelines decoupled from hard-coded entity refs.

## Example GitHub Actions Workflow

```yaml
name: Architecture Gate
on: [pull_request]

jobs:
  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: pnpm install --frozen-lockfile

      - name: Validate entity specs
        run: pnpm exec anchored-spec validate

      - name: Check trace integrity
        run: pnpm exec anchored-spec trace --summary

      - name: Impact analysis
        run: pnpm exec anchored-spec impact --from-diff origin/main --format markdown --explain

      - name: Constraints gate
        run: pnpm exec anchored-spec constraints --from-diff origin/main --fail-on-constraints

      - name: Drift detection
        run: pnpm exec anchored-spec drift --explain

      - name: Generate impact report artifact
        if: always()
        run: pnpm exec anchored-spec impact --from-diff origin/main --format json --output impact-report.json

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: architecture-reports
          path: impact-report.json
```

## Artifact Strategy

Useful CI artifacts include:

- impact analysis reports in JSON or Markdown
- constraint reports for audit trails
- context bundles for LLM-assisted review
- generated reports
- graph output
- drift summaries
- evidence summaries
- reconcile JSON output for deeper inspection

## What to Test

The most valuable tests usually cover:

- command-level behavior for the CLI
- fixtures for important entity kinds and relations
- drift and resolver behavior against representative sources
- documentation traceability and consistency

Readable failure output matters. Reviewers should understand whether a failure is about schema, policy, drift, or documentation quality.
