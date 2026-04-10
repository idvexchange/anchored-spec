# Choosing a Modeling Approach

There are three valid entry paths into Anchored Spec:

- bottom-up
- top-down
- mixed

Catalog bootstrap fits the bottom-up and mixed paths. It gives you a curated manifest draft when the repository already contains enough structure to infer a useful starting model.

## Use bottom-up when

- the repository already contains useful technical truth
- the problem is extraction, not intent
- you want a fast draft

## Use top-down when

- the intended architecture is already known
- ownership and naming should be clean from the start
- governance matters early

## Use mixed when

- both existing reality and intended target design matter
- you want discovery to bootstrap but not define the final model
- you want explicit component boundaries and code locations, with repository-specific expansion left to adapters or local wrappers

## Recommended default

For most mature repositories:

1. use `catalog bootstrap` to get a curated first-pass manifest
2. normalize the results into a deliberate model
3. use selective discovery to widen coverage where needed
4. maintain new architectural intent directly
5. keep discovery and drift as validation pressure
