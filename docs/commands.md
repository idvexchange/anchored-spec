# Commands Reference

Complete reference for all Anchored Spec CLI commands.

## `init`

Initialize spec infrastructure in a project.

```bash
anchored-spec init [options]
```

| Option | Description |
|--------|-------------|
| `--bare` | Minimal setup — no drift resolvers, regex-only scanning |
| `--dry-run` | Preview what would be created without writing files |
| `--no-examples` | Skip creating starter example files |
| `--no-scripts` | Skip adding scripts to `package.json` |
| `--spec-root <path>` | Root directory for specs (default: `specs`) |
| `--force` | Overwrite existing config |

## `create`

Create a new spec artifact.

```bash
anchored-spec create <type> [options]
```

Types: `requirement`, `change`, `decision`

| Option | Description |
|--------|-------------|
| `--title <text>` | Title for the artifact (prompted if omitted) |
| `--type <type>` | Change type: `feature`, `fix`, `refactor`, `chore`, or any custom type from `customChangeTypes` (changes only) |
| `--slug <slug>` | URL-friendly identifier (auto-derived from title if omitted) |
| `--dry-run` | Preview without writing files |
| `--no-hooks` | Skip lifecycle hooks |

## `verify`

Run all validation checks across your spec artifacts.

```bash
anchored-spec verify [options]
```

| Option | Description |
|--------|-------------|
| `--strict` | Treat warnings as errors (exit code 1) |
| `--quiet` | Only show errors, suppress warnings |
| `--json` | Output structured JSON to stdout (ideal for CI) |
| `--watch` | Re-verify automatically on file changes |

### Checks Performed

1. **Schema validation** — All JSON files validate against their schemas
2. **Vague language detection** — Flags imprecise wording in behavior statements
3. **EARS compliance** — Verifies "response" field uses "shall" format
4. **Route format validation** — Catches Express-style `:param` in semantic refs
5. **Semantic ref population** — Active/shipped requirements must have code anchors
6. **Unique ID enforcement** — Duplicate BS, variant, and rule IDs are flagged
7. **Policy quality** — Unique variant and rule IDs across workflow policy
8. **Cross-reference integrity** — REQ↔CHG bidirectional links are consistent
9. **Lifecycle rules** — Transition gates (e.g., shipped requires coverage)
10. **Dependency validation** — Missing references, blocked status derivation
11. **Cycle detection** — Circular requirement dependencies
12. **System name detection** — Flags technology names in behavioral text
13. **Test kind coverage** — Checks `testRefs` against `requiredTestKinds`
14. **File path existence** — Validates that `testRefs`, `traceRefs`, `testFiles` paths exist on disk
15. **Bidirectional test linking** — Ensures test files reference the requirements that claim them
16. **Evidence validation** — Checks evidence integrity when `evidence.json` exists
17. **Plugin checks** — Custom verification from registered plugins (`config.plugins`)
18. **Plugin onVerify hooks** — Full-context plugin hooks that can react to built-in findings

## `generate`

Regenerate human-readable markdown from JSON specs.

```bash
anchored-spec generate [options]
```

| Option | Description |
|--------|-------------|
| `--check` | Check if generated files are stale without writing (CI-friendly) |
| `--watch` | Regenerate automatically on file changes |

## `status`

Show a project health dashboard.

```bash
anchored-spec status [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable JSON output |

## `transition`

Advance a change record to the next phase.

```bash
anchored-spec transition <id> [options]
```

| Option | Description |
|--------|-------------|
| `--to <phase>` | Move to a specific phase instead of the next one |
| `--force` | Skip gate validation checks |
| `--no-hooks` | Skip lifecycle hooks |

## `check`

Git-aware policy enforcement — checks whether file changes require a change record.

```bash
anchored-spec check [options]
```

| Option | Description |
|--------|-------------|
| `--staged` | Check only git-staged files |
| `--against <branch>` | Compare against a specific branch |
| `--paths <files...>` | Manually specify paths (no git) |
| `--json` | Machine-readable JSON output |

## `drift`

Detect semantic drift between specs and source code. See [Drift Detection](drift-detection.md) for details.

```bash
anchored-spec drift [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable JSON output |
| `--fail-on-missing` | Exit with error code if any refs are missing (CI) |
| `--resolver <path...>` | Additional drift resolver modules |
| `--generate-map` | Write `semantic-links.json` to generated dir |
| `--check-map` | Check if `semantic-links.json` is stale (CI) |
| `--watch` | Re-run on spec/source file changes |

## `migrate`

Detect and apply schema migrations when the spec schema version changes.

```bash
anchored-spec migrate [options]
```

## `import`

Import existing markdown ADRs or requirements into JSON format.

```bash
anchored-spec import <path> [options]
```

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview import without writing files |

## `report`

Generate traceability matrix and coverage reports.

```bash
anchored-spec report [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable JSON output |
| `--out <file>` | Write report to a specific file |

## `evidence`

Manage test evidence artifacts.

```bash
# Collect evidence from test runner output
anchored-spec evidence collect --from <path> --format <fmt>

# Validate evidence against requirements
anchored-spec evidence validate
```

| Option | Description |
|--------|-------------|
| `--from <path>` | Path to test runner output file |
| `--format <fmt>` | Parser format: `vitest`, `jest`, `junit` |

## `impact`

Analyze which requirements are affected by file changes. See [Evidence & Impact](evidence-pipeline.md) for details.

```bash
anchored-spec impact <paths...> [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable JSON output |
| `--generate` | Generate full impact map to generated dir |
