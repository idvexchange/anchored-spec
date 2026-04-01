# Historical EA Fixture Example

This directory is a regression fixture for the older domain-folder EA layout.

It is kept because the repository still tests and documents current anchored-spec behavior against realistic historical data sets, but it is **not** the recommended starting point for new projects.

## Use this example for

- regression-oriented tests
- comparing old fixture layouts to the current entity-native framework
- understanding the kinds of data older repositories may still carry during migration work

## Do not use this example as a new project template

For current authoring, start with:

- `examples/backstage-manifest`
- `examples/backstage-inline`

## What is inside

The fixture models a small e-commerce architecture with systems, delivery, data, information, business, and transition records arranged in the older folder-first structure.

That makes it useful as a compatibility and migration reference, but not as the current authored contract.
