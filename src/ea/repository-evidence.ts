export type RepositoryCommandSuggestionTier =
  | "commands"
  | "broaderCommands"
  | "actionCommands";

export type RepositoryCommandSuggestionKind =
  | "typecheck"
  | "check"
  | "build"
  | "verify"
  | "test"
  | "lint"
  | "integration"
  | "e2e"
  | "generate"
  | "migrate"
  | "seed"
  | "custom";

export interface RepositoryTarget {
  id: string;
  name: string;
  path: string;
  kind?: string;
  metadata?: Record<string, unknown>;
}

export interface RepositoryCommandSuggestion {
  kind: RepositoryCommandSuggestionKind;
  tier: RepositoryCommandSuggestionTier;
  command?: string;
  targetId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface RepositoryEvidenceAdapterConfig {
  name?: string;
  path?: string;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

export interface RepositoryEvidenceAdapterFactoryContext {
  projectRoot: string;
  options?: Record<string, unknown>;
}

export interface RepositoryEvidenceAdapter {
  id: string;
  discoverTargets(projectRoot: string): RepositoryTarget[];
  suggestCommands(target: RepositoryTarget, projectRoot: string): RepositoryCommandSuggestion[];
}

export interface RepositoryEvidenceAdapterFactory {
  (
    context: RepositoryEvidenceAdapterFactoryContext,
  ): RepositoryEvidenceAdapter | Promise<RepositoryEvidenceAdapter>;
}
