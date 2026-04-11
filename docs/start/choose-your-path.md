# Choose Your Path

There are three valid entry paths into Anchored Spec:

- top-down
- bottom-up
- mixed

## Default recommendation

For most mature repositories:

1. run `npx anchored-spec init --mode manifest`
2. inspect descriptor shapes with `npx anchored-spec create --list`
3. use `npx anchored-spec catalog bootstrap --dry-run`
4. curate the result into a deliberate sparse model
5. use selective discovery only where it adds signal

If you want a neutral starter model instead of an empty manifest:

```bash
npx anchored-spec init --mode manifest --with-examples
```

That example scaffold is intentionally sparse and generic. It demonstrates one owner, one domain, one system, one component, one API, and linked docs. It does not try to guess your repository-local harness.

## Use top-down when

- the intended architecture is already known
- ownership and naming should be clean from the start
- governance matters early

Typical sequence:

```bash
npx anchored-spec init --mode manifest
npx anchored-spec create --kind Domain --title "Commerce" --owner group:default/platform-team
npx anchored-spec create --kind System --title "Checkout Platform" --owner group:default/platform-team
npx anchored-spec create --kind Component --type service --title "Orders Service" --owner group:default/platform-team
npx anchored-spec validate
```

## Use bottom-up when

- the repository already contains useful technical truth
- the problem is extraction, not intent
- you want a fast first-pass model

Prefer `catalog bootstrap` first, then selective discovery.

## Use mixed when

- both existing reality and intended target design matter
- you want discovery to bootstrap but not define the final model
- you want explicit top-level boundaries with repository-specific expansion left to adapters or wrappers

## Operating rules

- keep `metadata.name` stable once referenced elsewhere
- prefer one primary `anchored-spec.dev/code-location` per top-level component
- treat discovery output as draft until reviewed
- let repositories own exact command execution and focused verification choices

## Read next

- [../workflows/model-the-repo.md](../workflows/model-the-repo.md)
- [../workflows/obsidian.md](../workflows/obsidian.md)
- [../workflows/review-and-analysis.md](../workflows/review-and-analysis.md)
