# Configuration

Anchored Spec uses a JSON configuration file and a workflow policy to control framework behavior.

## Config File

Located at `.anchored-spec/config.json`, created by `anchored-spec init`:

```json
{
  "specRoot": "specs",
  "schemasDir": "specs/schemas",
  "requirementsDir": "specs/requirements",
  "changesDir": "specs/changes",
  "decisionsDir": "specs/decisions",
  "workflowPolicyPath": "specs/workflow-policy.json",
  "generatedDir": "specs/generated",
  "driftResolvers": ["anchored-spec/resolvers/typescript-ast"],
  "plugins": [],
  "hooks": [],
  "testMetadata": {
    "testGlobs": ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"],
    "requirementPattern": "\\bREQ-[1-9][0-9]*\\b"
  }
}
```

### Config Fields

| Field | Type | Description |
|-------|------|-------------|
| `specRoot` | `string` | Root directory for all spec artifacts |
| `schemasDir` | `string` | Directory containing JSON Schema files |
| `requirementsDir` | `string` | Directory for requirement JSON files |
| `changesDir` | `string` | Directory for change record directories |
| `decisionsDir` | `string` | Directory for decision (ADR) JSON files |
| `workflowPolicyPath` | `string` | Path to workflow policy JSON |
| `generatedDir` | `string` | Output directory for generated markdown |
| `sourceRoots` | `string[]` | Source directories for drift detection (default: `["src"]`) |
| `sourceGlobs` | `string[]` | Glob patterns for source file discovery |
| `driftResolvers` | `string[]` | Drift resolver module paths (see [Drift Detection](drift-detection.md)) |
| `plugins` | `string[]` | Plugin module paths (see [Plugins & Hooks](plugins-and-hooks.md)) |
| `hooks` | `HookDefinition[]` | Lifecycle hook definitions |
| `testMetadata` | `object` | Test file discovery configuration |
| `exclude` | `string[]` | Glob patterns to exclude from artifact loading (default: `["**/.*"]`) |
| `customChangeTypes` | `string[]` | Custom change types beyond the built-in `feature`/`fix`/`refactor`/`chore` |
| `quality.validateFilePaths` | `boolean` | Validate that traceRef/testRef paths exist on disk |
| `quality.rules` | `Record<string, "error" \| "warn" \| "off">` | Per-rule severity overrides (see below) |

## Workflow Policy

The workflow policy (`specs/workflow-policy.json`) defines governance rules:

### Workflow Variants

Define different ceremony levels for different types of work:

```json
{
  "workflowVariants": [
    {
      "id": "feature-behavior-first",
      "name": "Feature (Behavior First)",
      "defaultTypes": ["feature"],
      "artifacts": ["requirements", "design-doc"]
    },
    {
      "id": "fix-root-cause",
      "name": "Bug Fix",
      "defaultTypes": ["fix"],
      "artifacts": ["requirements"]
    },
    {
      "id": "chore",
      "name": "Chore",
      "defaultTypes": ["chore"],
      "artifacts": []
    }
  ]
}
```

### Change Required Rules

Glob patterns that trigger change record requirements:

```json
{
  "changeRequiredRules": [
    {
      "id": "governed-source",
      "include": ["src/**/*.ts"],
      "description": "Source files require a change record"
    },
    {
      "id": "api-routes",
      "include": ["src/routes/**"],
      "exclude": ["src/routes/__tests__/**"],
      "description": "API route changes need formal governance",
      "requiredDocs": ["docs/api.md"],
      "requiredDriftChecks": ["semantic-links"]
    }
  ]
}
```

### Trivial Exemptions

Paths that never need a change record:

```json
{
  "trivialExemptions": [
    "README.md",
    "CONTRIBUTING.md",
    ".github/**",
    "*.config.*",
    "**/*.test.ts"
  ]
}
```

### Lifecycle Rules

Gates enforced during phase transitions:

```json
{
  "lifecycleRules": {
    "plannedToActiveRequiresChange": true,
    "activeToShippedRequiresCoverage": true,
    "deprecatedRequiresReason": true
  }
}
```

## Schema Extensions

All requirement, change, and decision schemas support an `extensions` field for project-specific metadata:

```json
{
  "id": "REQ-1",
  "title": "User can log in",
  "extensions": {
    "jira": { "issueKey": "PROJ-123" },
    "compliance": { "level": "high", "standard": "SOC2" },
    "custom": { "team": "platform", "sprint": 42 }
  }
}
```

Extensions are:
- **Preserved** through validation and generation
- **Free-form** — any JSON structure is accepted
- **Available on requirements, changes, decisions, and workflow policy**
- **Validatable with plugins** — write custom checks for your extension fields

### Example: Validating Extensions with a Plugin

```javascript
// .anchored-spec/plugins/validate-jira.js
export default {
  name: "validate-jira",
  checks: [{
    id: "jira-key-format",
    description: "Jira issue keys must match PROJ-NNN format",
    check: (ctx) => {
      return ctx.requirements
        .filter(r => r.extensions?.jira?.issueKey)
        .filter(r => !/^[A-Z]+-\d+$/.test(r.extensions.jira.issueKey))
        .map(r => ({
          path: `${r.id}/extensions/jira`,
          message: `Invalid Jira key: ${r.extensions.jira.issueKey}`,
          severity: "error",
        }));
    },
  }],
};
```

## Quality Rule Overrides

Override the severity of any built-in or plugin verification rule:

```json
{
  "quality": {
    "validateFilePaths": true,
    "rules": {
      "quality:no-vague-language": "off",
      "quality:semantic-refs-populated": "error",
      "quality:missing-test-refs": "warn",
      "quality:nfr-measurability": "warn",
      "plugin:my-plugin/custom-check": "off"
    }
  }
}
```

Values: `"error"` (fail verify), `"warn"` (show but don't fail), `"off"` (suppress entirely). These overrides apply to both built-in and plugin findings.

## Custom Change Types

Add project-specific change types beyond the built-in `feature`, `fix`, `refactor`, `chore`:

```json
{
  "customChangeTypes": ["infrastructure", "schema", "workflow", "security"]
}
```

Custom types can be assigned to workflow variants in `defaultTypes` and used with `anchored-spec create change --type <custom-type>`. All types must match the pattern `^[a-z][a-z0-9-]*$`.

## Schema Versioning

All spec schemas include a `schemaVersion` field for migration tracking:

```json
{
  "id": "REQ-1",
  "schemaVersion": "0.2.0",
  "title": "..."
}
```

When the schema version changes, run `anchored-spec migrate` to detect and apply migrations to your existing spec files.

## Enterprise Architecture Configuration

When EA is enabled, additional configuration is available under the `ea` key:

```json
{
  "ea": {
    "enabled": true,
    "rootDir": "ea",
    "domains": {
      "systems": "ea/systems",
      "delivery": "ea/delivery",
      "data": "ea/data",
      "information": "ea/information",
      "business": "ea/business",
      "transitions": "ea/transitions",
      "legacy": "ea/legacy"
    }
  }
}
```

| Key | Default | Description |
|---|---|---|
| `ea.enabled` | `false` | Enable the EA extension |
| `ea.rootDir` | `"ea"` | Root directory for EA artifacts |
| `ea.domains.*` | `"ea/{domain}"` | Per-domain directory paths |

See [EA Design Overview](ea-design-overview.md) for full EA documentation.
