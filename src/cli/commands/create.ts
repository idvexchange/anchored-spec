/**
 * anchored-spec create <type>
 *
 * Create spec artifacts: requirement, change, decision.
 * Generates JSON files with proper IDs and structure.
 */

import { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { minimatch } from "minimatch";
import { SpecRoot, resolveConfig } from "../../core/index.js";
import { runHooks } from "../../core/hooks.js";
import { CliError } from "../errors.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const SLUG_PATTERN_SHORT = /^[a-z0-9]$/;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function validateSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug) && !SLUG_PATTERN_SHORT.test(slug)) {
    throw new CliError(
      `Error: Invalid slug "${slug}". Must contain only lowercase letters, numbers, and hyphens (e.g., "add-login").`,
    );
  }
  if (slug.length > 60) {
    throw new CliError(`Error: Slug "${slug}" is too long (max 60 characters).`);
  }
}

function validateGlobs(patterns: string[]): void {
  for (const pattern of patterns) {
    try {
      minimatch("test.ts", pattern);
    } catch {
      throw new CliError(`Error: Invalid glob pattern "${pattern}" in --scope.`);
    }
    if (/[^\\][[{](?![^[\]]*\]|[^{}]*\})/.test(pattern)) {
      // Don't over-validate — minimatch handles most cases.
      // Just reject obviously broken brackets as a safety net.
    }
  }
}

// ─── ID Generation ─────────────────────────────────────────────────────────────

function getNextReqId(requirementsDir: string): string {
  if (!existsSync(requirementsDir)) return "REQ-1";
  const files = readdirSync(requirementsDir).filter((f) => f.match(/^REQ-\d+\.json$/));
  const ids = files.map((f) => parseInt(f.replace("REQ-", "").replace(".json", ""), 10));
  const max = ids.length > 0 ? Math.max(...ids) : 0;
  return `REQ-${max + 1}`;
}

function getNextAdrId(decisionsDir: string): string {
  if (!existsSync(decisionsDir)) return "ADR-1";
  const files = readdirSync(decisionsDir).filter((f) => f.match(/^ADR-\d+\.json$/));
  const ids = files.map((f) => parseInt(f.replace("ADR-", "").replace(".json", ""), 10));
  const max = ids.length > 0 ? Math.max(...ids) : 0;
  return `ADR-${max + 1}`;
}

function getNextChangeId(changesDir: string, slug: string): string {
  const year = new Date().getFullYear();
  if (!existsSync(changesDir)) return `CHG-${year}-0001-${slug}`;

  const entries = readdirSync(changesDir).filter((e) =>
    e.match(new RegExp(`^CHG-${year}-\\d{4}-`))
  );
  const seqNums = entries.map((e) => {
    const match = e.match(/CHG-\d{4}-(\d{4})-/);
    return match?.[1] ? parseInt(match[1], 10) : 0;
  });
  const max = seqNums.length > 0 ? Math.max(...seqNums) : 0;
  return `CHG-${year}-${String(max + 1).padStart(4, "0")}-${slug}`;
}

// ─── Create Command ────────────────────────────────────────────────────────────

export function createCommand(): Command {
  const cmd = new Command("create")
    .description("Create a new spec artifact (requirement, change, or decision)")
    .option("--no-hooks", "Skip lifecycle hooks");

  // ─── create requirement ────────────────────────────────────────────────────

  cmd
    .command("requirement")
    .description("Create a new requirement")
    .requiredOption("--title <title>", "Requirement title")
    .option("--priority <priority>", "Priority (must, should, could, wont)", "should")
    .option("--owner <owner>", "Owner", "team")
    .option("--dry-run", "Show what would be created without writing")
    .action((options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);
      const dryRun = options.dryRun as boolean;

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
      }

      const id = getNextReqId(spec.requirementsDir);
      const requirement = {
        $schema: "../schemas/requirement.schema.json",
        id,
        title: options.title,
        summary: `TODO: Describe what ${options.title} does in behavioral terms.`,
        priority: options.priority,
        status: "draft",
        behaviorStatements: [
          {
            id: "BS-1",
            text: "TODO: When <trigger>, the system shall <response>.",
            format: "EARS",
            trigger: "TODO: describe the triggering event",
            response: "TODO: describe the observable system response",
          },
        ],
        traceRefs: [],
        semanticRefs: {
          interfaces: [],
          routes: [],
          errorCodes: [],
          symbols: [],
        },
        verification: {
          requiredTestKinds: ["unit"],
          coverageStatus: "none",
          testFiles: [],
          testRefs: [],
        },
        implementation: {
          activeChanges: [],
          shippedBy: null,
          deprecatedBy: null,
        },
        owners: [options.owner],
        tags: [],
        supersedes: null,
        supersededBy: null,
        docSource: "canonical-json",
        schemaVersion: "0.2.0",
      };

      const filePath = join(spec.requirementsDir, `${id}.json`);
      if (!dryRun) {
        writeFileSync(filePath, JSON.stringify(requirement, null, 2) + "\n");
      }

      console.log(chalk.green(`${dryRun ? "→" : "✓"} ${dryRun ? "Would create" : "Created"} ${id}: ${options.title}`));
      console.log(chalk.dim(`  File: ${filePath}`));
      console.log(chalk.dim(`\nNext: Edit the behavior statements to describe observable behavior.`));
      console.log(chalk.dim(`  Tip: Use EARS notation — "When <event>, the system shall <response>"`));

      if (cmd.opts().hooks !== false) {
        const config = resolveConfig(cwd);
        runHooks("post-create:requirement", config, {
          ANCHORED_SPEC_EVENT: "post-create",
          ANCHORED_SPEC_ID: id,
          ANCHORED_SPEC_TYPE: "requirement",
        }, { cwd, dryRun });
      }
    });

  // ─── create change ─────────────────────────────────────────────────────────

  cmd
    .command("change")
    .description("Create a new change record")
    .requiredOption("--title <title>", "Change title")
    .requiredOption("--type <type>", "Change type (feature, fix, refactor, chore)")
    .option("--slug <slug>", "URL-safe short name (auto-derived from title if omitted)")
    .option("--scope <globs...>", "Glob patterns for files in scope", ["src/**"])
    .option("--owner <owner>", "Owner", "team")
    .option("--dry-run", "Show what would be created without writing")
    .action((options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);
      const dryRun = options.dryRun as boolean;

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
      }

      const validTypes = ["feature", "fix", "refactor", "chore", ...(spec.config.customChangeTypes ?? [])];
      if (!validTypes.includes(options.type)) {
        throw new CliError(`Error: Invalid type "${options.type}". Must be one of: ${validTypes.join(", ")}`);
      }

      // Auto-derive slug from title if not provided
      const slug: string = options.slug ? (options.slug as string) : slugify(options.title as string);
      validateSlug(slug);
      validateGlobs(options.scope as string[]);

      const id = getNextChangeId(spec.changesDir, slug);
      const today = new Date().toISOString().split("T")[0];

      // Resolve workflow variant from policy
      let workflowVariant: string | undefined;
      const policy = spec.loadWorkflowPolicy();
      if (policy && options.type !== "chore") {
        const variant = policy.workflowVariants.find((v) =>
          v.defaultTypes.includes(options.type)
        );
        workflowVariant = variant?.id;
      }

      const isChore = options.type === "chore";
      const change: Record<string, unknown> = {
        $schema: "../../schemas/change.schema.json",
        id,
        title: options.title,
        slug,
        type: options.type,
        phase: isChore ? "implementation" : "design",
        status: "active",
        scope: {
          include: options.scope,
          exclude: [],
        },
        branch: null,
        timestamps: {
          createdAt: today,
        },
        owners: [options.owner],
        docSource: "canonical-json",
        schemaVersion: "0.2.0",
      };

      if (!isChore) {
        change.workflowVariant = workflowVariant;
        change.requirements = [];
        change.designDoc = null;
        change.implementationPlan = null;
      }

      if (options.type === "fix") {
        change.bugfixSpec = {
          currentBehavior: "TODO: describe current (broken) behavior",
          expectedBehavior: "TODO: describe expected (correct) behavior",
          rootCauseHypothesis: "TODO: hypothesis about root cause",
          regressionRisk: "TODO: areas at risk of regression",
        };
      }

      // Create change directory and file
      const changeDir = join(spec.changesDir, id);
      if (!dryRun) {
        mkdirSync(changeDir, { recursive: true });
      }

      const filePath = join(changeDir, "change.json");
      if (!dryRun) {
        writeFileSync(filePath, JSON.stringify(change, null, 2) + "\n");

        // Generate verification sidecar
        const verification = {
          $schema: "../../schemas/change-verification.schema.json",
          changeId: id,
          commands: [
            { name: "verify", command: "anchored-spec verify --strict", required: true, status: "pending" },
            ...(isChore
              ? []
              : [{ name: "drift", command: "anchored-spec drift --fail-on-missing", required: true, status: "pending" }]),
          ],
          driftChecks: isChore ? [] : ["semantic"],
          evidence: { collected: false, collectedAt: null },
        };
        writeFileSync(
          join(changeDir, "verification.json"),
          JSON.stringify(verification, null, 2) + "\n",
        );
      }

      console.log(chalk.green(`${dryRun ? "→" : "✓"} ${dryRun ? "Would create" : "Created"} ${id}: ${options.title}`));
      console.log(chalk.dim(`  File: ${filePath}`));
      console.log(chalk.dim(`  Type: ${options.type} | Variant: ${workflowVariant ?? "chore"}`));

      if (!isChore) {
        console.log(chalk.dim(`\nNext steps:`));
        console.log(chalk.dim(`  1. Link requirements:  Add REQ IDs to "requirements" array`));
        console.log(chalk.dim(`  2. Create design doc:  Add design rationale`));
        console.log(chalk.dim(`  3. Start work:         Update phase to "implementation"`));
      }

      if (cmd.opts().hooks !== false) {
        const config = resolveConfig(cwd);
        runHooks("post-create:change", config, {
          ANCHORED_SPEC_EVENT: "post-create",
          ANCHORED_SPEC_ID: id,
          ANCHORED_SPEC_TYPE: "change",
        }, { cwd, dryRun });
      }
    });

  // ─── create decision ───────────────────────────────────────────────────────

  cmd
    .command("decision")
    .description("Create a new architecture decision record (ADR)")
    .requiredOption("--title <title>", "Decision title")
    .option("--slug <slug>", "URL-safe short name (auto-derived from title if omitted)")
    .option("--domain <domain>", "Domain category")
    .option("--dry-run", "Show what would be created without writing")
    .action((options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);
      const dryRun = options.dryRun as boolean;

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
      }

      const adrSlug: string = options.slug ? (options.slug as string) : slugify(options.title as string);
      validateSlug(adrSlug);

      const id = getNextAdrId(spec.decisionsDir);
      const decision = {
        $schema: "../schemas/decision.schema.json",
        id,
        title: options.title,
        slug: adrSlug,
        status: "accepted",
        domain: options.domain ?? null,
        decision: "TODO: One clear sentence describing the decision.",
        context: "TODO: Why was this decision needed? What problem does it solve?",
        rationale: "TODO: Why was this alternative chosen over others?",
        alternatives: [
          {
            name: "TODO: Alternative 1",
            verdict: "rejected",
            reason: "TODO: Why rejected",
          },
        ],
        implications: null,
        relatedRequirements: [],
        supersedes: null,
        supersededBy: null,
        docSource: "canonical-json",
        schemaVersion: "0.2.0",
      };

      const filePath = join(spec.decisionsDir, `${id}.json`);
      if (!dryRun) {
        writeFileSync(filePath, JSON.stringify(decision, null, 2) + "\n");
      }

      console.log(chalk.green(`${dryRun ? "→" : "✓"} ${dryRun ? "Would create" : "Created"} ${id}: ${options.title}`));
      console.log(chalk.dim(`  File: ${filePath}`));
      console.log(chalk.dim(`\nNext: Fill in decision, context, rationale, and alternatives.`));

      if (cmd.opts().hooks !== false) {
        const config = resolveConfig(cwd);
        runHooks("post-create:decision", config, {
          ANCHORED_SPEC_EVENT: "post-create",
          ANCHORED_SPEC_ID: id,
          ANCHORED_SPEC_TYPE: "decision",
        }, { cwd, dryRun });
      }
    });

  return cmd;
}
