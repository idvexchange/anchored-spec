/**
 * Anchored Spec — Fact Manifest Writer
 *
 * Persists fact manifests to disk as JSON files.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FactManifest } from "./types.js";

/**
 * Write fact manifests to the specified output directory.
 * Creates directory structure as needed.
 */
export async function writeFactManifests(
  manifests: FactManifest[],
  outputDir: string,
): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });
  const written: string[] = [];
  for (const manifest of manifests) {
    if (manifest.totalFacts === 0) continue;
    // Convert source path to a safe filename: docs/platform/webhook-events.md → docs-platform-webhook-events.json
    const safeName = manifest.source.replace(/[/\\]/g, "-").replace(/\.md$/, ".json");
    const outPath = join(outputDir, safeName);
    await writeFile(outPath, JSON.stringify(manifest, null, 2), "utf-8");
    written.push(outPath);
  }
  return written;
}
