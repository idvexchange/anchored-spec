# Anchored Spec — Copilot Instructions

This project uses **anchored-spec**, a spec-as-source enterprise architecture framework.
Architecture is defined as machine-validated YAML/JSON artifacts, not documentation.

## Project Structure

- `.anchored-spec/config.json` — Framework configuration
- `ea/` — EA artifact directories organized by domain:
  - `ea/systems/` — systems
  - `ea/delivery/` — delivery
  - `ea/data/` — data
  - `ea/information/` — information
  - `ea/business/` — business
  - `ea/transitions/` — transitions
- `SKILL.md` — Detailed AI agent workflow instructions (READ THIS for comprehensive guidance)

## Key Commands

| Command | Purpose |
|---|---|
| `npx anchored-spec validate` | Validate all artifacts against schemas |
| `npx anchored-spec create --kind <kind> --title "Name"` | Create a new artifact |
| `npx anchored-spec discover` | Discover artifacts from code and infrastructure |
| `npx anchored-spec drift` | Detect drift between specs and reality |
| `npx anchored-spec diff --base main` | Semantic diff with compatibility checks |
| `npx anchored-spec reconcile` | Full pipeline: generate → validate → drift |
| `npx anchored-spec graph` | Generate dependency graph |
| `npx anchored-spec impact <artifact-id>` | Analyze change impact |

## Artifact Format

Every artifact has: `apiVersion: anchored-spec/ea/v1`, `kind`, `id` ({PREFIX}-{slug}),
`metadata` (name, summary, owners, tags, confidence, status), `relations[]`.

## Rules

1. Always validate after modifying artifacts: `npx anchored-spec validate`
2. Never set `confidence: "declared"` on discovered/inferred artifacts — human must promote
3. Relations reference artifact IDs, not file paths
4. Read `SKILL.md` for detailed workflow guidance before complex operations
