# Structure Steering

This example combines application code with architecture fixture material.

## Layout summary

- app code lives in the Next.js source tree
- anchored-spec configuration lives in `.anchored-spec/config.json`
- architecture fixture material lives under `ea/`
- repository-level agent guidance lives in the root `SKILL.md`

## Guidance

Changes that affect the modeled architecture should update both the code and the relevant architecture material when that relationship is meaningful.

Use current anchored-spec commands from the repo root with `--cwd examples/todo-app`.
