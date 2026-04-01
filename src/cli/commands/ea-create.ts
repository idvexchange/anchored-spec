/**
 * anchored-spec create <kind>
 *
 * Create a new Backstage-aligned entity using the project's configured
 * storage mode (manifest or inline).
 */

import { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { resolveConfigV1 } from "../../ea/config.js";
import type { AnchoredSpecConfigV1 } from "../../ea/config.js";
import { BACKSTAGE_KIND_REGISTRY, mapLegacyKind } from "../../ea/backstage/kind-mapping.js";
import { writeEntity } from "../../ea/backstage/entity-writer.js";
import type { BackstageEntity } from "../../ea/backstage/types.js";
import { CliError } from "../errors.js";

export function eaCreateCommand(): Command {
  return new Command("create")
    .description("Create a new EA artifact")
    .argument("[kind]", "Artifact kind (e.g., application, service, environment)")
    .option("--title <title>", "Human-readable title")
    .option("--id <id>", "Entity name slug")
    .option("--owner <owner>", "Owner team or person", "your-team")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("-i, --interactive", "Interactive wizard — prompts for kind, title, owner, and relations")
    .action(async (kind: string | undefined, options) => {
      if (options.interactive) {
        return runInteractiveCreate(options);
      }

      if (!kind) {
        throw new CliError("Missing required argument: kind. Use --interactive for a wizard.", 2);
      }
      if (!options.title) {
        throw new CliError("Missing required option: --title. Use --interactive for a wizard.", 2);
      }

      return createArtifact(kind, options.title, options);
    });
}

// ── Core creation logic ─────────────────────────────────────────────────────────

interface CreateOptions {
  id?: string;
  owner?: string;
  rootDir?: string;
  relations?: Array<{ target: string; type: string }>;
}

function createArtifact(kind: string, title: string, options: CreateOptions): void {
  const cwd = process.cwd();
  const rootDir = (options.rootDir as string) ?? "docs";
  const v1Config = loadProjectConfig(cwd, rootDir);
  createBackstageEntity(kind, title, options, v1Config, cwd);
}

// ── Interactive wizard ──────────────────────────────────────────────────────────

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function runInteractiveCreate(baseOptions: CreateOptions): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log(chalk.blue("🏛  Anchored Spec — Interactive Artifact Wizard\n"));

    const kinds = BACKSTAGE_KIND_REGISTRY.map((e) => e.legacyKind);
    const defaultKind = kinds[0]!;
    console.log(chalk.dim("Kinds: " + kinds.join(", ")));
    const kind = await prompt(rl, chalk.cyan("Kind? ") + chalk.dim(`(${defaultKind}) `));
    const resolvedKind = kind || defaultKind;

    // 2. Title
    const title = await prompt(rl, chalk.cyan("Title? "));
    if (!title) {
      throw new CliError("Title is required.", 2);
    }

    // 3. Owner
    const ownerInput = await prompt(rl, chalk.cyan("Owner? ") + chalk.dim("(your-team) "));
    const owner = ownerInput || "your-team";

    // 4. Relations (optional, repeating)
    const relations: Array<{ target: string; type: string }> = [];
    console.log(chalk.dim("\nAdd relations (leave target empty to skip/finish):"));
    while (true) {
      const target = await prompt(rl, chalk.cyan("  Related artifact ID? "));
      if (!target) break;
      const relType = await prompt(rl, chalk.cyan("  Relation type? ") + chalk.dim("(uses) "));
      relations.push({ target, type: relType || "uses" });
    }

    console.log("");

    createArtifact(resolvedKind, title, {
      ...baseOptions,
      owner,
      relations: relations.length > 0 ? relations : undefined,
    });
  } finally {
    rl.close();
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 40);
}

// ─── Backstage Mode ─────────────────────────────────────────────────────────────

function loadProjectConfig(
  cwd: string,
  rootDir: string,
): AnchoredSpecConfigV1 {
  const configPath = join(cwd, ".anchored-spec", "config.json");
  if (!existsSync(configPath)) {
    return resolveConfigV1({ rootDir, entityMode: "manifest", manifestPath: "catalog-info.yaml" });
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8")) as Record<
      string,
      unknown
    >;
    return resolveConfigV1(raw as Partial<AnchoredSpecConfigV1>);
  } catch {
    throw new CliError("Malformed .anchored-spec/config.json", 1);
  }
}

function createBackstageEntity(
  kind: string,
  title: string,
  options: CreateOptions,
  config: AnchoredSpecConfigV1,
  cwd: string,
): void {
  const mapping = mapLegacyKind(kind);
  if (!mapping) {
    const validKinds = BACKSTAGE_KIND_REGISTRY.map((e) => e.legacyKind).join(", ");
    throw new CliError(
      `Unknown kind "${kind}". Valid kinds: ${validKinds}`,
      2,
    );
  }

  const entityName = ((options.id as string) ?? slugify(title))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const owner = (options.owner as string) ?? "your-team";

  const entity: BackstageEntity = {
    apiVersion: mapping.apiVersion,
    kind: mapping.backstageKind,
    metadata: {
      name: entityName,
      title,
      description: "TODO: Add description.",
      annotations: {
        "anchored-spec.dev/confidence": "0.5",
      },
      tags: [],
    },
    spec: {
      ...(mapping.specType ? { type: mapping.specType } : {}),
      lifecycle: "experimental",
      owner,
      ...(options.relations && options.relations.length > 0
        ? {
            dependsOn: options.relations
              .filter((r) => r.type === "depends-on")
              .map((r) => r.target),
          }
        : {}),
    },
  };

  // Synchronous wrapper for the async writeEntity
  writeEntity(entity, config, cwd)
      .then((result) => {
        console.log(chalk.green(`✓ Created ${result.filePath}`));
        console.log(chalk.dim(`  Kind:   ${mapping.backstageKind} (${kind})`));
        console.log(chalk.dim(`  Name:   ${entityName}`));
        console.log(chalk.dim(`  Mode:   ${config.entityMode ?? "manifest"}`));
    })
    .catch((err) => {
      throw new CliError(
        `Failed to write entity: ${(err as Error).message}`,
        1,
      );
    });
}
