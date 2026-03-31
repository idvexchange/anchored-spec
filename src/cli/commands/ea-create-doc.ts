/**
 * anchored-spec create-doc
 *
 * Create a markdown document pre-linked to EA artifacts via frontmatter.
 * Optionally updates referenced artifacts' traceRefs to point back at the
 * new document.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { Command } from "commander";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import chalk from "chalk";
import { EaRoot } from "../../ea/loader.js";
import { resolveEaConfig } from "../../ea/config.js";
import type { EaTraceRef } from "../../ea/types.js";
import { serializeFrontmatter } from "../../ea/docs/frontmatter.js";
import type { DocFrontmatter } from "../../ea/docs/frontmatter.js";
import { CliError } from "../errors.js";

const VALID_TYPES = ["spec", "architecture", "guide", "adr", "runbook"] as const;
const VALID_STATUSES = ["current", "draft", "deprecated", "superseded"] as const;

/** Convert a title string to a kebab-case filename slug. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Map document type to the appropriate traceRef role. */
function docTypeToRole(type: string): string {
  switch (type) {
    case "spec":
      return "specification";
    case "architecture":
      return "context";
    case "guide":
      return "context";
    case "adr":
      return "rationale";
    case "runbook":
      return "context";
    default:
      return "context";
  }
}

/** Parse a comma-separated audience string into an array. */
function parseAudience(audience: string): string[] {
  return audience.split(",").map((s) => s.trim());
}

/** Result of linking a single artifact. */
interface ArtifactLinkResult {
  id: string;
  linked: boolean;
  reason?: string;
}

export function eaCreateDocCommand(): Command {
  return new Command("create-doc")
    .description(
      "Create a markdown document pre-linked to EA artifacts via frontmatter"
    )
    .requiredOption("--title <title>", "Document title")
    .option(
      "--type <type>",
      `Document type: ${VALID_TYPES.join(", ")}`,
      "spec"
    )
    .option(
      "--status <status>",
      `Document status: ${VALID_STATUSES.join(", ")}`,
      "draft"
    )
    .option(
      "--artifacts <ids...>",
      "EA artifact IDs to link (space-separated)"
    )
    .option("--dir <path>", "Output directory", "docs")
    .option("--audience <audience>", "Target audience (comma-separated)", "agent, developer")
    .option("--domain <domain>", "EA domain(s) (comma-separated)")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--link-back", "Update referenced artifacts' traceRefs", true)
    .option("--no-link-back", "Skip updating artifact traceRefs")
    .option("--json", "Output result as JSON")
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

      // ── Validate inputs ───────────────────────────────────────────
      const type = options.type as string;
      if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
        throw new CliError(
          `Invalid document type "${type}". Must be one of: ${VALID_TYPES.join(", ")}`,
          1
        );
      }

      const status = options.status as string;
      if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
        throw new CliError(
          `Invalid document status "${status}". Must be one of: ${VALID_STATUSES.join(", ")}`,
          1
        );
      }

      const title = options.title as string;
      const artifactIds: string[] = options.artifacts ?? [];

      // ── Load artifacts ────────────────────────────────────────────
      const loadResult = await root.loadArtifacts();

      const detailById = new Map(
        loadResult.details
          .filter((d) => d.artifact)
          .map((d) => [d.artifact!.id, d])
      );

      const artifactById = new Map(
        loadResult.artifacts.map((a) => [a.id, a])
      );

      // Warn about missing artifact IDs (but keep them in frontmatter).
      const missingIds: string[] = [];
      for (const id of artifactIds) {
        if (!artifactById.has(id)) {
          missingIds.push(id);
        }
      }

      // ── Generate filename and output path ─────────────────────────
      const slug = slugify(title);
      const filename = `${slug}.md`;
      const dir = resolve(cwd, options.dir as string);
      const filePath = join(dir, filename);

      if (existsSync(filePath)) {
        throw new CliError(
          `Document already exists: ${relative(cwd, filePath)}`,
          1
        );
      }

      // ── Build frontmatter ─────────────────────────────────────────
      const frontmatter: DocFrontmatter = {
        type: type as DocFrontmatter["type"],
        status: status as DocFrontmatter["status"],
        audience: parseAudience(options.audience as string),
        domain: options.domain
          ? (options.domain as string).split(",").map((s) => s.trim())
          : undefined,
        eaArtifacts: artifactIds.length > 0 ? artifactIds : undefined,
      };

      // ── Build markdown body ───────────────────────────────────────
      const bodyLines: string[] = [];
      bodyLines.push(`# ${title}`);
      bodyLines.push("");
      bodyLines.push("> TODO: Document the specification for these artifacts.");
      bodyLines.push("");

      if (artifactIds.length > 0) {
        bodyLines.push("## Referenced Artifacts");
        bodyLines.push("");
        for (const id of artifactIds) {
          const artifact = artifactById.get(id);
          if (artifact) {
            bodyLines.push(
              `- **${id}** (${artifact.kind}) — ${artifact.title}`
            );
          } else {
            bodyLines.push(`- **${id}**`);
          }
        }
        bodyLines.push("");
      }

      const serializedFm = serializeFrontmatter(frontmatter);
      const content = serializedFm + "\n\n" + bodyLines.join("\n");

      // ── Write the document ────────────────────────────────────────
      mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, content, "utf-8");

      const relativeDocPath = relative(cwd, filePath);

      // ── Link back: add traceRefs to referenced artifacts ──────────
      const linkResults: ArtifactLinkResult[] = [];

      if (options.linkBack && artifactIds.length > 0) {
        const role = docTypeToRole(type);

        for (const id of artifactIds) {
          const detail = detailById.get(id);
          if (!detail) {
            linkResults.push({ id, linked: false, reason: "not found" });
            continue;
          }

          try {
            writeArtifactTraceRef(detail.filePath, relativeDocPath, role);
            linkResults.push({ id, linked: true });
          } catch (err) {
            linkResults.push({
              id,
              linked: false,
              reason: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // ── Output ────────────────────────────────────────────────────
      if (options.json) {
        const output = {
          docPath: relativeDocPath,
          frontmatter,
          linkedArtifacts: artifactIds.map((id) => {
            const result = linkResults.find((r) => r.id === id);
            return {
              id,
              linked: result?.linked ?? false,
            };
          }),
        };
        process.stdout.write(JSON.stringify(output, null, 2) + "\n");
      } else {
        printHumanOutput(
          relativeDocPath,
          frontmatter,
          linkResults,
          missingIds
        );
      }
    });
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Read an artifact file, append a new traceRef entry, and write it back
 * in the same format (JSON or YAML).
 */
function writeArtifactTraceRef(
  filePath: string,
  docPath: string,
  role: string
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

  const alreadyPresent = (data.traceRefs as EaTraceRef[]).some(
    (existing) => existing.path === docPath
  );
  if (alreadyPresent) return;

  data.traceRefs.push({ path: docPath, role });

  if (isJson) {
    writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  } else {
    writeFileSync(filePath, stringifyYaml(data), "utf-8");
  }
}

/** Print human-readable create-doc report to stdout. */
function printHumanOutput(
  docPath: string,
  frontmatter: DocFrontmatter,
  linkResults: ArtifactLinkResult[],
  missingIds: string[]
): void {
  console.log(chalk.green(`\nCreated: ${docPath}\n`));

  const audience = frontmatter.audience?.join(", ") ?? "";
  console.log(chalk.dim("  Frontmatter:"));
  console.log(
    chalk.dim(
      `    type: ${frontmatter.type} | status: ${frontmatter.status} | audience: ${audience}`
    )
  );

  if (linkResults.length > 0) {
    console.log("");
    console.log(chalk.dim("  Linked artifacts:"));
    for (const result of linkResults) {
      if (result.linked) {
        console.log(chalk.green(`    ✅ ${result.id} — traceRef added`));
      } else {
        console.log(
          chalk.yellow(
            `    ⚠ ${result.id} — ${result.reason ?? "skipped link-back"}`
          )
        );
      }
    }

    // Also warn about IDs that weren't found at all.
    for (const id of missingIds) {
      if (!linkResults.some((r) => r.id === id)) {
        console.log(
          chalk.yellow(`    ⚠ ${id} — not found, skipped link-back`)
        );
      }
    }
  }

  const linkedCount = linkResults.filter((r) => r.linked).length;
  console.log(
    chalk.dim(
      `\n  1 document created, ${linkedCount} artifact${linkedCount !== 1 ? "s" : ""} updated`
    )
  );
}
