# Obsidian and Anchored Spec

Use this workflow when you want both a flexible note-taking environment and a governed architecture model.

The clean split is:

- Obsidian for exploration
- Anchored Spec for accepted architectural truth

## Why use both

Obsidian is good at:

- fast note capture
- design exploration
- meeting notes
- research and reference material
- unresolved questions and early thinking

Anchored Spec is good at:

- typed architecture entities
- stable relationships and ownership
- validator-safe repository truth
- semantic review in pull requests
- drift, reporting, impact analysis, and AI-ready context assembly

Using both lets a team think loosely without giving up a canonical model.

## Operating model

Treat Obsidian as the working layer and Anchored Spec as the publication layer.

That means:

- rough notes can stay incomplete in Obsidian
- accepted decisions should become ADRs in `docs/adr/`
- accepted requirements should become requirement records in `docs/req/`
- accepted architecture structure should become entities in `catalog-info.yaml`
- enduring architecture explanations should live under `docs/`

Do not make the Obsidian vault the source of truth for ownership, interfaces, or system structure if you expect CI, agents, or reviewers to rely on it.

## Recommended workflow

## 1. Explore in Obsidian

Use Obsidian for:

- brainstorming
- workshop notes
- architecture options
- tradeoff analysis
- temporary sketches

At this stage, speed matters more than structure.

## 2. Promote stable outcomes into the repo

When a note becomes durable:

- create or update entities with `npx anchored-spec create`
- write or refine linked architecture docs under `docs/`
- record decisions under `docs/adr/`
- record requirements under `docs/req/`
- add a primary `anchored-spec.dev/code-location` when a component has a clear source area

If the repository is still thin, start with:

```bash
npx anchored-spec catalog bootstrap --dry-run
npx anchored-spec catalog bootstrap --write catalog-info.yaml
```

## 3. Validate the promoted model

Once the repo contains the accepted architecture:

```bash
npx anchored-spec validate
npx anchored-spec trace --summary
npx anchored-spec diff --base main --compat --policy
```

This is the point where the architecture becomes reviewable by humans and consumable by automation.

## 4. Keep cross-links lightweight

Use lightweight links between the two systems:

- Obsidian notes should link to canonical repo docs or entity refs
- repo ADRs and docs can mention the originating workshop or note title when helpful

Avoid copying the same stable architecture content into both places. Duplication will drift.

## What belongs where

Put this in Obsidian:

- raw meeting notes
- interview notes
- exploration branches of thought
- speculative solution options
- partial diagrams
- personal or team working notes

Put this in Anchored Spec:

- systems, components, APIs, resources, domains, and groups
- accepted relationships
- primary code locations for top-level components
- ownership and lifecycle
- reviewable architecture explanations
- architecture decisions
- formalized requirements and controls

## Example split

In Obsidian:

- "Should the CLI and runtime split into separate packages?"
- notes from a design review
- a page comparing catalog synthesis approaches
- an unreviewed Mermaid sketch

In Anchored Spec:

- [docs/04-component/anchored-spec-cli.md](../../04-component/anchored-spec-cli.md)
- [docs/04-component/anchored-spec-library.md](../../04-component/anchored-spec-library.md)
- [docs/adr/ADR-006-catalog-bootstrap-and-synthesis.md](../../adr/ADR-006-catalog-bootstrap-and-synthesis.md)
- `catalog-info.yaml`

## Failure modes to avoid

- using Obsidian as the only architecture source while expecting automation to trust it
- copying finalized architecture prose into both the vault and the repo
- treating unresolved notes as approved decisions
- skipping the promotion step from notes into typed entities and governed docs

## Best fit

- teams that already think in Obsidian but need stronger architecture governance
- repos that need AI-readable and CI-checkable architecture metadata
- adoption paths where notes already exist and should inform, but not replace, the canonical model

## Read next

- [getting-started.md](getting-started.md)
- [catalog-bootstrap.md](catalog-bootstrap.md)
- [adoption-playbook.md](adoption-playbook.md)
