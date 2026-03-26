/**
 * anchored-spec import — Brownfield import from markdown
 *
 * Scans existing markdown ADRs and requirement docs, converts them
 * to anchored-spec JSON artifacts. Best-effort parsing with human review.
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { join, basename, extname, relative } from "node:path";
import { SpecRoot, resolveConfig } from "../../core/loader.js";
import { CliError } from "../errors.js";

// ─── ADR Parsing ────────────────────────────────────────────────────────────────

interface ParsedADR {
  id: string;
  title: string;
  status: "accepted" | "superseded" | "deprecated";
  context: string;
  decision: string;
  rationale: string;
  consequences: string;
}

function parseMarkdownADR(content: string, filename: string): ParsedADR | null {
  const lines = content.split("\n");

  // Extract title from first heading
  const titleLine = lines.find((l) => /^#\s+/.test(l));
  if (!titleLine) return null;
  let title = titleLine.replace(/^#+\s+/, "").trim();

  // Try to extract ADR number from title or filename
  let adrNum: string;
  const titleMatch = title.match(/^(?:ADR[-\s]?)(\d+)[:.]\s*/i);
  const fileMatch = filename.match(/(\d+)/);
  if (titleMatch) {
    adrNum = titleMatch[1]!;
    title = title.replace(/^(?:ADR[-\s]?)(\d+)[:.]\s*/i, "").trim();
  } else if (fileMatch) {
    adrNum = fileMatch[1]!;
  } else {
    adrNum = String(Date.now()).slice(-4);
  }

  const id = `ADR-${adrNum.padStart(2, "0")}`;

  // Parse sections
  const sections = extractSections(lines);

  // Determine status
  const statusText = (sections.status ?? "").toLowerCase();
  let status: "accepted" | "superseded" | "deprecated" = "accepted";
  if (statusText.includes("superseded")) status = "superseded";
  else if (statusText.includes("deprecated")) status = "deprecated";

  return {
    id,
    title: title || basename(filename, extname(filename)),
    status,
    context: sections.context ?? "",
    decision: sections.decision ?? "",
    rationale: sections.rationale ?? sections.consequences ?? "",
    consequences: sections.consequences ?? "",
  };
}

function extractSections(lines: string[]): Record<string, string> {
  const sections: Record<string, string> = {};
  let currentSection = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{2,}\s+(.+)/);
    if (headingMatch) {
      if (currentSection) {
        sections[currentSection] = currentContent.join("\n").trim();
      }
      currentSection = headingMatch[1]!.toLowerCase().trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  if (currentSection) {
    sections[currentSection] = currentContent.join("\n").trim();
  }

  return sections;
}

// ─── Requirement Parsing ────────────────────────────────────────────────────────

interface ParsedReq {
  id: string;
  title: string;
  summary: string;
  status: string;
}

function parseMarkdownRequirements(content: string): ParsedReq[] {
  const reqs: ParsedReq[] = [];
  const lines = content.split("\n");
  let reqCounter = 1;

  for (const line of lines) {
    // Match patterns like: "- REQ-1: Title" or "1. Title" or "## REQ-1: Title"
    const reqMatch = line.match(/(?:^[-*]\s+|^\d+\.\s+|^#{2,}\s+)(?:REQ[-_]?(\d+)[:.]\s*)?(.+)/);
    if (reqMatch) {
      const num = reqMatch[1] ?? String(reqCounter);
      const title = reqMatch[2]!.trim();
      if (title.length >= 5) {
        reqs.push({
          id: `REQ-${num}`,
          title,
          summary: title,
          status: "draft",
        });
        reqCounter++;
      }
    }
  }

  return reqs;
}

// ─── Command ────────────────────────────────────────────────────────────────────

export function importCommand(): Command {
  const cmd = new Command("import")
    .description("Import existing markdown ADRs or requirements into anchored-spec format")
    .argument("<path>", "Directory containing markdown files to import")
    .option("--type <type>", "Type of artifacts to import", "auto")
    .option("--dry-run", "Preview without writing files")
    .option("--json", "Output results as JSON")
    .action(
      async (
        inputPath: string,
        opts: { type: string; dryRun?: boolean; json?: boolean },
      ) => {
        const projectRoot = process.cwd();
        const config = resolveConfig(projectRoot);
        const spec = new SpecRoot(projectRoot, config);

        if (!spec.isInitialized()) {
          throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
        }

        const absPath = join(projectRoot, inputPath);
        if (!existsSync(absPath)) {
          throw new CliError(`Error: Path not found: ${absPath}`);
        }

        // Find markdown files
        const mdFiles = findMarkdownFiles(absPath);
        if (mdFiles.length === 0) {
          console.error(chalk.yellow("No markdown files found."));
          return;
        }

        const results: { file: string; type: string; artifacts: unknown[] }[] = [];

        for (const file of mdFiles) {
          const content = readFileSync(file, "utf-8");
          const relFile = relative(projectRoot, file);
          const lower = content.toLowerCase();

          const isADR =
            opts.type === "decision" ||
            (opts.type === "auto" &&
              (lower.includes("## context") ||
                lower.includes("## decision") ||
                basename(file).toLowerCase().includes("adr")));

          if (isADR) {
            const parsed = parseMarkdownADR(content, basename(file));
            if (parsed) {
              const artifact = toDecisionJSON(parsed);
              results.push({ file: relFile, type: "decision", artifacts: [artifact] });

              if (!opts.dryRun) {
                const outPath = join(spec.decisionsDir, `${parsed.id}.json`);
                mkdirSync(spec.decisionsDir, { recursive: true });
                writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
              }
            }
          } else {
            // Try to parse as requirements
            const parsed = parseMarkdownRequirements(content);
            if (parsed.length > 0) {
              const artifacts = parsed.map(toRequirementJSON);
              results.push({ file: relFile, type: "requirement", artifacts });

              if (!opts.dryRun) {
                mkdirSync(spec.requirementsDir, { recursive: true });
                for (const [i, artifact] of artifacts.entries()) {
                  const id = (artifact as { id: string }).id;
                  const outPath = join(spec.requirementsDir, `${id}.json`);
                  if (!existsSync(outPath)) {
                    writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
                  }
                }
              }
            }
          }
        }

        if (opts.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        // Pretty print
        console.log(chalk.bold("\n📥 Import Results\n"));
        for (const r of results) {
          const label = r.type === "decision" ? "ADR" : "REQ";
          console.log(
            `  ${chalk.dim(r.file)} → ${chalk.cyan(`${r.artifacts.length} ${label}(s)`)}` +
            (opts.dryRun ? chalk.yellow(" (dry-run)") : chalk.green(" ✓")),
          );
        }

        const totalArtifacts = results.reduce((n, r) => n + r.artifacts.length, 0);
        console.log(
          `\n  ${chalk.bold("Total:")} ${totalArtifacts} artifact(s) from ${results.length} file(s)` +
          (opts.dryRun ? chalk.yellow(" — rerun without --dry-run to write") : ""),
        );
        console.log();
      },
    );

  return cmd;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function findMarkdownFiles(dir: string): string[] {
  const stat = statSync(dir);
  if (stat.isFile() && extname(dir) === ".md") return [dir];
  if (!stat.isDirectory()) return [];

  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isFile() && extname(entry) === ".md") {
      files.push(full);
    } else if (s.isDirectory()) {
      files.push(...findMarkdownFiles(full));
    }
  }
  return files;
}

function toDecisionJSON(parsed: ParsedADR): object {
  return {
    id: parsed.id,
    title: parsed.title,
    slug: slugify(parsed.title),
    status: parsed.status,
    domain: "",
    decision: parsed.decision || "TODO: Fill in decision",
    context: parsed.context || "TODO: Fill in context",
    rationale: parsed.rationale || "TODO: Fill in rationale",
    alternatives: [],
    relatedRequirements: [],
    docSource: "canonical-json",
  };
}

function toRequirementJSON(parsed: ParsedReq): object {
  return {
    id: parsed.id,
    title: parsed.title,
    summary: parsed.summary,
    priority: "should",
    status: "draft",
    behaviorStatements: [
      {
        id: "BS-01",
        text: `When ${parsed.title.toLowerCase()}, the system shall ${parsed.summary.toLowerCase()}.`,
        format: "EARS",
        response: `The system shall ${parsed.summary.toLowerCase()}.`,
      },
    ],
    owners: ["TODO"],
    docSource: "canonical-json",
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
