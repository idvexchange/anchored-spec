# Obsidian

Use this workflow when you want both a flexible note-taking environment and a governed architecture model.

The clean split is:

- Obsidian for exploration
- Anchored Spec for accepted architectural truth

## What belongs where

Put this in Obsidian:

- raw meeting notes
- workshop notes
- speculative options
- partial diagrams
- temporary research and working notes

Put this in Anchored Spec:

- systems, components, APIs, resources, groups, and domains
- accepted relationships
- primary code locations for top-level components
- ownership and lifecycle
- reviewable architecture explanations
- decisions and requirements

## Recommended workflow

1. explore freely in Obsidian
2. promote stable outcomes into entities and linked repo docs
3. use `catalog bootstrap` when the repository is still thin
4. validate and trace the promoted model
5. keep cross-links lightweight instead of duplicating finalized architecture prose

## Failure modes to avoid

- using Obsidian as the only architecture source while expecting automation to trust it
- copying finalized architecture prose into both the vault and the repo
- treating unresolved notes as approved decisions
- skipping the promotion step from notes into typed entities and governed docs
