import { ANNOTATION_KEYS } from "../ea/backstage/index.js";
import {
  ANCHORED_SPEC_API_VERSION,
  BACKSTAGE_API_VERSION,
  normalizeEntityRef,
  parseEntityRef,
} from "../ea/backstage/types.js";
import type { BackstageEntity } from "../ea/backstage/types.js";
import { looksLikeEntityRef } from "../ea/backstage/ref-utils.js";

const BACKSTAGE_KINDS = new Set([
  "Component",
  "API",
  "Resource",
  "System",
  "Domain",
  "Group",
  "User",
  "Location",
]);

const FIXTURE_KEYS = new Set([
  "ref",
  "apiVersion",
  "kind",
  "namespace",
  "name",
  "title",
  "summary",
  "description",
  "tags",
  "annotations",
  "labels",
  "links",
  "spec",
  "type",
  "owner",
  "lifecycle",
  "status",
  "confidence",
]);

export interface EntityFixtureInput extends Record<string, unknown> {
  ref: string;
  kind: string;
  apiVersion?: string;
  namespace?: string;
  name?: string;
  title?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  annotations?: Record<string, string>;
  labels?: Record<string, string>;
  links?: Array<{ url: string; title?: string; icon?: string; type?: string }>;
  spec?: Record<string, unknown>;
  type?: string;
  owner?: string;
  lifecycle?: string;
  status?: string;
  confidence?: "declared" | "observed" | "inferred";
}

export function makeBackstageEntity(input: EntityFixtureInput): BackstageEntity {
  const apiVersion = input.apiVersion ?? inferApiVersion(input.kind);
  const parsedRef = parseEntityRef(input.ref, {
    defaultKind: input.kind,
    defaultNamespace: input.namespace ?? "default",
  });

  const spec: Record<string, unknown> = {
    ...(input.spec ?? {}),
    ...collectSpecFields(input),
  };

  if (input.type !== undefined && spec.type === undefined) {
    spec.type = input.type;
  }

  if (input.owner !== undefined && spec.owner === undefined) {
    spec.owner = input.owner;
  }

  if (apiVersion === BACKSTAGE_API_VERSION) {
    if (input.lifecycle !== undefined && spec.lifecycle === undefined) {
      spec.lifecycle = input.lifecycle;
    }
    if (spec.lifecycle === undefined && input.status !== undefined) {
      spec.lifecycle = statusToLifecycle(input.status);
    }
    if (spec.lifecycle === undefined) {
      spec.lifecycle = "production";
    }
  } else if (input.status !== undefined && spec.status === undefined) {
    spec.status = input.status;
  } else if (spec.status === undefined) {
    spec.status = "active";
  }

  const annotations: Record<string, string> = {
    ...(input.annotations ?? {}),
  };
  if (input.confidence !== undefined) {
    annotations[ANNOTATION_KEYS.CONFIDENCE] = input.confidence;
  } else {
    annotations[ANNOTATION_KEYS.CONFIDENCE] = "declared";
  }

  return {
    apiVersion,
    kind: input.kind,
    metadata: {
      namespace: parsedRef.namespace,
      name: input.name ?? parsedRef.name,
      title: input.title ?? input.name ?? parsedRef.name,
      description:
        input.description ??
        input.summary ??
        "A well-described entity for testing purposes.",
      tags: input.tags ?? [],
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
      ...(input.labels ? { labels: input.labels } : {}),
      ...(input.links ? { links: input.links } : {}),
    },
    spec,
  };
}

function inferApiVersion(kind: string): string {
  return BACKSTAGE_KINDS.has(kind)
    ? BACKSTAGE_API_VERSION
    : ANCHORED_SPEC_API_VERSION;
}

function collectSpecFields(input: EntityFixtureInput): Record<string, unknown> {
  const specFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!FIXTURE_KEYS.has(key) && value !== undefined) {
      specFields[key] = normalizeSpecValue(value);
    }
  }
  return specFields;
}

function normalizeSpecValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (!looksLikeEntityRef(value)) {
      return value;
    }

    try {
      return normalizeEntityRef(value, { defaultNamespace: "default" });
    } catch {
      return value;
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeSpecValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, normalizeSpecValue(nested)]),
    );
  }

  return value;
}

function statusToLifecycle(status: string): string {
  switch (status) {
    case "draft":
      return "experimental";
    case "planned":
    case "deferred":
      return "development";
    case "deprecated":
      return "deprecated";
    case "retired":
      return "retired";
    default:
      return "production";
  }
}
