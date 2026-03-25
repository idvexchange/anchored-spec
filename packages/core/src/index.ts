/**
 * Anchored Spec — Core
 *
 * Public API for the anchored-spec framework.
 */

// Types
export type {
  Requirement,
  BehaviorStatement,
  TraceRef,
  SemanticRefs,
  TestRef,
  Verification,
  Implementation,
  RequirementStatus,
  Change,
  ChangeType,
  ChangePhase,
  ChangeStatus,
  ChangeScope,
  BugfixSpec,
  ChangeTimestamps,
  Decision,
  Alternative,
  WorkflowPolicy,
  WorkflowVariant,
  ChangeRequiredRule,
  ChoreEligibility,
  LifecycleRules,
  ValidationResult,
  ValidationError,
  PolicyMatchResult,
  PolicyEvaluationResult,
  AnchoredSpecConfig,
} from "./types.js";

// Validation
export {
  validateSchema,
  validateRequirement,
  validateChange,
  validateDecision,
  validateWorkflowPolicy,
  checkRequirementQuality,
} from "./validate.js";
export type { SchemaName } from "./validate.js";

// Policy Engine
export {
  evaluatePolicy,
  isTrivialPath,
  matchRules,
  isPathCoveredByChange,
  validateWorkflowEntry,
  resolveWorkflowVariant,
  isChoreEligible,
} from "./policy.js";

// Generators
export {
  generateRequirementsMarkdown,
  generateDecisionsMarkdown,
  generateChangesMarkdown,
  generateStatusMarkdown,
} from "./generate.js";

// Loader
export { SpecRoot, resolveConfig } from "./loader.js";
