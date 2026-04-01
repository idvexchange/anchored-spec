# Conflict Resolution

Anchored Spec often sees multiple signals about the same thing.

For example:

- a human-authored entity says one thing
- a resolver observes another
- a Markdown table says something slightly different

This document explains how to resolve those conflicts consistently.

## Precedence model

The default precedence is:

1. `declared`
2. `observed`
3. `inferred`

Human-authored declared data is the authority unless the team intentionally chooses otherwise.

## Why observed data still matters

Observed data is not there to replace the model. It is there to challenge the model.

When declared and observed data disagree, that disagreement is often exactly the signal the team needs to investigate.

## Documentation conflicts

Doc consistency uses extracted facts plus explicit annotation hints.

If two docs disagree, anchored-spec can surface the contradiction instead of forcing the conflict to stay hidden in prose.

Use suppressions only when the disagreement is intentional and well understood.

## Recommended resolution workflow

1. inspect the authored entity
2. inspect the observed or extracted source
3. decide which signal should become the lasting source of truth
4. update the model or supporting docs
5. rerun validation, drift, or trace checks

## Principle

Do not paper over conflicts by lowering everything to the weakest common denominator. Use conflicts as a maintenance mechanism to improve the model.
