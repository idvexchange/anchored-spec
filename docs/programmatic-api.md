# Programmatic API

Anchored Spec exports its core engine as a TypeScript library for programmatic use.

## Installation

```bash
npm install anchored-spec
```

```typescript
import { SpecRoot, validateRequirement, detectDrift } from "anchored-spec";
```

Both ESM `import` and CJS `require` are supported.

## Loading Specs

The `SpecRoot` class provides typed access to all spec artifacts:

```typescript
import { SpecRoot, resolveConfig } from "anchored-spec";

const spec = new SpecRoot("/path/to/project");

const requirements = spec.loadRequirements();     // Requirement[]
const changes = spec.loadChanges();               // Change[]
const decisions = spec.loadDecisions();            // Decision[]
const policy = spec.loadWorkflowPolicy();          // WorkflowPolicy | null
const verifications = spec.loadChangeVerifications(); // ChangeVerification[]
const summary = spec.getSummary();                 // { initialized, counts... }
```

## Validation

### Verification Engine

The primary verification API — runs all built-in checks, plugin checks, and onVerify hooks:

```typescript
import { SpecRoot, runAllChecks } from "anchored-spec";
import type { VerificationResult, VerificationOptions } from "anchored-spec";

const spec = new SpecRoot("/path/to/project");
const result: VerificationResult = await runAllChecks(spec, { strict: true });

// result.passed: boolean — true if zero errors
// result.summary: { totalChecks, passed, warnings, errors, artifacts }
// result.findings: ValidationError[] — all findings with rule, suggestion, severity
```

Options:

```typescript
interface VerificationOptions {
  strict?: boolean;                              // Promote warnings to errors
  ruleOverrides?: Record<string, "error" | "warn" | "off">;  // Per-rule overrides
}
```

### Schema Validation

```typescript
import { validateRequirement, validateChange, validateDecision } from "anchored-spec";

const result = validateRequirement(myReqJson);
// result.valid: boolean
// result.errors: ValidationError[]
// result.warnings: ValidationError[]
```

### Quality Checks

```typescript
import { checkRequirementQuality } from "anchored-spec";

const warnings = checkRequirementQuality(requirement);
// Checks: vague language, EARS compliance, route format, semantic ref population, etc.
```

### Integrity Checks

```typescript
import {
  checkCrossReferences,
  checkLifecycleRules,
  checkDependencies,
  detectCycles,
  checkFilePaths,
  checkTestLinking,
} from "anchored-spec";

// Cross-reference integrity (REQ ↔ CHG)
const crossRefErrors = checkCrossReferences(requirements, changes);

// Lifecycle rule enforcement
const lifecycleErrors = checkLifecycleRules(requirements, changes, policy);

// Dependency validation
const depErrors = checkDependencies(requirements);

// File path existence
const pathErrors = checkFilePaths(requirements, projectRoot);

// Bidirectional test linking
const linking = checkTestLinking(requirements, projectRoot, config.testMetadata);
// linking.findings: TestLinkFinding[]
// linking.summary: { linkedTests, orphanTests, missingTests }
```

## Policy Enforcement

```typescript
import { evaluatePolicy, checkPaths } from "anchored-spec";

// Evaluate a single path
const match = evaluatePolicy("src/auth.ts", policy);
// match.requiresChange: boolean
// match.matchedRule: string | null

// Check multiple paths against active changes
const result = checkPaths(
  ["src/auth.ts", "README.md"],
  policy,
  changes.filter(c => c.status === "active"),
);
// result.valid: boolean
// result.uncoveredPaths: string[]
```

## Drift Detection

```typescript
import { detectDrift, typescriptAstResolver } from "anchored-spec";

const report = detectDrift(requirements, {
  projectRoot: "/path/to/project",
  sourceRoots: ["src"],
  resolvers: [typescriptAstResolver],  // Optional custom resolvers
});

// report.findings: DriftFinding[]  — { reqId, kind, ref, status, files? }
// report.summary: { totalRefs, found, missing }
```

## Evidence Pipeline

```typescript
import {
  collectEvidence,
  writeEvidence,
  validateEvidence,
  loadEvidence,
  VitestParser,
} from "anchored-spec";

// Collect evidence from test output
const evidence = collectEvidence("vitest-report.json", "vitest", requirements);

// Write to disk
writeEvidence(evidence, "specs/generated/evidence.json");

// Validate evidence against requirements
const errors = validateEvidence("specs/generated/evidence.json", requirements);

// Load existing evidence
const existing = loadEvidence("specs/generated/evidence.json");
```

## Impact Analysis

```typescript
import { analyzeImpact, generateImpactMap } from "anchored-spec";

// Analyze specific files
const results = analyzeImpact(
  ["src/auth/login.ts"],
  requirements,
  changes,
);

for (const result of results) {
  console.log(result.filePath, result.matchedRequirements);
}

// Generate full impact map
const map = generateImpactMap(requirements, changes, {
  projectRoot: "/path/to/project",
  sourceRoots: ["src"],
});
```

## Hooks

```typescript
import { runHooks } from "anchored-spec";
import type { AnchoredSpecConfig, HookEnv } from "anchored-spec";

runHooks("post-create:requirement", config, {
  ANCHORED_SPEC_EVENT: "post-create:requirement",
  ANCHORED_SPEC_ID: "REQ-1",
  ANCHORED_SPEC_TYPE: "requirement",
  ANCHORED_SPEC_STATUS: "draft",
} as HookEnv, { cwd: projectRoot, dryRun: false });
```

## Plugins

```typescript
import { loadPlugins, runPluginChecks } from "anchored-spec";

const plugins = await loadPlugins(pluginPaths, projectRoot);
const errors = runPluginChecks(plugins, {
  requirements,
  changes,
  decisions,
  policy,
  projectRoot,
  config,
});
```

## File Discovery

```typescript
import { walkDir, discoverSourceFiles } from "anchored-spec";

// Walk a directory with filtering
const files = walkDir("/path/to/src", {
  extensions: [".ts", ".tsx"],
  ignore: ["node_modules", "dist"],
});

// Discover source files for drift detection
const sourceFiles = discoverSourceFiles(projectRoot, ["src"]);
```

## Key Types

```typescript
import type {
  // Core artifacts
  Requirement, Change, Decision, WorkflowPolicy,
  ChangeVerification, ChangeVerificationCommand,

  // Requirement parts
  BehaviorStatement, TraceRef, TestRef, SemanticRefs,
  Verification, Implementation, RequirementStatus, RequirementCategory,

  // Change parts
  ChangeType, ChangePhase, ChangeStatus, ChangeScope,

  // Drift detection
  DriftResolver, DriftResolveContext, DriftFinding, DriftReport,
  SemanticRefKind,

  // Evidence
  Evidence, EvidenceRecord, EvidenceParser,

  // Impact
  ImpactResult, ImpactMatch, ImpactMap,

  // Test linking
  TestLinkReport, TestLinkFinding, TestMetadataConfig,

  // Hooks
  HookDefinition, HookEvent,

  // Validation & Verification
  ValidationResult, ValidationError,
  VerificationResult, VerificationSummary, VerificationOptions,

  // Config & Policy
  AnchoredSpecConfig, WorkflowVariant, ChangeRequiredRule,

  // Plugin system
  AnchoredSpecPlugin, PluginCheck, PluginContext, PluginHooks,
  GenerateHookContext, VerifyHookContext,
} from "anchored-spec";

// Value exports
import { BUILTIN_CHANGE_TYPES, runAllChecks } from "anchored-spec";
```
