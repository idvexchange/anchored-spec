# Plugins & Hooks

Extend Anchored Spec with custom verification checks, lifecycle automation, and plugin hooks.

## Plugin System

Plugins add custom verification checks and hooks that run alongside the built-in engine during `anchored-spec verify` and `anchored-spec generate`.

### Writing a Plugin

A plugin is a JavaScript/TypeScript module that exports a default object with a `name`, optional `checks` array, and optional `hooks`:

```javascript
// .anchored-spec/plugins/my-plugin.js
export default {
  name: "my-plugin",
  version: "1.0.0",

  // Simple checks — pure functions that return findings
  checks: [
    {
      id: "unique-tags",
      description: "All tags must be used by at least 2 requirements",
      check: (ctx) => {
        const tagCounts = {};
        for (const req of ctx.requirements) {
          for (const tag of req.tags ?? []) {
            tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
          }
        }
        return Object.entries(tagCounts)
          .filter(([, count]) => count < 2)
          .map(([tag]) => ({
            path: "tags",
            message: `Tag "${tag}" is only used once`,
            severity: "warning",
            rule: "unique-tags",
          }));
      },
    },
  ],

  // Hooks — full-context callbacks
  hooks: {
    // Runs after all built-in + plugin checks, receives findings
    onVerify: (ctx) => {
      const errors = [];
      // Example: validate policy extensions
      const routing = ctx.spec.policy?.extensions?.commonRequestRouting;
      if (routing && !Array.isArray(routing)) {
        errors.push({
          path: "workflow-policy/extensions",
          message: "commonRequestRouting must be an array",
          severity: "error",
          rule: "valid-routing",
        });
      }
      return errors;
    },

    // Runs after markdown generation
    onGenerate: async (ctx) => {
      console.log(`Generated to ${ctx.generatedDir}`);
    },
  },
};
```

### Plugin Interface

```typescript
interface AnchoredSpecPlugin {
  name: string;
  version?: string;
  checks?: PluginCheck[];
  hooks?: PluginHooks;
}

interface PluginCheck {
  id: string;
  description: string;
  check: (ctx: PluginContext) => ValidationError[];
}

interface PluginHooks {
  onGenerate?: (context: GenerateHookContext) => void | Promise<void>;
  onVerify?: (context: VerifyHookContext) => ValidationError[] | Promise<ValidationError[]>;
}
```

### Plugin Context

Each check function and hook receives a `PluginContext` with full access to all spec data and configuration:

```typescript
interface PluginContext {
  requirements: Requirement[];
  changes: Change[];
  decisions: Decision[];
  policy: WorkflowPolicy | null;
  projectRoot: string;
  config: AnchoredSpecConfig;         // Full resolved config
}
```

### Hook Contexts

```typescript
interface VerifyHookContext {
  spec: PluginContext;
  builtinFindings: ValidationError[];  // All findings from built-in + plugin checks
}

interface GenerateHookContext {
  spec: PluginContext;
  generatedDir: string;               // Path to the generated output directory
}
```

### Check Return Format

Each check returns an array of `ValidationError` objects:

```typescript
interface ValidationError {
  path: string;                    // Which artifact or location
  message: string;                 // Human-readable description
  severity: "error" | "warning";
  rule: string;                    // Rule identifier (auto-prefixed with "plugin:<name>/")
  suggestion?: string;             // Actionable remediation hint
}
```

Return an empty array `[]` if the check passes.

### Execution Order

During `anchored-spec verify`, checks run in this order:

1. **Built-in checks** (steps 1–10: schema, quality, lifecycle, cross-refs, test-linking, evidence)
2. **Plugin `checks[]`** (step 11) — Simple pure-function checks
3. **Plugin `onVerify` hooks** (step 12) — Full-context hooks that receive all prior findings

Rule severity overrides from `config.quality.rules` apply to **all** findings — built-in and plugin alike. Plugin rule names are auto-prefixed as `plugin:<plugin-name>/<check-id>`.

### Registering Plugins

Add plugin paths to `.anchored-spec/config.json`:

```json
{
  "plugins": [
    "./.anchored-spec/plugins/no-orphan-tags.js",
    "./.anchored-spec/plugins/validate-jira.js"
  ]
}
```

### Programmatic Usage

```typescript
import { loadPlugins, runPluginChecks } from "anchored-spec";

const plugins = await loadPlugins(["./.anchored-spec/plugins/my-plugin.js"], projectRoot);
const errors = runPluginChecks(plugins, {
  requirements,
  changes,
  decisions,
  policy,
  projectRoot,
  config,
});
```

## Lifecycle Hooks

Hooks run shell scripts after `create` and `transition` commands. They're useful for automation — updating project boards, scaffolding files, sending notifications, etc.

### Configuring Hooks

Add hooks to `.anchored-spec/config.json`:

```json
{
  "hooks": [
    { "event": "post-create", "run": ".anchored-spec/hooks/scaffold-docs.sh" },
    { "event": "post-transition", "run": ".anchored-spec/hooks/update-board.sh" },
    { "event": "post-create:requirement", "run": ".anchored-spec/hooks/notify-team.sh" },
    { "event": "post-transition:done", "run": ".anchored-spec/hooks/deploy-check.sh" }
  ]
}
```

### Event Types

| Event | When it fires |
|-------|---------------|
| `post-create` | After any artifact is created |
| `post-create:requirement` | After a requirement is created |
| `post-create:change` | After a change is created |
| `post-create:decision` | After a decision is created |
| `post-transition` | After any phase transition |
| `post-transition:<phase>` | After transition to a specific phase (e.g., `post-transition:done`) |

### Compound Event Matching

Hooks use compound event matching: `post-create:requirement` matches only requirement creation. The base event `post-create` matches all creation types. When both exist, the specific compound event fires first, then the base event.

### Environment Variables

Hook scripts receive context as environment variables:

| Variable | Description |
|----------|-------------|
| `ANCHORED_SPEC_EVENT` | The event name (e.g., `post-create:requirement`) |
| `ANCHORED_SPEC_ID` | ID of the artifact |
| `ANCHORED_SPEC_TYPE` | Artifact type (`requirement`, `change`, `decision`) |
| `ANCHORED_SPEC_STATUS` | Current status of the artifact |

### Behavior

- Hooks **warn but don't block** on failure — a failing hook script doesn't prevent the command from completing
- Use `--no-hooks` on `create` and `transition` commands to skip hooks entirely
- Hooks respect `--dry-run` — they fire with a `dryRun` flag so scripts can check and preview
- Hook scripts must be executable (`chmod +x`)
