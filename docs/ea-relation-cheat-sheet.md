# Relation Direction Cheat Sheet

> Quick-reference for which artifact kinds can use which relation types.
> **Always declare the canonical direction.** Inverses are computed automatically.

---

## Phase A — Systems & Delivery

| Canonical | Inverse | Valid Sources | Valid Targets |
|---|---|---|---|
| `realizes` | `realizedBy` | application, service, integration, business-service, decision | capability, business-service, requirement, security-requirement, data-requirement, technical-requirement, information-requirement, mission |
| `uses` | `usedBy` | application, service, integration | data-store, data-product, application, service, api-contract |
| `exposes` | `exposedBy` | application, service | api-contract, event-contract |
| `consumes` | `consumedBy` | application, service, consumer | api-contract, event-contract, system-interface |
| `dependsOn` | `dependedOnBy` | *(any)* | *(any)* |
| `deploys` | `deployedBy` | deployment | application, service |
| `runsOn` | `runs` | deployment, application, service, data-store | platform, runtime-cluster, cloud-resource |
| `boundedBy` | `bounds` | deployment, application, service, data-store, cloud-resource, environment | network-zone, identity-boundary |
| `authenticatedBy` | `authenticates` | deployment, application, service | identity-boundary |
| `deployedTo` | `hosts` | application, service | platform, environment, runtime-cluster |

## Phase 2A — Extended Systems

| Canonical | Inverse | Valid Sources | Valid Targets |
|---|---|---|---|
| `interfacesWith` | `interfacedBy` | application, service, integration | system-interface |
| `standardizes` | `standardizedBy` | technology-standard | application, service, data-store, cloud-resource, platform |
| `providedBy` | `provides` | cloud-resource | platform |

## Phase 2B — Data Layer

| Canonical | Inverse | Valid Sources | Valid Targets |
|---|---|---|---|
| `stores` | `storedIn` | data-store | logical-data-model, physical-schema, canonical-entity |
| `hostedOn` | `hostsData` | data-store | platform, cloud-resource, runtime-cluster |
| `lineageFrom` | `lineageTo` | lineage, data-product | data-store, logical-data-model, data-product |
| `implementedBy` | `implements` | logical-data-model, information-concept, change, information-exchange, canonical-entity | physical-schema, data-store, application, canonical-entity, decision, requirement, security-requirement, data-requirement, technical-requirement, information-requirement, api-contract, event-contract |

> **Note:** `lineageFrom` is the only relation that allows cycles.

## Phase 2C — Information Layer

| Canonical | Inverse | Valid Sources | Valid Targets |
|---|---|---|---|
| `classifiedAs` | `classifies` | canonical-entity, logical-data-model, data-store, information-exchange, information-concept, physical-schema, data-product | classification |
| `exchangedVia` | `exchanges` | canonical-entity, information-concept | information-exchange, api-contract, event-contract |
| `retainedUnder` | `retains` | data-store, data-product, physical-schema | retention-policy |

## Phase 2D — Business Layer

| Canonical | Inverse | Valid Sources | Valid Targets |
|---|---|---|---|
| `supports` | `supportedBy` | application, service, process, business-service, capability, mission | capability, mission, value-stream |
| `performedBy` | `performs` | capability, business-service, process | process, org-unit |
| `governedBy` | `governs` | *(any)* | policy-objective, control |
| `owns` | `ownedBy` | org-unit | *(any)* |

## Phase 2E — Transitions

| Canonical | Inverse | Valid Sources | Valid Targets |
|---|---|---|---|
| `supersedes` | `supersededBy` | *(any)* | *(any)* |
| `generates` | `generatedBy` | transition-plan, migration-wave | *(any)* |
| `mitigates` | `mitigatedBy` | exception | *(any)* |
| `targets` | `targetedBy` | transition-plan, migration-wave, baseline, target, change, decision, exception | *(any)* |

---

## Common Patterns

### "How do I link X to Y?"

| I want to say… | Use this relation | On this artifact | Targeting |
|---|---|---|---|
| App realizes a capability | `realizes` | application | capability |
| App uses a data store | `uses` | application | data-store |
| App exposes an API | `exposes` | application | api-contract |
| Consumer uses an API | `consumes` | consumer | api-contract |
| Deployment runs on K8s | `runsOn` | deployment | runtime-cluster |
| App is in a network zone | `boundedBy` | application | network-zone |
| Schema implements a model | `implementedBy` | logical-data-model | physical-schema |
| Exchange has a contract | `implementedBy` | information-exchange | api-contract |
| Entity is classified | `classifiedAs` | canonical-entity | classification |
| Mission supports capability | `supports` | mission | capability |
| Team owns an app | `owns` | org-unit | application |
| Change targets an artifact | `targets` | change | *(any)* |
| ADR targets a requirement | `targets` | decision | requirement |

### Invalid combinations (common mistakes)

| Attempted | Why it fails | Fix |
|---|---|---|
| `implements` on application | `implements` is the inverse of `implementedBy` — only canonical forms pass validation | Use `realizes` on the application targeting the capability |
| `ownedBy` on application | `ownedBy` is the inverse of `owns` — declare from the org-unit side | Create an org-unit with `owns` → application |
| `supports` on application targeting requirement | `supports` targets capability, mission, or value-stream — not requirements | Use `realizes` to link applications to requirements |
| `implementedBy` on application | application is not a valid source for `implementedBy` | Use `realizes` on the application |
