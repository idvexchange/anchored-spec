# Adoption Playbook

Use Anchored Spec to improve architecture clarity and review quality, not to create a second project-management system.

## Start small

Begin with:

- one important component
- one API or contract
- one supporting dependency or resource
- one credible architecture explanation

## Prefer explicit modeling

Manifest mode is the clearest adoption path for most teams. Inline mode remains useful for repositories that are already docs-first.

## Add discovery selectively

Use discovery where the repository already has trustworthy technical truth.

## Add governance gradually

The first useful controls are usually:

- validation
- clear ownership
- semantic diff for sensitive changes
- drift where consistency matters

## Success criteria

Adoption is working when architecture review becomes easier inside the repository rather than moving somewhere else.
