/**
 * anchored-spec ea link-docs
 *
 * Auto-sync trace links between markdown documents (frontmatter `ea-artifacts`)
 * and EA artifacts (`traceRefs`).
 *
 * - Doc → Artifact: adds missing traceRefs to artifact files when a doc
 *   references the artifact in its frontmatter.
 * - Artifact → Doc (--bidirectional): adds missing artifact IDs to doc
 *   frontmatter when an artifact has a traceRef pointing at the doc.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import chalk from "chalk";
import { EaRoot } from "../../ea/loader.js";
import { resolveEaConfig } from "../../ea/config.js";
import type { EaTraceRef } from "../../ea/types.js";
import { scanDocs } from "../../ea/docs/scanner.js";
import { parseFrontmatter, serializeFrontmatter } from "../../ea/docs/frontmatter.js";
import { CliError } from "../errors.js";

/** A traceRef that was added to an artifact file. */
interface AddedTraceRef {
  artifactId: string;
  docPath: string;
  role: string;
}

/** A frontmatter ref that was added to a doc. */
interface AddedFrontmatterRef {
  docPath: string;
  artifactId: string;
}

export function eaLinkDocsCommand(): Command {
  return new Command("link-docs")
    .description(
      "Auto-sync trace links between docs and EA artifacts"
    )
    .option("--root-dir <path>", "EA root directory", "ea")
    .option(
      "--doc-dirs <dirs>",
      "Comma-separated doc directories to scan",
      "docs,specs,."
    )
    .option("--dry-run", "Show what would change without writing files")
    .option(
      "--bidirectional",
      "Also add missing artifact IDs to doc frontmatter"
    )
    .option("--role <role>", "Role for new traceRefs", "context")
    .option("--json", "Output structured JSON")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, {
        specDir: "specs",
        outputDir: "output",
        ea: eaConfig,
      } as never);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec ea init' first.",
          2
        );
      }

      const loadResult = await root.loadArtifacts();
      const docDirs = (options.docDirs as string)
        .split(",")
        .map((d) => d.trim());

      // ── Doc → Artifact: discover missing traceRefs ──────────────────
      const scanResult = scanDocs(cwd, { dirs: docDirs });

      /** Map from artifact ID to its loaded detail (for filePath lookup). */
      const detailById = new Map(
        loadResult.details
          .filter((d) => d.artifact)
          .map((d) => [d.artifact!.id, d])
      );

      /** Map from artifact ID to the artifact object itself. */
      const artifactById = new Map(
        loadResult.artifacts.map((a) => [a.id, a])
      );

      const addedTraceRefs: AddedTraceRef[] = [];

      // For every doc that declares ea-artifacts, ensure the referenced
      // artifact has a traceRef pointing back at the doc.
      for (const doc of scanResult.docs) {
        for (const artifactId of doc.artifactIds) {
          const artifact = artifactById.get(artifactId);
          if (!artifact) continue;

          const existing = (artifact.traceRefs ?? []).some(
            (ref) => ref.path === doc.relativePath
          );
          if (existing) continue;

          addedTraceRefs.push({
            artifactId,
            docPath: doc.relativePath,
            role: options.role ?? "context",
          });
        }
      }

      // Group added traceRefs by artifact ID for batch writing.
      const traceRefsByArtifact = new Map<string, AddedTraceRef[]>();
      for (const entry of addedTraceRefs) {
        const list = traceRefsByArtifact.get(entry.artifactId) ?? [];
        list.push(entry);
        traceRefsByArtifact.set(entry.artifactId, list);
      }

      // Write updated artifact files.
      if (!options.dryRun) {
        for (const [artifactId, refs] of traceRefsByArtifact) {
          const detail = detailById.get(artifactId);
          if (!detail) continue;

          writeArtifactTraceRefs(detail.filePath, refs);
        }
      }

      // ── Artifact → Doc (--bidirectional) ────────────────────────────
      const addedFrontmatterRefs: AddedFrontmatterRef[] = [];

      if (options.bidirectional) {
        for (const artifact of loadResult.artifacts) {
          if (!artifact.traceRefs) continue;

          for (const ref of artifact.traceRefs) {
            // Skip URLs — only handle local file paths.
            if (/^https?:\/\//.test(ref.path)) continue;

            const absPath = resolve(cwd, ref.path);
            let content: string;
            try {
              content = readFileSync(absPath, "utf-8");
            } catch {
              // File doesn't exist or isn't readable — skip.
              continue;
            }

            const parsed = parseFrontmatter(content);
            const existingIds = parsed.frontmatter.eaArtifacts ?? [];
            if (existingIds.includes(artifact.id)) continue;

            addedFrontmatterRefs.push({
              docPath: ref.path,
              artifactId: artifact.id,
            });

            if (!options.dryRun) {
              const updatedFm = {
                ...parsed.frontmatter,
                eaArtifacts: [...existingIds, artifact.id],
              };
              const serialized = serializeFrontmatter(updatedFm);
              writeFileSync(absPath, serialized + "\n" + parsed.body, "utf-8");
            }
          }
        }
      }

      // ── Output ──────────────────────────────────────────────────────
      const summary = {
        artifactsUpdated: traceRefsByArtifact.size,
        docsUpdated: new Set(addedFrontmatterRefs.map((r) => r.docPath)).size,
        traceRefsAdded: addedTraceRefs.length,
        frontmatterRefsAdded: addedFrontmatterRefs.length,
      };

      if (options.json) {
        const output = {
          artifactsUpdated: [...traceRefsByArtifact.entries()].map(
            ([id, refs]) => ({
              id,
              addedTraceRefs: refs.map((r) => r.docPath),
            })
          ),
          docsUpdated: buildDocsUpdatedList(addedFrontmatterRefs),
          summary,
        };
        process.stdout.write(JSON.stringify(output, null, 2) + "\n");
      } else {
        printHumanOutput(
          traceRefsByArtifact,
          addedFrontmatterRefs,
          summary,
          !!options.dryRun,
          !!options.bidirectional
        );
      }

      if (
        summary.traceRefsAdded === 0 &&
        summary.frontmatterRefsAdded === 0
      ) {
        console.log(
          options.json ? "" : chalk.green("\n✓ All trace links are in sync.")
        );
      }
    });
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Read an artifact file, append new traceRef entries, and write it back
 * in the same format (JSON or YAML).
 */
function writeArtifactTraceRefs(
  filePath: string,
  refs: AddedTraceRef[]
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

  if (!Array.isArray(data.traceRefs)) {
    data.traceRefs = [];
  }

  for (const ref of refs) {
    const alreadyPresent = (data.traceRefs as EaTraceRef[]).some(
      (existing) => existing.path === ref.docPath
    );
    if (alreadyPresent) continue;

    data.traceRefs.push({ path: ref.docPath, role: ref.role });
  }

  if (isJson) {
    writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  } else {
    writeFileSync(filePath, stringifyYaml(data), "utf-8");
  }
}

/** Group frontmatter ref additions by doc path for JSON output. */
function buildDocsUpdatedList(
  refs: AddedFrontmatterRef[]
): { path: string; addedArtifactIds: string[] }[] {
  const byDoc = new Map<string, string[]>();
  for (const r of refs) {
    const list = byDoc.get(r.docPath) ?? [];
    list.push(r.artifactId);
    byDoc.set(r.docPath, list);
  }
  return [...byDoc.entries()].map(([path, ids]) => ({
    path,
    addedArtifactIds: ids,
  }));
}

/** Print human-readable link-docs report to stdout. */
function printHumanOutput(
  traceRefsByArtifact: Map<string, AddedTraceRef[]>,
  addedFrontmatterRefs: AddedFrontmatterRef[],
  summary: {
    artifactsUpdated: number;
    docsUpdated: number;
    traceRefsAdded: number;
    frontmatterRefsAdded: number;
  },
  dryRun: boolean,
  bidirectional: boolean
): void {
  console.log(chalk.blue("Link-Docs Report\n"));

  if (dryRun) {
    console.log(chalk.yellow("  DRY RUN — no files modified\n"));
  }

  // Artifacts updated
  if (traceRefsByArtifact.size > 0) {
    console.log(chalk.dim("  Artifacts updated (traceRefs added):"));
    for (const [id, refs] of traceRefsByArtifact) {
      console.log(chalk.green(`    ✅ ${id}`));
      for (const ref of refs) {
        console.log(chalk.dim(`       + ${ref.docPath} (${ref.role})`));
      }
    }
    console.log("");
  }

  // Documents updated (only with --bidirectional)
  if (bidirectional && addedFrontmatterRefs.length > 0) {
    console.log(
      chalk.dim("  Documents updated (frontmatter ea-artifacts added):")
    );
    const byDoc = new Map<string, string[]>();
    for (const r of addedFrontmatterRefs) {
      const list = byDoc.get(r.docPath) ?? [];
      list.push(r.artifactId);
      byDoc.set(r.docPath, list);
    }
    for (const [docPath, ids] of byDoc) {
      console.log(chalk.green(`    ✅ ${docPath}`));
      for (const id of ids) {
        console.log(chalk.dim(`       + ${id}`));
      }
    }
    console.log("");
  }

  console.log(
    chalk.dim(
      `  Summary: ${summary.artifactsUpdated} artifacts updated, ` +
        `${summary.docsUpdated} documents updated, ` +
        `${summary.traceRefsAdded} traceRefs added, ` +
        `${summary.frontmatterRefsAdded} frontmatter refs added`
    )
  );
}
