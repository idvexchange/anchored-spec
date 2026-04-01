# Adoption Playbook

This guide is for teams adopting anchored-spec in an existing repository.

## Start small

Do not try to model everything at once.

A good first slice is:

- one important component
- one API it provides or depends on
- one key resource it uses
- one linked architecture document

That is enough to validate the toolchain, the storage mode, and the trace workflow.

## Pick a storage mode intentionally

Choose the one that matches how the team already works.

- choose **manifest mode** if you want one explicit architecture catalog file
- choose **inline mode** if you want architecture docs and descriptors to be the same artifact

## Bootstrap with discovery

Configure a few resolvers for the sources you already trust.

Examples:

- OpenAPI for service contracts
- Tree-sitter for code-aware discovery
- Markdown for doc-driven repos
- Terraform or Kubernetes for infrastructure-heavy repos

Use `discover --dry-run` first so the team can review what the tool would create.

## Promote deliberately

Discovered entities start as candidates, not final truth.

A healthy adoption workflow is:

1. discover
2. review
3. rename or reshape where needed
4. mark the important entities as declared
5. add traceability and ownership

## Add lightweight governance early

You do not need a heavy approval process on day one, but you do want a few rules:

- active entities need owners
- important docs should be linked
- PRs that change core contracts should run semantic diff
- drift should be visible in CI before it becomes a release issue

## Add deeper workflows later

Once the basic model is useful, add:

- report generation
- evidence workflows
- transition planning
- reconcile in CI
- AI context assembly for reviewers and agents

## What success looks like

An adopted repository usually shows these signs:

- engineers update the model in the same PR as code
- docs and entities reference each other
- `drift` catches real issues rather than being ignored noise
- reviewers use `diff --compat --policy` for change review
- the model covers the most important runtime surfaces first, not every possible concept
