import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BACKSTAGE_KIND_REGISTRY } from "../ea/backstage/kind-mapping.js";

// ── helpers ──────────────────────────────────────────────────────────

const SCHEMA_BASE = "./node_modules/anchored-spec/dist/ea/schemas";

function schemaPath(name: string): string {
  return `${SCHEMA_BASE}/${name}.schema.json`;
}

// ── 1. settings.json ─────────────────────────────────────────────────

export function generateVscodeSettings(_config: {
  domains: Record<string, string>;
}): object {
  const yamlSchemas: Record<string, string[]> = {};

  for (const entry of BACKSTAGE_KIND_REGISTRY) {
    yamlSchemas[schemaPath(entry.legacyKind)] = [
      `**/${entry.legacyPrefix}-*.yaml`,
      `**/${entry.legacyPrefix}-*.yml`,
    ];
  }

  const jsonSchemas = [
    {
      fileMatch: [".anchored-spec/config.json"],
      url: schemaPath("config-v1"),
    },
  ];

  return {
    "yaml.schemas": yamlSchemas,
    "json.schemas": jsonSchemas,
    "files.associations": {
      "ea/**/*.yaml": "yaml",
    },
  };
}

// ── 2. extensions.json ───────────────────────────────────────────────

export function generateVscodeExtensions(): object {
  return {
    recommendations: ["redhat.vscode-yaml"],
  };
}

// ── 3. snippets ──────────────────────────────────────────────────────

const SNIPPET_KINDS = [
  "application",
  "api-contract",
  "service",
  "deployment",
  "environment",
  "platform",
  "data-store",
  "capability",
  "process",
  "requirement",
  "event-contract",
  "canonical-entity",
  "baseline",
  "target",
  "transition-plan",
] as const;

function titleCase(kind: string): string {
  return kind
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function snippetBody(kind: string): string[] {
  const entry = BACKSTAGE_KIND_REGISTRY.find((candidate) => candidate.legacyKind === kind);
  if (!entry) return [];
  return [
    `apiVersion: ${entry.apiVersion}`,
    `kind: ${entry.backstageKind}`,
    "metadata:",
    "  name: ${1:slug}",
    `  title: ${"${2:"}${titleCase(kind)}}`,
    "  description: ${3:Brief description}",
    "  tags:",
    "    - ${4:tag}",
    "spec:",
    ...(entry.specType ? [`  type: ${entry.specType}`] : []),
    "  owner: ${5:group:default/team-name}",
    "  lifecycle: experimental",
  ];
}

export function generateVscodeSnippets(): object {
  const snippets: Record<string, object> = {};

  for (const kind of SNIPPET_KINDS) {
    const entry = BACKSTAGE_KIND_REGISTRY.find((e) => e.legacyKind === kind);
    if (!entry) continue;

    snippets[`EA: ${titleCase(kind)}`] = {
      prefix: `ea-${kind}`,
      scope: "yaml",
      body: snippetBody(kind),
      description: `Create a new ${entry.backstageKind} entity for ${kind}`,
    };
  }

  // Utility: relation
  snippets["EA: Relation"] = {
    prefix: "ea-relation",
    scope: "yaml",
    body: [
      "- type: ${1|dependsOn,consumedBy,implements,deployedOn,ownedBy,partOf,triggers,flowsTo|}",
      "  target: ${2:KIND-slug}",
    ],
    description: "Add a relation entry to an artifact",
  };

  // Utility: anchor
  snippets["EA: Anchor"] = {
    prefix: "ea-anchor",
    scope: "yaml",
    body: [
      "- type: ${1|sourceCode,ciPipeline,observability,documentation,ticketSystem,registry|}",
      "  uri: ${2:https://}",
      "  label: ${3:description}",
    ],
    description: "Add an anchor entry to an artifact",
  };

  return snippets;
}

// ── 4. write to disk ─────────────────────────────────────────────────

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function mergeSettings(
  existing: Record<string, unknown>,
  generated: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...existing };

  // Deep-merge yaml.schemas
  if (generated["yaml.schemas"]) {
    merged["yaml.schemas"] = {
      ...((existing["yaml.schemas"] as Record<string, unknown>) ?? {}),
      ...(generated["yaml.schemas"] as Record<string, unknown>),
    };
  }

  // Deep-merge json.schemas (array — dedupe by url)
  const existingJsonSchemas = Array.isArray(existing["json.schemas"])
    ? (existing["json.schemas"] as Array<{ url?: string }>)
    : [];
  const newJsonSchemas = Array.isArray(generated["json.schemas"])
    ? (generated["json.schemas"] as Array<{ url?: string }>)
    : [];

  const urlSet = new Set(existingJsonSchemas.map((s) => s.url));
  const mergedJsonSchemas = [
    ...existingJsonSchemas,
    ...newJsonSchemas.filter((s) => !urlSet.has(s.url)),
  ];
  merged["json.schemas"] = mergedJsonSchemas;

  // Deep-merge files.associations
  if (generated["files.associations"]) {
    merged["files.associations"] = {
      ...((existing["files.associations"] as Record<string, unknown>) ?? {}),
      ...(generated["files.associations"] as Record<string, unknown>),
    };
  }

  return merged;
}

function mergeExtensions(
  existing: Record<string, unknown>,
  generated: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...existing };
  const existingRecs = Array.isArray(existing.recommendations)
    ? (existing.recommendations as string[])
    : [];
  const newRecs = Array.isArray(generated.recommendations)
    ? (generated.recommendations as string[])
    : [];

  merged.recommendations = [...new Set([...existingRecs, ...newRecs])];
  return merged;
}

export function writeIdeFiles(
  projectRoot: string,
  config: { domains: Record<string, string> },
): { created: string[]; skipped: string[] } {
  const vscodeDir = join(projectRoot, ".vscode");
  mkdirSync(vscodeDir, { recursive: true });

  const created: string[] = [];
  const skipped: string[] = [];

  // settings.json — merge
  const settingsPath = join(vscodeDir, "settings.json");
  const generatedSettings = generateVscodeSettings(config) as Record<
    string,
    unknown
  >;
  const existingSettings = readJsonSafe(settingsPath);

  const finalSettings =
    existingSettings !== null
      ? mergeSettings(existingSettings, generatedSettings)
      : generatedSettings;

  writeFileSync(settingsPath, JSON.stringify(finalSettings, null, 2) + "\n");
  created.push(settingsPath);

  // extensions.json — merge
  const extensionsPath = join(vscodeDir, "extensions.json");
  const generatedExtensions = generateVscodeExtensions() as Record<
    string,
    unknown
  >;
  const existingExtensions = readJsonSafe(extensionsPath);

  const finalExtensions =
    existingExtensions !== null
      ? mergeExtensions(existingExtensions, generatedExtensions)
      : generatedExtensions;

  writeFileSync(
    extensionsPath,
    JSON.stringify(finalExtensions, null, 2) + "\n",
  );
  created.push(extensionsPath);

  // snippets — overwrite
  const snippetsPath = join(vscodeDir, "anchored-spec.code-snippets");
  writeFileSync(
    snippetsPath,
    JSON.stringify(generateVscodeSnippets(), null, 2) + "\n",
  );
  created.push(snippetsPath);

  return { created, skipped };
}
