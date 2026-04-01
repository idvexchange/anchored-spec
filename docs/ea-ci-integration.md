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

### Deep gate stage

Use reconcile when the repository wants a fuller architecture gate:

```bash
npx anchored-spec reconcile --include-trace --include-docs
```

## Artifact strategy

Useful CI artifacts include:

- generated reports
- graph output
- drift summaries
- evidence summaries
- reconcile JSON output for deeper inspection

## CI philosophy

The best anchored-spec CI setups make architecture review visible and actionable. They do not hide architecture checks behind vague pass/fail signals.
