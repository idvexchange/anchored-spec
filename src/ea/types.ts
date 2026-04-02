/**
 * Anchored Spec — Shared EA types
 *
 * Remaining cross-module types that are still meaningful after the
 * entity-native cutover. BackstageEntity is the only entity model used
 * for runtime and test fixtures.
 */

export type EaDomain =
  | "systems"
  | "delivery"
  | "data"
  | "information"
  | "business"
  | "transitions";

export const EA_DOMAINS: readonly EaDomain[] = [
  "systems",
  "delivery",
  "data",
  "information",
  "business",
  "transitions",
] as const;

export type EntityStatus =
  | "draft"
  | "planned"
  | "active"
  | "shipped"
  | "deprecated"
  | "retired"
  | "deferred";

export type EntityConfidence = "declared" | "observed" | "inferred";

export interface EaAnchors {
  symbols?: string[];
  apis?: string[];
  events?: string[];
  schemas?: string[];
  infra?: string[];
  catalogRefs?: string[];
  iam?: string[];
  network?: string[];
  statuses?: string[];
  transitions?: string[];
  other?: Record<string, string[]>;
}

export interface EaRelation {
  type: string;
  target: string;
  description?: string;
  criticality?: "low" | "medium" | "high" | "critical";
  status?: "active" | "deprecated";
}

export interface EaTraceRef {
  path: string;
  role?:
    | "specification"
    | "evidence"
    | "rationale"
    | "context"
    | "implementation"
    | "test";
  label?: string;
}

export interface EaRiskAssessment {
  level: "low" | "medium" | "high" | "critical";
  description?: string;
  mitigations?: string[];
}

export interface EaComplianceMetadata {
  frameworks?: string[];
  controls?: string[];
  lastAuditedAt?: string;
  nextAuditDue?: string;
}

export interface TransitionMilestone {
  id: string;
  title: string;
  deliverables: string[];
  generates?: string[];
  criteria?: string[];
  status?: "pending" | "in-progress" | "complete" | "blocked";
  blockedReason?: string;
}

export interface TransitionRisk {
  id: string;
  description: string;
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high" | "critical";
  mitigation: string;
  owner?: string;
  status?: "open" | "mitigated" | "accepted" | "closed";
}

export interface EaBehaviorStatement {
  id: string;
  text: string;
  format: "EARS";
  trigger?: string;
  precondition?: string;
  response: string;
}
