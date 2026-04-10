import { minimatch } from "minimatch";

import type { BackstageEntity } from "./backstage/types.js";
import {
  getEntityCodeLocation,
  getEntityAnchors,
  getEntityId,
  getEntitySource,
  getEntityTraceRefs,
} from "./backstage/accessors.js";
import type { ImpactReport } from "./impact.js";
import type {
  RepositoryCommandSuggestion,
  RepositoryCommandSuggestionKind,
  RepositoryCommandSuggestionTier,
  RepositoryEvidenceAdapter,
  RepositoryTarget,
} from "./repository-evidence.js";
import { NodeWorkspaceEvidenceAdapter } from "./repository-evidence-node.js";

export interface SuggestedCommandPlan {
  sourceRef: string;
  impactedEntityRefs: string[];
  architectureImpact: SuggestedArchitectureImpact;
  repositoryImpact: SuggestedRepositoryImpact;
  suggestions: SuggestedAction[];
  impactedTargets: SuggestedTarget[];
  /** @deprecated Prefer impactedTargets. Retained for compatibility with existing CLI and tests. */
  impactedWorkspaces: SuggestedWorkspace[];
  commands: string[];
  broaderCommands: string[];
  actionCommands: string[];
  reasons: string[];
}

export interface SuggestedArchitectureImpact {
  sourceRef: string;
  impactedEntityRefs: string[];
}

export interface SuggestedRepositoryImpact {
  adapterIds: string[];
  targets: SuggestedTarget[];
}

export interface SuggestedAction {
  id: string;
  tier: RepositoryCommandSuggestionTier;
  kind: RepositoryCommandSuggestionKind;
  command: string;
  source: "workflow-policy" | "repository-evidence";
  sourceId: string;
  reason: string;
  targetId?: string;
  targetName?: string;
  targetKind?: string;
  targetPath?: string;
}

export interface SuggestedTarget {
  adapterId: string;
  id: string;
  name: string;
  path: string;
  dir: string;
  kind?: string;
  entityRefs: string[];
}

export type SuggestedWorkspace = SuggestedTarget;

interface WorkflowPolicyRule {
  id: string;
  include?: string[];
  exclude?: string[];
  commands?: string[];
  broaderCommands?: string[];
  actionCommands?: string[];
}

interface WorkflowPolicyShape {
  changeRequiredRules?: WorkflowPolicyRule[];
}

export function buildSuggestedCommandPlan(
  report: ImpactReport,
  entities: BackstageEntity[],
  projectRoot: string,
  workflowPolicy?: Record<string, unknown> | null,
  options?: {
    adapters?: RepositoryEvidenceAdapter[];
  },
): SuggestedCommandPlan {
  const entityByRef = new Map(entities.map((entity) => [getEntityId(entity), entity]));
  const targetRefs = [report.sourceRef, ...report.impacted.map((entry) => entry.id)];
  const uniqueRefs = [...new Set(targetRefs)];
  const pathsByEntity = new Map<string, string[]>();
  const adapters = options?.adapters ?? [new NodeWorkspaceEvidenceAdapter()];
  const discoveredTargets = adapters.flatMap((adapter) =>
    adapter.discoverTargets(projectRoot).map((target) => ({ adapter, target })),
  );

  for (const ref of uniqueRefs) {
    const entity = entityByRef.get(ref);
    if (!entity) continue;
    pathsByEntity.set(ref, collectEntityPaths(entity));
  }

  const targetMatches = new Map<string, { adapterId: string; target: RepositoryTarget; entityRefs: Set<string> }>();
  for (const [entityRef, paths] of pathsByEntity) {
    for (const path of paths) {
      for (const { adapter, target } of discoveredTargets) {
        if (!pathMatchesTarget(path, target)) continue;
        const matchKey = `${adapter.id}::${target.id}`;
        const existing = targetMatches.get(matchKey) ?? { adapterId: adapter.id, target, entityRefs: new Set<string>() };
        existing.entityRefs.add(entityRef);
        targetMatches.set(matchKey, existing);
      }
    }
  }

  const commands = new Set<string>();
  const broaderCommands = new Set<string>();
  const actionCommands = new Set<string>();
  const reasons = new Set<string>();
  const suggestions = new Map<string, SuggestedAction>();

  const rules = normalizeWorkflowRules(workflowPolicy);
  for (const [entityRef, paths] of pathsByEntity) {
    for (const path of paths) {
      for (const rule of rules) {
        if (!matchesRule(path, rule)) continue;
        addAll(commands, rule.commands);
        addAll(broaderCommands, rule.broaderCommands);
        addAll(actionCommands, rule.actionCommands);
        const reason = `workflow policy rule "${rule.id}" matched ${path}`;
        reasons.add(reason);
        addWorkflowPolicySuggestions(rule, reason, suggestions);
      }
      for (const { adapter, target } of discoveredTargets) {
        if (!pathMatchesTarget(path, target)) continue;
        const reason = `repository target "${target.name}" inferred from ${path} for ${entityRef} via ${adapter.id}`;
        addSuggestedCommands(
          adapter.suggestCommands(target, projectRoot),
          adapter,
          target,
          reason,
          commands,
          broaderCommands,
          actionCommands,
          suggestions,
        );
        reasons.add(reason);
      }
    }
  }

  const impactedTargets = [...targetMatches.values()]
    .map(({ adapterId, target, entityRefs }) => ({
      adapterId,
      id: target.id,
      name: target.name,
      path: target.path,
      dir: target.path,
      kind: target.kind,
      entityRefs: [...entityRefs].sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    sourceRef: report.sourceRef,
    impactedEntityRefs: report.impacted.map((entry) => entry.id),
    architectureImpact: {
      sourceRef: report.sourceRef,
      impactedEntityRefs: report.impacted.map((entry) => entry.id),
    },
    repositoryImpact: {
      adapterIds: [...new Set(impactedTargets.map((target) => target.adapterId))].sort(),
      targets: impactedTargets,
    },
    suggestions: [...suggestions.values()].sort((a, b) => a.command.localeCompare(b.command)),
    impactedTargets,
    impactedWorkspaces: impactedTargets,
    commands: [...commands].sort(),
    broaderCommands: [...broaderCommands].sort(),
    actionCommands: [...actionCommands].sort(),
    reasons: [...reasons].sort(),
  };
}

function collectEntityPaths(entity: BackstageEntity): string[] {
  const values = new Set<string>();
  const codeLocation = getEntityCodeLocation(entity);
  if (codeLocation) values.add(normalizeRepoPath(codeLocation));

  const anchors = getEntityAnchors(entity);
  if (Array.isArray(anchors?.files)) {
    for (const file of anchors.files) {
      if (typeof file === "string") values.add(normalizeRepoPath(file));
    }
  }

  const source = getEntitySource(entity);
  if (source) values.add(normalizeRepoPath(source));

  for (const traceRef of getEntityTraceRefs(entity)) {
    if (traceRef.path.startsWith("http://") || traceRef.path.startsWith("https://")) continue;
    values.add(normalizeRepoPath(traceRef.path));
  }

  return [...values].filter(Boolean);
}

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function pathMatchesTarget(path: string, target: RepositoryTarget): boolean {
  const normalized = normalizeRepoPath(path);
  const targetPath = normalizeRepoPath(target.path);
  return normalized === targetPath || normalized.startsWith(`${targetPath}/`) || targetPath === ".";
}

function normalizeWorkflowRules(
  workflowPolicy?: Record<string, unknown> | null,
): WorkflowPolicyRule[] {
  const shape = (workflowPolicy ?? {}) as WorkflowPolicyShape;
  return Array.isArray(shape.changeRequiredRules)
    ? shape.changeRequiredRules.filter((rule): rule is WorkflowPolicyRule => Boolean(rule?.id))
    : [];
}

function matchesRule(path: string, rule: WorkflowPolicyRule): boolean {
  const normalized = normalizeRepoPath(path);
  const include = Array.isArray(rule.include) ? rule.include : [];
  const exclude = Array.isArray(rule.exclude) ? rule.exclude : [];
  if (include.length === 0) return false;
  const included = include.some((pattern) => minimatch(normalized, pattern));
  if (!included) return false;
  return !exclude.some((pattern) => minimatch(normalized, pattern));
}

function addSuggestedCommands(
  rawSuggestions: RepositoryCommandSuggestion[],
  adapter: RepositoryEvidenceAdapter,
  target: RepositoryTarget,
  reason: string,
  commands: Set<string>,
  broaderCommands: Set<string>,
  actionCommands: Set<string>,
  suggestions: Map<string, SuggestedAction>,
): void {
  for (const suggestion of rawSuggestions) {
    if (!suggestion.command?.trim()) continue;
    if (suggestion.tier === "actionCommands") {
      actionCommands.add(suggestion.command);
    } else if (suggestion.tier === "commands") {
      commands.add(suggestion.command);
    } else if (suggestion.tier === "broaderCommands") {
      broaderCommands.add(suggestion.command);
    }
    const action: SuggestedAction = {
      id: buildActionId("repository-evidence", adapter.id, target.id, suggestion.tier, suggestion.command),
      tier: suggestion.tier,
      kind: suggestion.kind,
      command: suggestion.command,
      source: "repository-evidence",
      sourceId: adapter.id,
      reason: suggestion.reason ?? reason,
      targetId: target.id,
      targetName: target.name,
      targetKind: target.kind,
      targetPath: target.path,
    };
    suggestions.set(action.id, action);
  }
}

function addAll(target: Set<string>, values?: string[]): void {
  for (const value of values ?? []) {
    if (value.trim()) target.add(value);
  }
}

function addWorkflowPolicySuggestions(
  rule: WorkflowPolicyRule,
  reason: string,
  suggestions: Map<string, SuggestedAction>,
): void {
  addWorkflowPolicySuggestionTier(rule, "commands", rule.commands, reason, suggestions);
  addWorkflowPolicySuggestionTier(rule, "broaderCommands", rule.broaderCommands, reason, suggestions);
  addWorkflowPolicySuggestionTier(rule, "actionCommands", rule.actionCommands, reason, suggestions);
}

function addWorkflowPolicySuggestionTier(
  rule: WorkflowPolicyRule,
  tier: RepositoryCommandSuggestionTier,
  commands: string[] | undefined,
  reason: string,
  suggestions: Map<string, SuggestedAction>,
): void {
  for (const command of commands ?? []) {
    const normalized = command.trim();
    if (!normalized) continue;
    const action: SuggestedAction = {
      id: buildActionId("workflow-policy", rule.id, undefined, tier, normalized),
      tier,
      kind: inferCommandKind(normalized),
      command: normalized,
      source: "workflow-policy",
      sourceId: rule.id,
      reason,
    };
    suggestions.set(action.id, action);
  }
}

function buildActionId(
  source: SuggestedAction["source"],
  sourceId: string,
  targetId: string | undefined,
  tier: RepositoryCommandSuggestionTier,
  command: string,
): string {
  return [source, sourceId, targetId ?? "-", tier, command].join("::");
}

function inferCommandKind(command: string): RepositoryCommandSuggestionKind {
  const value = command.toLowerCase();
  if (value.includes("typecheck")) return "typecheck";
  if (value.includes(" run check") || value.endsWith(" check")) return "check";
  if (value.includes("build")) return "build";
  if (value.includes("verify")) return "verify";
  if (value.includes("lint")) return "lint";
  if (value.includes("integration")) return "integration";
  if (value.includes("e2e")) return "e2e";
  if (value.includes("test")) return "test";
  if (value.includes("generate")) return "generate";
  if (value.includes("migrate")) return "migrate";
  if (value.includes("seed")) return "seed";
  return "custom";
}
