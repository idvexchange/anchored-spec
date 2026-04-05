/**
 * anchored-spec create-doc
 *
 * Create a markdown document pre-linked to entities via frontmatter.
 * Optionally updates referenced entities' traceRefs to point back at the
 * new document.
 */

import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { EaRoot } from "../../ea/loader.js";
import {
  loadProjectConfig,
  getConfiguredDocSections,
  resolveDocOutputTarget,
} from "../../ea/config.js";
import { serializeFrontmatter } from "../../ea/docs/frontmatter.js";
import type { DocFrontmatter } from "../../ea/docs/frontmatter.js";
import {
  getEntityId,
  getEntityKind,
  getEntitySchema,
  getEntityTitle,
} from "../../ea/backstage/accessors.js";
import { buildEntityLookup, formatEntityHint } from "../entity-ref.js";
import { CliError } from "../errors.js";
import { appendTraceRefs } from "./trace-ref-writer.js";

const VALID_TYPES = ["spec", "architecture", "guide", "adr", "runbook"] as const;
const VALID_STATUSES = ["current", "draft", "deprecated", "superseded"] as const;
type CreateDocTraceRole = "specification" | "rationale" | "context";

/** Convert a title string to a kebab-case filename slug. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Map document type to the appropriate traceRef role. */
function docTypeToRole(type: string): CreateDocTraceRole {
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

/** Result of linking a single entity. */
interface EntityLinkResult {
  id: string;
  linked: boolean;
  reason?: string;
}

export function eaCreateDocCommand(): Command {
  return new Command("create-doc")
    .description(
      "Create a markdown document pre-linked to entities via frontmatter"
    )
    .option("--title <title>", "Document title")
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
      "--entities <refs...>",
      "Entity refs to link (space-separated)"
    )
    .option("--dir <path>", "Output directory")
    .option("--section <id>", "Configured docs section to write into")
    .option("--list-sections", "List configured docs sections and exit")
    .option("--audience <audience>", "Target audience (comma-separated)", "agent, developer")
    .option("--domain <domain>", "EA domain(s) (comma-separated)")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--link-back", "Update referenced entities' traceRefs", true)
    .option("--no-link-back", "Skip updating entity traceRefs")
    .option("--json", "Output result as JSON")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = loadProjectConfig(cwd, options.rootDir);
      const root = new EaRoot(cwd, eaConfig);

      if (options.listSections) {
        printConfiguredSections(eaConfig, options.json as boolean);
        return;
      }

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec init' first.",
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

      const title = options.title as string | undefined;
      if (!title) {
        throw new CliError("Missing required option: --title", 2);
      }
      const entityInputs: string[] = options.entities ?? [];

      // ── Load entities ─────────────────────────────────────────────
      const loadResult = await root.loadEntities();
      const detailById = new Map(
        loadResult.details.flatMap((detail) => {
          const entity = detail.entity ?? detail.authoredEntity;
          if (!entity) return [];
          return [[getEntityId(entity), detail] as const];
        }),
      );

      const entityById = new Map(
        loadResult.entities.flatMap((entity) => {
          return [[getEntityId(entity), entity] as const];
        }),
      );
      const lookup = buildEntityLookup(loadResult.entities);
      const entityIds = entityInputs.map((id) => {
        const entity = lookup.byInput.get(id);
        return entity ? getEntityId(entity) : id;
      });

      // Warn about missing entity refs (but keep them in frontmatter).
      const missingIds: string[] = [];
      for (const id of entityIds) {
        if (!entityById.has(id)) {
          missingIds.push(id);
        }
      }

      // ── Generate filename and output path ─────────────────────────
      const outputTarget = resolveDocOutputTarget(eaConfig, {
        dir: options.dir as string | undefined,
        section: options.section as string | undefined,
        docType: type,
      });
      if (!outputTarget) {
        throw new CliError(
          "No output section could be resolved. Provide --dir, provide --section, or configure docs.templates for this document type.",
          1,
        );
      }

      const slug = slugify(title);
      const filename = `${slug}.md`;
      const dir = resolve(cwd, outputTarget.dir);
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
        eaEntities: entityIds.length > 0 ? entityIds : undefined,
      };

      // ── Build markdown body ───────────────────────────────────────
      const bodyLines: string[] = [];
      bodyLines.push(`# ${title}`);
      bodyLines.push("");
      bodyLines.push("> TODO: Document the specification for these entities.");
      bodyLines.push("");

      if (entityIds.length > 0) {
        bodyLines.push("## Referenced Entities");
        bodyLines.push("");
        for (const id of entityIds) {
          const entity = entityById.get(id);
          if (entity) {
            bodyLines.push(
              `- **${formatEntityHint(entity)}** (${getEntityKind(entity)}/${getEntitySchema(entity)}) — ${getEntityTitle(entity)}`
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

      // ── Link back: add traceRefs to referenced entities ───────────
      const linkResults: EntityLinkResult[] = [];

      if (options.linkBack && entityIds.length > 0) {
        const role = docTypeToRole(type);

        for (const id of entityIds) {
          const detail = detailById.get(id);
          if (!detail) {
            linkResults.push({ id, linked: false, reason: "not found" });
            continue;
          }

          try {
            writeEntityTraceRef(detail.filePath, relativeDocPath, role);
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
          section: outputTarget.sectionId,
          frontmatter,
          linkedEntities: entityIds.map((id) => {
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
          outputTarget.sectionId,
          frontmatter,
          linkResults,
          missingIds
        );
      }
    });
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Read an entity file, append a new traceRef entry, and write it back
 * in the same format (JSON or YAML).
 */
function writeEntityTraceRef(
  filePath: string,
  docPath: string,
  role: CreateDocTraceRole,
): void {
  appendTraceRefs(filePath, [{ path: docPath, role }]);
}

/** Print human-readable create-doc report to stdout. */
function printHumanOutput(
  docPath: string,
  sectionId: string | undefined,
  frontmatter: DocFrontmatter,
  linkResults: EntityLinkResult[],
  missingIds: string[]
): void {
  console.log(chalk.green(`\nCreated: ${docPath}\n`));
  if (sectionId) {
    console.log(chalk.dim(`  Section: ${sectionId}`));
  }

  const audience = frontmatter.audience?.join(", ") ?? "";
  console.log(chalk.dim("  Frontmatter:"));
  console.log(
    chalk.dim(
      `    type: ${frontmatter.type} | status: ${frontmatter.status} | audience: ${audience}`
    )
  );

  if (linkResults.length > 0) {
    console.log("");
    console.log(chalk.dim("  Linked entities:"));
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
      `\n  1 document created, ${linkedCount} entit${linkedCount !== 1 ? "ies" : "y"} updated`
    )
  );
}

function printConfiguredSections(
  config: Parameters<typeof getConfiguredDocSections>[0],
  asJson: boolean,
): void {
  const sections = getConfiguredDocSections(config);

  if (asJson) {
    process.stdout.write(JSON.stringify({ sections }, null, 2) + "\n");
    return;
  }

  if (sections.length === 0) {
    console.log("No configured doc sections.");
    return;
  }

  console.log("Configured doc sections\n");
  for (const section of sections) {
    const meta = [section.kind, section.path].join(" | ");
    console.log(`${section.id} — ${section.title}`);
    console.log(`  ${meta}`);
  }
}
