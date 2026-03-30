# Project Structure

## EA Artifact Directories
- `ea/systems/` — systems
- `ea/delivery/` — delivery
- `ea/data/` — data
- `ea/information/` — information
- `ea/business/` — business
- `ea/transitions/` — transitions

## Configuration
- `.anchored-spec/config.json` — Framework config (schema version, domains, resolvers, quality rules)

## Key Files
- `SKILL.md` — AI agent instruction set (READ THIS for workflows)
- `ea/workflow-policy.yaml` — Workflow policy rules (if exists)

## Artifact Naming
Each artifact kind has a unique prefix:
- Systems: APP, SVC, API, EVT, INT, SIF, CON
- Delivery: PLAT, DEPLOY, CLUSTER, ZONE, IDB, CLOUD, ENV, TECH
- Data: LDM, SCHEMA, STORE, LINEAGE, MDM, DQR, DPROD
- Information: IC, CE, EXCH, CLASS, RET, TERM
- Business: MISSION, CAP, VS, PROC, ORG, POL, BSVC, CTRL
- Transitions: BASELINE, TARGET, PLAN, WAVE, EXCEPT, CHG, ADR
- Requirements: REQ, SREQ, DREQ, TREQ, IREQ
