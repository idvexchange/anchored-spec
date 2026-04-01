/**
 * anchored-spec ea link-docs
 *
 * Auto-sync trace links between markdown documents (frontmatter `ea-artifacts`)
 * and entities (`traceRefs`).
 *
 * - Doc → Entity: adds missing traceRefs to entity files when a doc
 *   references the entity in its frontmatter.
 * - Entity → Doc (--bidirectional): adds missing entity refs to doc
 *   frontmatter when an entity has a traceRef pointing at the doc.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { EaRoot } from "../../ea/loader.js";
import { resolveConfigV1 } from "../../ea/config.js";
import type { EaTraceRef } from "../../ea/types.js";
import {
  getEntityId,
  getEntityTraceRefs,
} from "../../ea/backstage/accessors.js";
import { scanDocs } from "../../ea/docs/scanner.js";
import { parseFrontmatter, serializeFrontmatter } from "../../ea/docs/frontmatter.js";
import { CliError } from "../errors.js";
import { extractFactsFromDocs } from "../../ea/resolvers/markdown.js";
import { suggestAnnotations } from "../../ea/facts/annotator.js";
import type { AnnotationSuggestion } from "../../ea/facts/annotator.js";
import { appendTraceRefs } from "./trace-ref-writer.js";

/** A traceRef that was added to an entity file. */
interface AddedTraceRef {
  artifactId: string;
  docPath: string;
  role: NonNullable<EaTraceRef["role"]>;
}

/** A frontmatter ref that was added to a doc. */
interface AddedFrontmatterRef {
  docPath: string;
  artifactId: string;
}

export function eaLinkDocsCommand(): Command {
  return new Command("link-docs")
    .description(
      "Auto-sync trace links between docs and entities"
    )
    .option("--root-dir <path>", "EA root directory", "docs")
    .option(
      "--doc-dirs <dirs>",
      "Comma-separated doc directories to scan",
      "docs,specs,."
    )
    .option("--dry-run", "Show what would change without writing files")
    .option(
      "--bidirectional",
      "Also add missing entity refs to doc frontmatter"
    )
    .option("--role <role>", "Role for new traceRefs", "context")
    .option("--json", "Output structured JSON")
    .option("--annotate", "Suggest or insert @anchored-spec:* annotation hints for classifiable blocks")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec init' first.",
          2
        );
      }

      const loadResult = await root.loadEntities();

      // ── Annotation suggestions (--annotate) ─────────────────────────
      if (options.annotate) {
        const manifests = await extractFactsFromDocs(cwd, undefined);
        const suggestions = suggestAnnotations(manifests);

        if (options.json) {
          process.stdout.write(JSON.stringify({ suggestions, summary: { total: suggestions.length } }, null, 2) + "\n");
        } else {
          if (suggestions.length === 0) {
            console.log(chalk.green("\n✓ All classifiable blocks already have @anchored-spec:* annotations."));
          } else {
            console.log(chalk.blue("Annotation Suggestions\n"));
            if (options.dryRun) {
              console.log(chalk.yellow("  DRY RUN — no files modified\n"));
            }

            for (const s of suggestions) {
              const icon = s.confidence === "high" ? chalk.green("●") : chalk.yellow("○");
              console.log(`  ${icon} ${chalk.bold(s.file)}:${s.line}`);
              console.log(chalk.dim(`    ${s.annotation}`));
              console.log(chalk.dim(`    ... (${s.kind})`));
              console.log(chalk.dim(`    ${s.endAnnotation}`));
              console.log(chalk.dim(`    Reason: ${s.reason}`));
              console.log("");
            }

            console.log(chalk.dim(`  ${suggestions.length} suggestion(s) found.`));

            if (!options.dryRun) {
              const written = writeAnnotations(cwd, suggestions);
              console.log(chalk.green(`\n✓ Inserted annotations in ${written} file(s).`));
            }
          }
        }

        return; // --annotate is a standalone mode
      }

      const docDirs = (options.docDirs as string)
        .split(",")
        .map((d) => d.trim());

      // ── Doc → Artifact: discover missing traceRefs ──────────────────
      const scanResult = scanDocs(cwd, { dirs: docDirs });

      /** Map from entity ID/ref to its loaded detail (for filePath lookup). */
      const detailById = new Map(
        loadResult.details.flatMap((detail) => {
          const entity = detail.entity ?? detail.authoredEntity;
          if (!entity) return [];
          return [[getEntityId(entity), detail] as const];
        }),
      );

      /** Map from canonical entity ref to the loaded entity. */
      const entityById = new Map(
        loadResult.entities.flatMap((entity) => {
          return [[getEntityId(entity), entity] as const];
        }),
      );

      const addedTraceRefs: AddedTraceRef[] = [];

      // For every doc that declares ea-artifacts, ensure the referenced
      // artifact has a traceRef pointing back at the doc.
      for (const doc of scanResult.docs) {
        for (const artifactId of doc.artifactIds) {
          const entity = entityById.get(artifactId);
          if (!entity) continue;

          const existing = getEntityTraceRefs(entity).some(
            (ref) => ref.path === doc.relativePath
          );
          if (existing) continue;

          addedTraceRefs.push({
            artifactId: getEntityId(entity),
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
        for (const entity of loadResult.entities) {
          const artifactId = getEntityId(entity);

          for (const ref of getEntityTraceRefs(entity)) {
            // Skip URLs — only handle local file paths.
            if (/^https?:\/\//.test(ref.path)) continue;

            // Only inject frontmatter into Markdown files.
            const ext = extname(ref.path).toLowerCase();
            if (ext !== ".md" && ext !== ".markdown") continue;

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
            if (existingIds.includes(artifactId)) continue;

            addedFrontmatterRefs.push({
              docPath: ref.path,
              artifactId,
            });

            if (!options.dryRun) {
              const updatedFm = {
                ...parsed.frontmatter,
                eaArtifacts: [...existingIds, artifactId],
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
function writeArtifactTraceRefs(filePath: string, refs: AddedTraceRef[]): void {
  appendTraceRefs(
    filePath,
    refs.map((ref) => ({
      path: ref.docPath,
      role: ref.role,
    })),
  );
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

/**
 * Insert annotation comments into source files.
 * Modifies files in-place, inserting annotations at the correct line positions.
 * Returns number of files modified.
 */
function writeAnnotations(cwd: string, suggestions: AnnotationSuggestion[]): number {
  // Group by file
  const byFile = new Map<string, AnnotationSuggestion[]>();
  for (const s of suggestions) {
    let list = byFile.get(s.file);
    if (!list) {
      list = [];
      byFile.set(s.file, list);
    }
    list.push(s);
  }

  let filesModified = 0;

  for (const [file, fileSuggestions] of byFile) {
    const absPath = resolve(cwd, file);
    let content: string;
    try {
      content = readFileSync(absPath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");

    // Sort suggestions by line number descending (insert from bottom to avoid offset shifts)
    const sorted = [...fileSuggestions].sort((a, b) => b.line - a.line);

    for (const s of sorted) {
      // Insert @anchored-spec:end after the end line
      const endIdx = Math.min(s.endLine, lines.length);
      lines.splice(endIdx, 0, "", s.endAnnotation);

      // Insert annotation before the start line (0-indexed: line-1)
      const startIdx = Math.max(s.line - 1, 0);
      lines.splice(startIdx, 0, s.annotation, "");
    }

    writeFileSync(absPath, lines.join("\n"), "utf-8");
    filesModified++;
  }

  return filesModified;
}
