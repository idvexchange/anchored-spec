# Plugins & Hooks

Extend Anchored Spec with custom verification checks and lifecycle automation.

## Plugin System

Plugins add custom verification checks that run alongside the built-in checks during `anchored-spec verify`.

### Writing a Plugin

A plugin is a JavaScript/TypeScript module that exports a default object with a `name` and `checks` array:

```javascript
// .anchored-spec/plugins/no-orphan-tags.js
export default {
  name: "no-orphan-tags",
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
          }));
      },
    },
  ],
};
```

### Plugin Context

Each check function receives a `PluginContext` with:

```typescript
interface PluginContext {
  requirements: Requirement[];
  changes: Change[];
  decisions: Decision[];
  policy: WorkflowPolicy | null;
  projectRoot: string;
  config: AnchoredSpecConfig;
}
```

### Check Return Format

Each check returns an array of `ValidationError` objects:

```typescript
interface ValidationError {
  path: string;      // Which artifact or location
  message: string;   // Human-readable description
  severity: "error" | "warning";
  rule?: string;     // Optional rule identifier
}
```

Return an empty array `[]` if the check passes.

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
