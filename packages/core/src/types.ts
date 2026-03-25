/**
 * Anchored Spec — Core Types
 *
 * TypeScript types matching the JSON schemas.
 * These are the runtime types used by validation, policy, and generator engines.
 */

// ─── Requirement ───────────────────────────────────────────────────────────────

export interface BehaviorStatement {
  id: string;
  text: string;
  format: "EARS";
  trigger?: string;
  precondition?: string;
  response: string;
}

export interface TraceRef {
  path: string;
  role:
    | "normative"
    | "architecture"
    | "decision"
    | "api"
    | "implementation"
    | "reference";
}

export interface SemanticRefs {
  interfaces?: string[];
  routes?: string[];
  errorCodes?: string[];
  symbols?: string[];
  schemas?: string[];
}

export interface TestRef {
  path: string;
  kind: "unit" | "integration" | "e2e" | "contract" | "manual";
  required?: boolean;
}

export interface Verification {
  requiredTestKinds?: Array<
    "unit" | "integration" | "e2e" | "contract" | "manual"
  >;
  coverageStatus?: "none" | "partial" | "full";
  testFiles?: string[];
  testRefs?: TestRef[];
}

export interface Implementation {
  activeChanges?: string[];
  shippedBy?: string | null;
  deprecatedBy?: string | null;
}

export type RequirementStatus =
  | "draft"
  | "planned"
  | "active"
  | "shipped"
  | "deferred"
  | "deprecated";

export interface Requirement {
  id: string;
  title: string;
  summary: string;
  description?: string;
  priority: "must" | "should" | "could" | "wont";
  status: RequirementStatus;
  statusReason?: string;
  behaviorStatements: BehaviorStatement[];
  traceRefs?: TraceRef[];
  semanticRefs?: SemanticRefs;
  verification?: Verification;
  implementation?: Implementation;
  owners: string[];
  tags?: string[];
  supersedes?: string | null;
  supersededBy?: string | null;
  docSource?: "canonical-json";
}

// ─── Change Record ─────────────────────────────────────────────────────────────

export type ChangeType = "feature" | "fix" | "refactor" | "chore";
export type ChangePhase =
  | "design"
  | "planned"
  | "implementation"
  | "verification"
  | "done"
  | "archived";
export type ChangeStatus = "active" | "blocked" | "complete" | "cancelled";

export interface ChangeScope {
  include: string[];
  exclude?: string[];
}

export interface BugfixSpec {
  currentBehavior: string;
  expectedBehavior: string;
  rootCauseHypothesis?: string;
  regressionRisk?: string;
}

export interface ChangeTimestamps {
  createdAt: string;
  updatedAt?: string;
}

export interface Change {
  id: string;
  title: string;
  slug: string;
  type: ChangeType;
  workflowVariant?: string;
  phase: ChangePhase;
  status: ChangeStatus;
  scope: ChangeScope;
  requirements?: string[];
  branch: string | null;
  timestamps: ChangeTimestamps;
  owners: string[];
  designDoc?: string | null;
  implementationPlan?: string | null;
  bugfixSpec?: BugfixSpec;
  tags?: string[];
  docSource?: "canonical-json";
}

// ─── Decision (ADR) ────────────────────────────────────────────────────────────

export interface Alternative {
  name: string;
  verdict: "chosen" | "rejected" | "deferred";
  reason?: string;
}

export interface Decision {
  id: string;
  title: string;
  slug: string;
  status: "accepted" | "superseded" | "deprecated";
  domain?: string;
  decision: string;
  context: string;
  rationale: string;
  alternatives: Alternative[];
  implications?: string;
  relatedRequirements: string[];
  supersedes?: string | null;
  supersededBy?: string | null;
  docSource?: "canonical-json";
}

// ─── Workflow Policy ───────────────────────────────────────────────────────────

export interface WorkflowVariant {
  id: string;
  name: string;
  defaultTypes: ChangeType[];
  artifacts: string[];
  skipSkillSequence?: boolean;
  verificationFocus?: string[];
}

export interface ChangeRequiredRule {
  id: string;
  description?: string;
  include: string[];
  exclude?: string[];
  requiredDocs?: string[];
  requiredDriftChecks?: string[];
  commands?: string[];
}

export interface ChoreEligibility {
  conditions?: string[];
  escalationRule?: string;
}

export interface LifecycleRules {
  plannedToActiveRequiresChange?: boolean;
  activeToShippedRequiresCoverage?: boolean;
  deprecatedRequiresReason?: boolean;
}

export interface WorkflowPolicy {
  workflowVariants: WorkflowVariant[];
  changeRequiredRules: ChangeRequiredRule[];
  trivialExemptions: string[];
  choreEligibility?: ChoreEligibility;
  lifecycleRules: LifecycleRules;
}

// ─── Validation Result ─────────────────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
  rule?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ─── Policy Evaluation ─────────────────────────────────────────────────────────

export interface PolicyMatchResult {
  path: string;
  matchedRules: ChangeRequiredRule[];
  isTrivial: boolean;
  requiresChange: boolean;
}

export interface PolicyEvaluationResult {
  paths: PolicyMatchResult[];
  summary: {
    totalPaths: number;
    trivialPaths: number;
    governedPaths: number;
    ungoverned: number;
    matchedRules: string[];
  };
}

// ─── Spec Root Configuration ───────────────────────────────────────────────────

export interface AnchoredSpecConfig {
  specRoot: string;
  schemasDir?: string;
  requirementsDir?: string;
  changesDir?: string;
  decisionsDir?: string;
  workflowPolicyPath?: string;
  generatedDir?: string;
}
