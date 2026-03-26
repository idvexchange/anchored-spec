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
| `driftResolvers` | `string[]` | Drift resolver module paths (see [Drift Detection](drift-detection.md)) |
| `plugins` | `string[]` | Plugin module paths (see [Plugins & Hooks](plugins-and-hooks.md)) |
| `hooks` | `HookDefinition[]` | Lifecycle hook definitions |
| `testMetadata` | `object` | Test file discovery configuration |

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
      "pattern": "src/**/*.ts",
      "message": "Source files require a change record"
    },
    {
      "id": "api-routes",
      "pattern": "src/routes/**",
      "message": "API route changes need formal governance"
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
    "shipped": {
      "requiresCoverage": true
    }
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
- **Available on requirements, changes, and decisions** (not workflow policy)
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
