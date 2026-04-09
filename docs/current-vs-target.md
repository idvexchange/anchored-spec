# Current vs Target

This matrix compares the current shipped capability scope of Anchored Spec with the target operating posture for teams adopting it successfully.

| Capability                           | Current implementation in this repo       | Target operating posture for adopters                              | Evidence                                                                            |
| ------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Entity-native architecture model     | Shipped and central to the framework      | Entities are the normal source of architecture truth               | `src/ea/backstage/`, `src/ea/validate.ts`                                           |
| Dual storage modes                   | Shipped for manifest and inline authoring | Teams choose one primary mode and keep it stable                   | `src/cli/commands/ea-init.ts`, `src/ea/loader.ts`                                   |
| Validation and schema enforcement    | Shipped                                   | Validation runs locally and in CI                                  | `src/cli/commands/ea-validate.ts`                                                   |
| Catalog synthesis from repository evidence | Shipped                                   | Used first for curated manifest bootstrap in mature repositories   | `src/ea/catalog.ts`, `src/cli/commands/ea-catalog.ts`                               |
| Discovery from source material       | Shipped across eight source families      | Used selectively to widen or pressure-test the model               | `src/ea/resolvers/`, `src/cli/commands/ea-discover.ts`                              |
| Drift detection                      | Shipped                                   | Used where declared-vs-observed consistency matters                | `src/ea/drift.ts`, `src/cli/commands/ea-drift.ts`                                   |
| Derived output generation            | Shipped for OpenAPI and JSON Schema       | Used only where downstream artifacts add real value                | `src/ea/generators/`                                                                |
| Reviewer-facing reports and diagrams | Shipped                                   | Standard review outputs are easy to produce in markdown            | `src/ea/report.ts`, `src/ea/diagrams/`                                              |
| Change-aware impact and constraints  | Shipped                                   | Used to surface blast radius, then hand off to repo-local checks   | `src/ea/impact.ts`, `src/ea/constraints.ts`                                         |
| Command-plan suggestions             | Shipped as optional helper                | Repositories compile framework suggestions into local command plans | `src/ea/command-suggestions.ts`, `src/cli/commands/ea-impact.ts`                    |
| Lifecycle and policy governance      | Shipped                                   | Teams use policy intentionally, not ceremonially                   | `src/ea/policy.ts`, `src/ea/version-policy.ts`, `src/cli/commands/ea-transition.ts` |
| Evidence and verification            | Shipped                                   | Evidence improves trust, but repos still own execution ergonomics  | `src/ea/evidence.ts`, `src/cli/commands/ea-evidence.ts`, `src/ea/verify.ts`         |
| AI context assembly                  | Shipped                                   | Agents consume the same graph humans trust                         | `src/cli/commands/ea-context.ts`, `SKILL.md`, `llms-full.txt`                       |

## Interpretation

The current codebase already implements the framework's major capabilities. The target state is therefore not "turn Anchored Spec into the whole repo harness." The target state is "keep the framework sparse, queryable, and reusable, while letting repositories own last-mile execution."

In practice that means:

- small authored models before massive discovery runs
- catalog bootstrap before broad discovery when adopting in manifest mode
- CLI-first lookup before raw manifest reading in day-to-day work
- validation and traceability in normal review
- drift and semantic diff where architectural trust matters
- impact suggestions feeding repo-native command plans instead of replacing them
- AI usage grounded in the same model as humans
