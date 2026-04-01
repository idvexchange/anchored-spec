import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { EaTraceRef } from "../../ea/types.js";

export interface TraceRefWriteEntry {
  path: string;
  role?: EaTraceRef["role"];
}

export function appendTraceRefs(
  filePath: string,
  refs: TraceRefWriteEntry[],
): void {
  const raw = readFileSync(filePath, "utf-8");
  const isJson = filePath.endsWith(".json");

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
    writeFileSync(filePath, stringifyYaml(data), "utf-8");
  }
}
