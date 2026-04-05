import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { EaTraceRef } from "../../ea/types.js";
import { parseBackstageYaml } from "../../ea/backstage/parser.js";
import { writeBackstageManifest, writeBackstageYaml } from "../../ea/backstage/writer.js";
import { getEntityId } from "../../ea/backstage/accessors.js";

export interface TraceRefWriteEntry {
  path: string;
  role?: EaTraceRef["role"];
}

export function appendTraceRefs(
  filePath: string,
  refs: TraceRefWriteEntry[],
  targetEntityRef?: string,
): void {
  const raw = readFileSync(filePath, "utf-8");
  const isJson = filePath.endsWith(".json");

  if (!isJson) {
    const parsed = parseBackstageYaml(raw, filePath);
    if (parsed.errors.length === 0 && parsed.entities.length > 1) {
      if (!targetEntityRef) {
        throw new Error(
          `Cannot update multi-document manifest without a target entity ref: ${filePath}`,
        );
      }

      const entities = parsed.entities.map((entry) => entry.entity);
      const target = entities.find((entity) => getEntityId(entity) === targetEntityRef);
      if (!target) {
        throw new Error(`Entity not found in manifest ${filePath}: ${targetEntityRef}`);
      }

      const traceRefContainer = (
        target.spec && typeof target.spec === "object" && !Array.isArray(target.spec)
          ? target.spec
          : target
      ) as Record<string, unknown>;

      if (!Array.isArray(traceRefContainer.traceRefs)) {
        traceRefContainer.traceRefs = [];
      }

      for (const ref of refs) {
        const alreadyPresent = (traceRefContainer.traceRefs as EaTraceRef[]).some(
          (existing) => existing.path === ref.path,
        );
        if (alreadyPresent) continue;

        (traceRefContainer.traceRefs as EaTraceRef[]).push({
          path: ref.path,
          ...(ref.role ? { role: ref.role } : {}),
        });
      }

      writeFileSync(filePath, writeBackstageManifest(entities), "utf-8");
      return;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  if (isJson) {
    data = JSON.parse(raw);
  } else {
    data = parseYaml(raw);
  }

  const traceRefContainer = (
    data.spec && typeof data.spec === "object" && !Array.isArray(data.spec)
      ? data.spec
      : data
  ) as Record<string, unknown>;

  if (!Array.isArray(traceRefContainer.traceRefs)) {
    traceRefContainer.traceRefs = [];
  }

  for (const ref of refs) {
    const alreadyPresent = (traceRefContainer.traceRefs as EaTraceRef[]).some(
      (existing) => existing.path === ref.path,
    );
    if (alreadyPresent) continue;

    (traceRefContainer.traceRefs as EaTraceRef[]).push({
      path: ref.path,
      ...(ref.role ? { role: ref.role } : {}),
    });
  }

  if (isJson) {
    writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  } else {
    writeFileSync(filePath, writeBackstageYaml(data), "utf-8");
  }
}
