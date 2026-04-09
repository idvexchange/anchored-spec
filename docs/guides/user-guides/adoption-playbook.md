# Adoption Playbook

Use Anchored Spec to improve architecture clarity and review quality, not to create a second project-management system or a full repository workflow engine.

## Start small

Begin with:

- one important component
- one API or contract
- one supporting dependency or resource
- one credible architecture explanation
- one thin repo-native wrapper script if the team needs task scoping or filtered verification

## Prefer explicit modeling

Manifest mode is the clearest adoption path for most teams. Inline mode remains useful for repositories that are already docs-first.

If the team already uses Obsidian or another notebook workflow, keep that as the exploration layer and promote stable outcomes into Anchored Spec as the governed layer. See [obsidian-and-anchored-spec.md](obsidian-and-anchored-spec.md).

## Add discovery selectively

In manifest-mode repositories, start with `catalog bootstrap` when you need a credible first-pass `catalog-info.yaml` from existing repo evidence.

Use discovery after that where the repository already has trustworthy technical truth and you want to widen or pressure-test the model.

## Add governance gradually

The first useful controls are usually:

- validation
- clear ownership
- semantic diff for sensitive changes
- drift where consistency matters
- impact suggestions that feed repo-native checks instead of replacing them

## Keep the split clean

Anchored Spec should usually own:

- sparse architecture truth
- CLI-first lookup over that truth
- validate, trace, drift, impact, and context primitives

The repository should usually own:

- exact filtered command plans
- focused versus broader verification choices
- mutating follow-up actions such as generators or migrations
- human-facing workflow ergonomics

## Success criteria

Adoption is working when architecture review becomes easier inside the repository, while the repository still controls the last mile of practical execution.
