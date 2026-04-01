# CI Integration

Anchored Spec works well in CI because it is repository-local and command-line driven.

## Recommended CI stages

### Fast validation stage

Run early on every pull request:

```bash
npx anchored-spec validate
npx anchored-spec trace --summary
```

### Architecture consistency stage

Run when the repository depends on discovery, docs, or drift-sensitive workflows:

```bash
npx anchored-spec drift
npx anchored-spec report --view drift-heatmap --format markdown
```

### Change review stage

Use semantic diff in PR workflows:

```bash
npx anchored-spec diff --base main --compat --policy
```

### Impact analysis stage

Use change-aware impact analysis to surface downstream effects of a PR:

```bash
# Resolve changed files → entities → impacted entities
npx anchored-spec impact --from-diff HEAD~1 --format markdown

# Use --staged for pre-commit hooks
npx anchored-spec impact --from-diff --staged --format json

# Gate: fail the pipeline if high-impact changes are detected
npx anchored-spec impact --from-diff HEAD~1 --min-score 0.7 --fail-on-impact

# Sort by score for triage
npx anchored-spec impact --from-diff HEAD~1 --sort score --max-results 20

# Detailed rationale for reviewers
npx anchored-spec impact --from-diff HEAD~1 --explain --format markdown
```

### Constraints gate stage

Check whether changed entities are governed by architectural decisions or requirements:

```bash
# Gate: fail if a changed entity has governing constraints
npx anchored-spec constraints --from-diff HEAD~1 --fail-on-constraints

# View constraints for a specific entity
npx anchored-spec constraints Component:identity-gateway --format markdown

# JSON output for further processing
npx anchored-spec constraints --from-diff HEAD~1 --format json --output constraints.json
```

### Context assembly stage

Generate architecture context bundles for downstream tools (LLMs, review bots, documentation pipelines):

```bash
# Standard tier: balanced depth + size for PR descriptions
npx anchored-spec context Component:my-service --tier standard --format markdown

# LLM tier: optimised for language model consumption (deduplication, canonical preference, structured)
npx anchored-spec context Component:my-service --tier llm --format markdown

# Deep tier: full investigation context for incident review
npx anchored-spec context Component:my-service --tier deep --format json

# Include rationale for each document's inclusion
npx anchored-spec context Component:my-service --tier standard --why-included

# Budget-constrained output
npx anchored-spec context Component:my-service --tier llm --budget 4000
```

### Deep gate stage

Use reconcile when the repository wants a fuller architecture gate:

```bash
npx anchored-spec reconcile --include-trace --include-docs
```

## Exit codes for CI gates

| Flag | Command | Exit code | Meaning |
|---|---|---|---|
| `--fail-on-impact` | `impact` | 1 | At least one impacted entity above threshold |
| `--fail-on-constraints` | `constraints` | 1 | At least one governing constraint found |

Commands exit 0 on success, 2 on input errors (missing entity, no EA root), and 1 when a CI gate flag triggers.

## Reverse resolution: from files to entities

The `--from-diff`, `--from-file`, and `--from-symbol` flags on `impact` and `constraints` commands use reverse resolution to map source code changes to EA entities. This works via:

1. **File path matching** — entity anchor paths and trace refs
2. **Symbol matching** — `@anchored-spec:` annotations in source code
3. **Diff parsing** — `git diff` output to extract changed file paths

This means CI pipelines do not need to know entity refs — they can use raw file paths or git diffs.

## Example GitHub Actions workflow

```yaml
name: Architecture Gate
on: [pull_request]

jobs:
  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for diff resolution

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      # Fast checks
      - name: Validate entity specs
        run: npx anchored-spec validate

      - name: Check trace integrity
        run: npx anchored-spec trace --summary

      # Change-aware checks
      - name: Impact analysis
        run: npx anchored-spec impact --from-diff origin/main --format markdown --explain

      - name: Constraints gate
        run: npx anchored-spec constraints --from-diff origin/main --fail-on-constraints

      - name: Drift detection
        run: npx anchored-spec drift --explain

      # Artifacts
      - name: Generate context bundle
        if: always()
        run: npx anchored-spec impact --from-diff origin/main --format json --output impact-report.json

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: architecture-reports
          path: impact-report.json
```

## Artifact strategy

Useful CI artifacts include:

- impact analysis reports (JSON or Markdown)
- constraint reports for audit trails
- context bundles for LLM-assisted review
- generated reports
- graph output
- drift summaries
- evidence summaries
- reconcile JSON output for deeper inspection

## CI philosophy

The best anchored-spec CI setups make architecture review visible and actionable. They do not hide architecture checks behind vague pass/fail signals.
