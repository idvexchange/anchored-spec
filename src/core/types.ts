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
  label?: string;
}

export interface SemanticRefs {
  interfaces?: string[];
  routes?: string[];
  errorCodes?: string[];
  symbols?: string[];
  schemas?: string[];
  other?: Record<string, string[]>;
}

export interface TestRef {
  path: string;
  kind: "unit" | "integration" | "e2e" | "contract" | "manual";
  required?: boolean;
  notes?: string;
}

export interface Verification {
  requiredTestKinds?: Array<
    "unit" | "integration" | "e2e" | "contract" | "manual"
  >;
  coverageStatus?: "none" | "partial" | "full";
  testFiles?: string[];
  testRefs?: TestRef[];
  executionPolicy?: {
    requiresEvidence?: boolean;
    requiredKinds?: string[];
  };
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

export type RequirementCategory = "functional" | "non-functional" | "policy";

export interface Requirement {
  id: string;
  title: string;
  summary: string;
  description?: string;
  priority: "must" | "should" | "could" | "wont";
  status: RequirementStatus;
  category?: RequirementCategory;
  statusReason?: string;
  behaviorStatements: BehaviorStatement[];
  traceRefs?: TraceRef[];
  semanticRefs?: SemanticRefs;
  verification?: Verification;
  implementation?: Implementation;
  owners: string[];
  tags?: string[];
  supersedes?: string | string[] | null;
  supersededBy?: string | null;
  dependsOn?: string[];
  docSource?: "canonical-json";
  schemaVersion?: string;
  extensions?: Record<string, unknown>;
}

// ─── Change Record ─────────────────────────────────────────────────────────────

export const BUILTIN_CHANGE_TYPES = ["feature", "fix", "refactor", "chore"] as const;
export type BuiltinChangeType = (typeof BUILTIN_CHANGE_TYPES)[number];
export type ChangeType = string;
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
  schemaVersion?: string;
  extensions?: Record<string, unknown>;
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
  supersedes?: string | string[] | null;
  supersededBy?: string | null;
  docSource?: "canonical-json";
  schemaVersion?: string;
  extensions?: Record<string, unknown>;
}

// ─── Workflow Policy ───────────────────────────────────────────────────────────

export interface WorkflowVariant {
  id: string;
  name: string;
  defaultTypes: string[];
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
  schemaVersion?: string;
  extensions?: Record<string, unknown>;
}

// ─── Validation Result ─────────────────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
  rule: string;
  suggestion?: string;
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
  sourceRoots?: string[];
  sourceGlobs?: string[];
  plugins?: string[];
  /** Glob patterns for files to exclude from artifact loading. Default: [".**"] */
  exclude?: string[];
  quality?: {
    validateFilePaths?: boolean;
    /** Per-rule severity overrides. "error" | "warn" | "off" */
    rules?: Record<string, "error" | "warn" | "off">;
  };
  /** Pluggable drift resolver module paths (.js/.mjs/.cjs files exporting DriftResolver). */
  driftResolvers?: string[];
  /** Lifecycle hooks. */
  hooks?: HookDefinition[];
  /** Test metadata linking configuration. */
  testMetadata?: TestMetadataConfig;
  /** Custom change types beyond the built-in feature/fix/refactor/chore. */
  customChangeTypes?: string[];
  /** Enterprise Architecture extension configuration. */
  ea?: import("../ea/config.js").EaConfig;
}

// ─── Plugin System ─────────────────────────────────────────────────────────────

export interface AnchoredSpecPlugin {
  name: string;
  version?: string;
  checks?: PluginCheck[];
  hooks?: PluginHooks;
}

export interface PluginHooks {
  onGenerate?: (context: GenerateHookContext) => void | Promise<void>;
  onVerify?: (context: VerifyHookContext) => ValidationError[] | Promise<ValidationError[]>;
}

export interface GenerateHookContext {
  spec: PluginContext;
  generatedDir: string;
}

export interface VerifyHookContext {
  spec: PluginContext;
  builtinFindings: ValidationError[];
}

export interface PluginCheck {
  id: string;
  description: string;
  check: (ctx: PluginContext) => ValidationError[];
}

export interface PluginContext {
  requirements: Requirement[];
  changes: Change[];
  decisions: Decision[];
  policy: WorkflowPolicy | null;
  projectRoot: string;
  config: AnchoredSpecConfig;
}

// ─── Drift Detection ──────────────────────────────────────────────────────────

export type SemanticRefKind = "interface" | "route" | "errorCode" | "symbol" | "schema" | (string & {});

export interface DriftFinding {
  reqId: string;
  kind: SemanticRefKind;
  ref: string;
  status: "found" | "missing";
  foundIn?: string[];
}

export interface DriftReport {
  findings: DriftFinding[];
  summary: {
    totalRefs: number;
    found: number;
    missing: number;
  };
}

/** Context passed to drift resolvers for each ref lookup. */
export interface DriftResolveContext {
  projectRoot: string;
  /** Lazy file index — only available if built-in scanner ran first. */
  fileIndex?: ReadonlyArray<{ path: string; relativePath: string }>;
}

/**
 * A pluggable drift resolver that can look up semantic refs.
 *
 * Resolver chain behavior:
 * - Return `string[]` (non-empty) → ref is found at those file paths (stops chain)
 * - Return `[]` (empty array) → ref is definitely NOT found (stops chain — no further resolvers run)
 * - Return `null` → this resolver doesn't handle this ref (defers to next resolver)
 *
 * ⚠️ Return `null`, not `[]`, when your resolver doesn't handle a ref kind.
 * Returning `[]` short-circuits the entire resolver chain.
 */
export interface DriftResolver {
  name: string;
  /** Which ref kinds this resolver handles. Omit to handle all kinds.
   * When set, the drift engine will skip this resolver for non-matching kinds. */
  kinds?: SemanticRefKind[];
  /**
   * Resolve a semantic ref to source file paths.
   * @param kind - The kind of semantic reference being resolved
   * @param ref - The reference value to look up
   * @param ctx - Context including projectRoot and fileIndex
   * @returns File paths where the ref is defined, `[]` to mark as not found, or `null` to defer
   */
  resolve(kind: SemanticRefKind, ref: string, ctx: DriftResolveContext): string[] | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export type HookEvent = "post-create" | "post-transition" | `post-create:${string}` | `post-transition:${string}`;

export interface HookDefinition {
  event: HookEvent;
  run: string;
}

// ─── Test Linking ─────────────────────────────────────────────────────────────

export interface TestMetadataConfig {
  /** Glob patterns for test files. Default: *.test.ts, *.test.tsx, etc. */
  testGlobs?: string[];
  /** Regex pattern(s) to extract requirement IDs from test files. String or array of strings. */
  requirementPattern?: string | string[];
}

// ─── Change Verification ──────────────────────────────────────────────────────

export interface ChangeVerificationCommand {
  name: string;
  command: string;
  required: boolean;
  status?: "pending" | "passed" | "failed" | "skipped";
  ranAt?: string | null;
}

export interface ChangeVerification {
  $schema?: string;
  schemaVersion?: string;
  changeId: string;
  commands: ChangeVerificationCommand[];
  driftChecks?: string[];
  evidence?: {
    collected: boolean;
    collectedAt?: string | null;
  };
}
