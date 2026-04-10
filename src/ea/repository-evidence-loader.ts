import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { AnchoredSpecConfigV1 } from "./config.js";
import type {
  RepositoryEvidenceAdapter,
  RepositoryEvidenceAdapterConfig,
  RepositoryEvidenceAdapterFactory,
} from "./repository-evidence.js";
import { NodeWorkspaceEvidenceAdapter } from "./repository-evidence-node.js";

interface RepositoryEvidenceModuleShape {
  default?: RepositoryEvidenceAdapter | RepositoryEvidenceAdapterFactory;
  repositoryEvidenceAdapter?: RepositoryEvidenceAdapter;
  createRepositoryEvidenceAdapter?: RepositoryEvidenceAdapterFactory;
}

export async function loadRepositoryEvidenceAdapters(
  config: AnchoredSpecConfigV1,
  projectRoot: string,
): Promise<RepositoryEvidenceAdapter[]> {
  const entries = getRepositoryEvidenceAdapterConfigs(config);
  if (entries.length === 0) {
    return [];
  }

  const adapters: RepositoryEvidenceAdapter[] = [];
  for (const entry of entries) {
    if (entry.enabled === false) continue;
    adapters.push(await loadRepositoryEvidenceAdapter(entry, projectRoot));
  }
  return adapters;
}

export function getRepositoryEvidenceAdapterConfigs(
  config: AnchoredSpecConfigV1,
): RepositoryEvidenceAdapterConfig[] {
  if (config.schemaVersion === "1.2") {
    return config.repositoryEvidence?.adapters ?? [];
  }
  return [{ name: "node-workspaces", enabled: true }];
}

async function loadRepositoryEvidenceAdapter(
  entry: RepositoryEvidenceAdapterConfig,
  projectRoot: string,
): Promise<RepositoryEvidenceAdapter> {
  if (entry.name === "node-workspaces") {
    return new NodeWorkspaceEvidenceAdapter();
  }

  if (!entry.path) {
    throw new Error(`Unsupported repository evidence adapter "${entry.name ?? "unknown"}"`);
  }

  const moduleUrl = pathToFileURL(resolve(projectRoot, entry.path)).href;
  const mod = await import(moduleUrl) as RepositoryEvidenceModuleShape;

  if (isAdapter(mod.repositoryEvidenceAdapter)) {
    return mod.repositoryEvidenceAdapter;
  }

  if (typeof mod.createRepositoryEvidenceAdapter === "function") {
    return await mod.createRepositoryEvidenceAdapter({
      projectRoot,
      options: entry.options,
    });
  }

  if (isAdapter(mod.default)) {
    return mod.default;
  }

  if (typeof mod.default === "function") {
    return await (mod.default as RepositoryEvidenceAdapterFactory)({
      projectRoot,
      options: entry.options,
    });
  }

  throw new Error(`Repository evidence adapter module "${entry.path}" did not export a valid adapter`);
}

function isAdapter(value: unknown): value is RepositoryEvidenceAdapter {
  return Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { discoverTargets?: unknown }).discoverTargets === "function" &&
    typeof (value as { suggestCommands?: unknown }).suggestCommands === "function";
}
