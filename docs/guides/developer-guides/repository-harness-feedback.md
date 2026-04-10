# Repository Harness Feedback

Field feedback from integrating Anchored Spec into a large `pnpm`/`turbo` monorepo with multiple runtime apps, shared packages, architecture docs, local-first AI agent workflows, and a deliberate bias toward low-bloat automation.

Some examples below are intentionally monorepo- and Node-specific because that was the evaluated environment. The framework conclusions are broader: keep the architecture model generic and let repository-local harnesses or adapters handle environment-specific execution details.

This document is intentionally practical. It focuses on what helped, what created friction, what the framework should simplify about its own intent, and which framework features would have produced the most value without erasing the repository-specific layer that still needs to exist.

## Executive Summary

Anchored Spec is most effective when it is used as:

- a sparse architecture control plane
- a stable CLI query layer
- a typed source of truth for architecture boundaries
- a pressure-test layer for declared vs observed architecture

Anchored Spec is less effective when it is pushed toward:

- being the full task-routing engine
- being the full verification engine
- being the source of every local workflow decision
- being the place where repositories encode all practical delivery semantics

In the evaluated repository, Anchored Spec was a clear net positive because the team kept the framework sparse and wrapped it with thin repo-native scripts. The best result came from combining:

- Anchored Spec for stable architecture facts and query primitives
- repository scripts for task scoping, downstream check selection, focused verification, and local baseline comparison
- the Anchored Spec CLI as the default human and agent interface to that architecture model

The framework should lean into that positioning rather than implying it should be the whole system.

The fairest long-term split is:

- framework owns generic architecture, query, and reusable helper primitives
- repositories own local verification policy, workflow ergonomics, and environment-specific command selection

## The Practical Positioning That Works

For a repository like ours, Anchored Spec works best when the intent is simplified to this:

1. Model the repository at the architectural boundary level, not the folder level.
2. Give humans and agents a stable query surface over that model.
3. Validate, trace, and drift-check the declared architecture.
4. Let repositories compose thin local harnesses around that stable core.

That is the strongest product story.

It is materially better than trying to make Anchored Spec itself responsible for:

- fine-grained code ownership
- test discovery
- change verification sequencing
- baseline-aware regression tracking
- local workflow orchestration

Those concerns are real, but they are highly repo-specific. A framework can expose useful primitives, but repositories still need a local harness layer.

## The Split That Felt Right

The most accurate boundary after working through the integration is:

### Best owned by Anchored Spec

- sparse architecture modeling
- CLI-first lookup over that model
- direct and reverse top-level relationship truth
- validate, trace, verify, and drift primitives
- reusable discovery and semantic helper primitives
- optional impact-to-suggestion helpers
- examples and guidance for thin harness composition

### Best owned by the repository

- exact `readFirst` doc choices for local workflows
- exact `pnpm --filter ...` command plans
- local decisions about focused vs broader verification
- follow-up actions such as migration generation
- baseline comparison and regression attribution
- human-facing developer workflow ergonomics

This split preserves the framework’s generic value while leaving the last mile where it belongs.

## What Worked Well

### 1. Sparse architecture modeling

The biggest success was keeping the catalog at the workspace boundary:

- `apps/*`
- `packages/*`
- externally meaningful APIs
- major systems, owners, and architectural concepts

This gave us:

- fast mental routing
- useful change impact
- low maintenance cost
- low review noise

Anchored Spec helped because it did not require over-modeling to be useful.

### 2. CLI-first architecture lookup

The CLI surface was valuable as a fresh-context interface:

- `search`
- `context`
- `trace`
- `validate`
- `verify`
- `drift`

This was substantially better than requiring agents to read raw catalog YAML or large docs trees directly. For AI-assisted workflows, that matters a lot.

After integrating the framework more deeply, this point became even stronger: the CLI is not just a convenience layer. For day-to-day use it is the most useful product surface Anchored Spec has.

The highest-value exploration pattern was:

1. route to a top-level component
2. run `trace`
3. inspect direct dependencies and direct dependents
4. let the repository harness decide concrete local verification from there

That pattern is clearer, lower-noise, and more maintainable than asking humans or agents to read raw `catalog-info.yaml` directly.

### 3. Declared-before-observed discipline

The framework’s declared-first stance is correct.

It prevented the repository from drifting into a discovery-first model where observed code structure silently became the architecture model. In practice, this kept architectural review intentional and preserved human trust in the graph.

### 4. Drift and verification as cheap default checks

`drift` and `verify` fit well into focused repository workflows because they are:

- stable
- fast enough
- low-noise when the catalog is sparse
- meaningful for both humans and agents

Keeping `spec:drift` in the default focused verification path was consistently worthwhile.

### 5. Backstage-aligned envelope

The Backstage-aligned entity model was a good constraint. It kept the architecture layer interoperable and understandable while still allowing custom kinds where needed.

## What Did Not Work Well

### 1. Framework intent is too easy to over-read

The framework exposes enough surface area that teams can easily assume it should become:

- a full routing engine
- a full verification engine
- a full AI orchestration substrate

That is where bloat begins.

The framework should say more plainly:

- it is an architecture control plane
- it is not the full repo harness
- repositories should expect to add thin local scripts for task scoping and verification

### 2. Change-impact semantics stop too early for practical monorepo verification

Anchored Spec can express that a change impacts downstream areas, but in practice that often stops at:

- `alsoUpdate`
- leaf AGENT references
- human guidance

That is not enough by itself.

In a real monorepo, the most important missing step was converting downstream blast radius into executable checks. For example:

- a domain interface change should turn into downstream `typecheck` commands
- a database schema change should turn into downstream runtime `typecheck` commands
- utility packages with explicit mocks or adapters should become concrete verification targets

Without that, impact modeling remains informative but not operational.

At the same time, the framework does not need to own the final command list. After working through a fuller integration, the cleaner ask is narrower:

- framework should expose impacted entities and top-level relationships cleanly
- repositories should compile that into concrete command plans locally

The valuable framework contribution would be helper primitives and examples that make this translation easier without turning Anchored Spec into a generic command planner.

### 3. Tree-sitter is useful only in a narrow lane

Tree-sitter helped only when constrained to high-signal enrichment:

- route declarations
- API structure hints
- selective symbol-adjacent discovery

It was not a good primary routing control plane.

When used too broadly, the value/bloat ratio dropped quickly because:

- it surfaced too many low-level code shapes
- it increased apparent precision without improving task-level decisions
- it tempted the system toward discovery-first behavior

The framework should position tree-sitter as optional enrichment, not as the default backbone for repository routing.

### 4. Route-level doc loading can become noisy

Broad route-level `readFirst` lists are useful, but they need conditional narrowing.

A direct domain interface change should not automatically load:

- claim normalizer docs
- state machine docs
- other domain sub-areas

unless the path shape indicates those surfaces are actually relevant.

This is a small issue compared to missing verification, but it affects fresh-context efficiency.

This is an area where the framework could help with generic predicates or refinement hooks, but it is less central than CLI/query ergonomics and graph quality. Repositories still choose the actual docs.

### 5. Verification lacks repo-native mutation boundaries

The framework has no first-class way to distinguish:

- verification commands
- broader optional checks
- mutating follow-up actions

That distinction matters in practice.

For example, a database schema change often needs:

- focused verification
- broader downstream checks
- a mutating follow-up like generating a migration

Those are not the same class of action and should not be mixed together.

This does not mean the framework should become the full workflow orchestrator. It means its abstractions should be able to represent the difference cleanly so repositories do not have to invent ad hoc structure every time.

### 6. Structural graph truth and repo-local hints can blur together

One of the easiest mistakes in a repository harness is duplicating top-level component relationships in local policy or hand-authored hints.

That creates three problems:

- graph truth exists in two places
- local policy gets noisier than it needs to be
- teams stop trusting which layer is authoritative

The cleaner split is:

- Anchored Spec owns top-level structural relationships
- repositories derive lookup and graph exploration from that
- repo-local hints are reserved for non-structural, operational, or easy-to-miss adjacency

Examples of repo-local hints that still make sense:

- infra load balancer or health-check wiring
- migration-file expectations
- local env wrapper coupling
- explicit test-fixture or mock blast radius

Examples that should usually stay in Anchored Spec instead:

- app-to-package top-level dependencies
- shared-package consumers
- major adapter-to-domain relationships

## Findings From Real Task Evaluation

The most useful evaluation was not theoretical. It came from running the harness across five realistic task shapes:

- narrow API symbol change
- UI component change
- shared database package change
- infrastructure stack change
- shared domain interface change

The pattern was clear:

- Anchored Spec was excellent for top-level routing.
- Repository-native scripts were required for practical verification.
- The most serious misses were not about architecture modeling.
- The most serious misses were about converting blast radius into executable checks.

The biggest failure mode was shared-package regression invisibility:

- domain changes breaking downstream apps
- domain changes breaking shared test utilities
- database changes affecting runtime consumers

That is the category where a framework could help more without becoming too heavy.

## What The Framework Should Simplify About Its Intent

The framework should make the following position much more explicit in docs and examples:

### Anchored Spec should be:

- sparse
- architecture-first
- local-first
- reviewable
- queryable by humans and agents
- stable under partial adoption

### Anchored Spec should not try to be:

- a full AI task harness
- a full verification orchestrator
- a codebase-wide dependency graph product
- a repo-specific workflow DSL
- a mandatory discovery-first system

That clarification would reduce misuse more than many new features would.

## Current Features To Improve

### 1. Change impact should optionally compile into command suggestions

Current state:

- impact rules can express downstream relationships
- repositories must manually convert that into command expansion

Desired improvement:

- an optional framework primitive that exposes impacted entities and workspaces clearly enough for repositories to compile suggested verification commands locally
- repositories can still override or narrow this locally

This should stay suggestion-oriented, not mandatory or magical.

### 2. Read-first routing should support conditional narrowing

Current state:

- route-level docs are static lists

Desired improvement:

- optional route predicates or path-class refinement
- example: interface-only domain paths load `interfaces.md` and `domain-model.md`, but not state-machine or claim-normalizer docs by default

This would materially improve fresh-context efficiency.

### 3. Command classes should be a first-class concept

Current state:

- commands are usually just commands

Desired improvement:

- `commands`: focused default verification
- `broaderCommands`: optional wider checks
- `actionCommands`: intentional follow-up actions that may mutate the repo

This separation turned out to be extremely useful in practice.

Even here, the framework should probably provide the structure more than the orchestration. Repositories still need to decide which exact commands belong in each class.

### 4. Framework examples should show thin local harness composition

Current state:

- documentation can be read as though the framework itself should solve most workflow needs

Desired improvement:

- examples that show a repository using Anchored Spec as the control plane under a small `task-start` or `agent-start` wrapper
- examples that explicitly keep catalog modeling sparse
- examples that show CLI-first usage rather than raw YAML reading
- examples that show `trace` as the normal way to inspect direct dependencies and direct dependents once an entity is known

This would teach the highest-value adoption pattern directly.

### 5. Verification should acknowledge baseline comparison as a local concern

Current state:

- framework verification is broad and useful
- local regression attribution still requires repository logic

Desired improvement:

- docs should acknowledge that repositories may layer local baseline comparison on top of Anchored Spec verification
- if a framework feature is added here, it should be optional, local, and artifact-based

It should not become a heavy stateful history system.

## Recommended New Features

These are the features we most wished Anchored Spec had natively or semi-natively.

The key qualifier is that these should help repositories compose a better local harness. They should not try to replace that harness entirely.

### 1. Impact-to-commands helper

A helper primitive that can take:

- impacted entities or workspaces
- workspace scripts
- route context

and return a suggested command plan split into:

- focused type-level checks
- broader test/lint checks

This would save real custom logic while still keeping the framework generic, but the framework should stop short of becoming the canonical owner of concrete command plans.

### 2. Conditional read-first rules

A way to express:

- route-level defaults
- path-based refinement
- optional secondary docs

This matters because broad static doc lists are one of the easiest ways to waste AI context.

### 3. First-class action command support

A route should be able to say:

- verify this
- optionally verify that
- then perform this follow-up action

Example:

- database schema change
- verify downstream typechecks
- then suggest `db:generate`

This is meaningfully different from verification and should be modeled separately.

### 4. Blast-radius helpers for shared packages

The framework should make it easier to say:

- if package `X` changes, workspace `Y` and `Z` are likely semantic consumers
- turn that into leaf-agent hints and verification suggestions

This is especially valuable for:

- domain packages
- database packages
- shared adapter or utility packages
- test utility packages with explicit mocks

This is especially valuable when it helps repositories surface reverse relationships cleanly. In practice, "who depends on this shared package?" was often more useful than "what does this package depend on?"

### 5. Better framework guidance for AI agent usage

This is partly documentation, partly product positioning.

What would help:

- a clearly documented “AI-friendly adoption shape”
- examples of sparse catalogs
- examples of CLI-first lookup
- examples of entity-first exploration via `trace`
- examples of local task briefs that consume Anchored Spec outputs
- explicit guidance against over-modeling and over-discovery

### 6. Safer migration-awareness primitives

A schema-aware repository often needs to know:

- schema changed
- migration file absent

If the framework offers anything here, it should be:

- opt-in
- non-mutating
- repo-local
- warning-oriented

The framework should not generate migrations automatically, but it could help repositories flag the need for one.

## Features We Would Avoid Adding

These are the areas where the likely bloat exceeds the value.

### 1. Primary-routing tree-sitter expansion

Do not make tree-sitter the primary architecture or task-routing engine.

Use it only for optional enrichment where the signal is strong and bounded.

### 2. Deep code dependency graphing as a default mode

This would be expensive, noisy, and repo-specific. Most repositories only need a thin subset of this information.

### 3. Heavy baseline history

Do not build a stateful verification history system into the framework unless there is overwhelming evidence that repositories cannot solve it locally.

### 4. Prose-update automation

Frameworks should not attempt to automate architecture prose maintenance beyond links, trace refs, and consistency helpers.

### 5. Over-modeling below architectural boundaries

Anchored Spec becomes worse when teams feel encouraged to model every folder, helper, or low-level internal surface.

## The Best Adoption Shape For Repositories Like Ours

If a team has:

- a `pnpm` or `turbo` monorepo
- multiple apps and shared packages
- strong docs
- AI-assisted engineering
- a desire to avoid process bloat

the best Anchored Spec adoption shape is:

1. model only architectural boundaries
2. keep the catalog sparse
3. use CLI queries as the default lookup layer
4. treat `trace` as the normal interface for entity relationships instead of reading raw manifest YAML
5. build a tiny repository harness around task scoping and verification
6. keep discovery optional and pressure-test oriented
7. keep mutating actions separate from verification
8. treat the framework as control plane, not whole workflow

That pattern worked very well.

## Suggested Roadmap Priorities

### Now

- sharpen the framework’s own positioning
- add examples of thin local harness composition
- add command-tier concepts to guidance and examples

### Next

- add optional impact-to-command helper primitives
- add conditional read-first rules or route refinement
- add better support for shared-package reverse-relationship expansion

### Later, only if repeated demand appears

- optional local baseline helpers
- lightweight migration-awareness helpers
- richer AI-facing context bundle support

## Bottom Line

Anchored Spec helped because it stayed mostly sparse, typed, queryable, and local.

The best outcomes came when the framework handled architecture truth and stable CLI queries, while the repository handled practical task scoping and verification through thin scripts.

That should be the framework’s explicit north star:

- **Anchored Spec is the architecture control plane.**
- **The CLI should be the default interface to that control plane for humans and agents.**
- **Repositories still own the last mile of task execution.**
- **The framework should provide better reusable primitives for that last mile without trying to absorb it.**

That is the sweet spot where the framework is most valuable and least bloated.
