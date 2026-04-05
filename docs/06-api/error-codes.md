# Error Codes

This document describes the command-level exit code model used by the current CLI.

## Exit Code Contract

### `0`

Successful execution.

### `1`

Execution failed after valid input was accepted. Common examples:

- validation findings treated as failure
- policy or compatibility gate failure
- explicit CI gate conditions such as `--fail-on-impact` or `--fail-on-constraints`
- unsupported transitions or command workflow failures

### `2`

Input or setup error. Common examples:

- missing required input
- unknown entity or unresolved diff target
- repository not initialized for Anchored Spec
- invalid command options or missing supporting files

## Implementation Reference

The error carrier is `CliError` in `src/cli/errors.ts`. Commands throw it and the top-level router in `src/cli/index.ts` converts it into process exit behavior.

## Practical Guidance

For CI:

- treat `1` as a meaningful workflow or quality failure
- treat `2` as a broken job or incorrect invocation

For humans:

- fix invocation or repository setup first when you see `2`
- inspect model quality or policy state when you see `1`
