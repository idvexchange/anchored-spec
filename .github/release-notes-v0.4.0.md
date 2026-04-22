## Anchored Spec v0.4.0 — first npm release 🎉

This is the first version of `anchored-spec` published to npm. Install with:

```bash
pnpm add -D anchored-spec
# or
npm install --save-dev anchored-spec
```

> Backstage-aligned architecture control plane for repositories that want a real architecture model in version control.

### Highlights

- 🧩 **Repository-evidence adapter framework** — `impact --with-commands` enriches architecture impact with adapter-derived repository targets and rendered suggestions through `repositoryEvidence.adapters`. Includes a built-in `node-workspaces` adapter and custom module loading.
- 📦 **Structured impact output** — `commandPlan` now exposes `architectureImpact`, `repositoryImpact`, and `suggestions` so repositories can compose their own command plans on top of architectural truth without treating Anchored Spec as the orchestrator. Legacy fields remain for compatibility.
- 🔗 **`anchored-spec.dev/code-location` is the primary code link** — Component → code linkage is now a first-class architectural annotation, with file/symbol/test evidence as supporting context.
- 🧭 **ADR-007** formalises the architecture control plane / repo harness boundary.
- 📘 **Field-feedback guide** documents what worked, what didn't, and where the framework should stay generic.

### Documentation overhaul

- New project **logo** and a clear visual identity.
- New **"Is This For You?"** README section with a candid adoption decision rule.
- README restructured: TOC, status line, adoption pattern, Mermaid core-model slice, AI-agent handoff example, footer cross-links.
- `CONTRIBUTING.md` is now a real landing page for contributors; user-facing content stays in the README.
- AI-facing docs (`llms.txt`, `llms-full.txt`, `SKILL.md`, `AGENTS.md`) all align around the same control-plane model.

### Versioning

Repository tags have been realigned with the changelog. The canonical history is now `v0.1.0` → `v0.2.0` → `v0.3.0` → `v0.4.0`. Historical tags `v1.0.0` and `v1.1.0-backstage-phase-a` have been removed.

### Try it

```bash
mkdir my-repo && cd my-repo && npm init -y
npm install --save-dev anchored-spec
npx anchored-spec init --mode manifest --with-examples
npx anchored-spec validate
npx anchored-spec trace --summary
```

### Links

- 📦 npm: <https://www.npmjs.com/package/anchored-spec>
- 📖 Documentation portal: [`docs/README.md`](https://github.com/idvexchange/anchored-spec/blob/main/docs/README.md)
- 🧠 Agent guide: [`docs/workflows/agent-guide.md`](https://github.com/idvexchange/anchored-spec/blob/main/docs/workflows/agent-guide.md)
- 📋 Full changelog: [`CHANGELOG.md`](https://github.com/idvexchange/anchored-spec/blob/main/CHANGELOG.md)

Feedback, issues, and "this is dumb because…" reports very welcome.
