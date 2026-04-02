import {
  normalizeEntityRef,
  parseEntityRef,
  stringifyEntityRef,
} from "./types.js";

export interface EntityRefNormalizationOptions {
  defaultKind?: string;
  defaultNamespace?: string;
}

export function looksLikeEntityRef(value: string): boolean {
  if (value.includes("://")) return false;
  if (!/^[A-Za-z][A-Za-z0-9-]*:/.test(value)) return false;

  try {
    parseEntityRef(value);
    return true;
  } catch {
    return false;
  }
}

export function normalizeKnownEntityRef(
  value: string,
  options?: EntityRefNormalizationOptions,
): string | null {
  if (!looksLikeEntityRef(value)) return null;

  try {
    return normalizeEntityRef(value, {
      ...(options?.defaultKind ? { defaultKind: options.defaultKind } : {}),
      defaultNamespace: options?.defaultNamespace ?? "default",
    });
  } catch {
    return null;
  }
}

export function getEntityRefAliases(entityRef: string): string[] {
  const aliases = new Set<string>([entityRef]);

  try {
    const parsed = parseEntityRef(entityRef);
    aliases.add(stringifyEntityRef(parsed));

    if ((parsed.namespace ?? "default") === "default") {
      aliases.add(`${parsed.kind.toLocaleLowerCase("en-US")}:${parsed.name}`);
    }
  } catch {
    // Keep only the original string for non-entity-ref values.
  }

  return [...aliases];
}

export function entityRefToFilenameSlug(entityRef: string): string {
  try {
    const parsed = parseEntityRef(entityRef);
    const stableRef =
      (parsed.namespace ?? "default") === "default"
        ? `${parsed.kind.toLocaleLowerCase("en-US")}:${parsed.name}`
        : stringifyEntityRef(parsed);
    return stableRef.replace(/[:/]/g, "-");
  } catch {
    return entityRef.replace(/[:/]/g, "-");
  }
}
