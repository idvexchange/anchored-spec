/**
 * anchored-spec create
 *
 * Create a new Backstage-aligned entity using an explicit descriptor
 * selection and the project's configured storage mode.
 */

import { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { resolveConfigV1 } from "../../ea/config.js";
import type { AnchoredSpecConfigV1 } from "../../ea/config.js";
import {
  ENTITY_DESCRIPTOR_REGISTRY,
  getAllEntityKinds,
  type EntityDescriptor,
} from "../../ea/backstage/kind-mapping.js";
import { writeEntity } from "../../ea/backstage/entity-writer.js";
import type { BackstageEntity } from "../../ea/backstage/types.js";
import { CliError } from "../errors.js";

export function eaCreateCommand(): Command {
  return new Command("create")
    .description("Create a new Backstage entity descriptor")
    .option("--kind <kind>", "Backstage/custom entity kind (for example: Component, API, Resource)")
    .option("--type <type>", "Entity spec.type discriminator when required")
    .option("--schema <schema>", "Anchored-spec schema profile for ambiguous kind/type combinations")
    .option("--list", "List supported create descriptors and exit")
    .option("--title <title>", "Human-readable title")
    .option("--id <id>", "Entity name slug")
    .option("--owner <owner>", "Owner team or person", "your-team")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("-i, --interactive", "Interactive wizard for selecting a descriptor")
    .addHelpText("after", `
Examples:
  anchored-spec create --list
  anchored-spec create --kind Domain --title "Commerce" --owner group:default/platform
  anchored-spec create --kind System --title "Checkout Platform" --owner group:default/platform
  anchored-spec create --kind Component --type website --title "Orders App" --owner group:default/platform
  anchored-spec create --kind API --type openapi --title "Orders API" --owner group:default/platform

Use --list to see every supported kind/type/schema descriptor.`)
    .action(async (options: CreateOptions) => {
      if (options.list) {
        console.log(renderDescriptorCatalog());
        return;
      }

      if (options.interactive) {
        await runInteractiveCreate(options);
        return;
      }

      if (!options.kind) {
        throw new CliError("Missing required option: --kind. Use --list to see supported descriptors or --interactive for a wizard.", 2);
      }
      if (!options.title) {
        throw new CliError("Missing required option: --title. Use --list to see supported descriptors or --interactive for a wizard.", 2);
      }

      await createEntityDescriptor(options.title, options);
    });
}

interface CreateOptions {
  list?: boolean;
  kind?: string;
  type?: string;
  schema?: string;
  title?: string;
  id?: string;
  owner?: string;
  rootDir?: string;
  interactive?: boolean;
  relations?: Array<{ target: string; type: string }>;
}

async function createEntityDescriptor(title: string, options: CreateOptions): Promise<void> {
  const cwd = process.cwd();
  const rootDir = options.rootDir ?? "docs";
  const config = loadProjectConfig(cwd, rootDir);
  const descriptor = resolveDescriptorSelection(options);
  await createBackstageEntity(descriptor, title, options, config, cwd);
}

function formatDescriptorLabel(entry: EntityDescriptor): string {
  return `${entry.kind}${entry.specType ? ` / ${entry.specType}` : ""} [schema=${entry.schema}]`;
}

function renderDescriptorCatalog(): string {
  const byKind = new Map<string, EntityDescriptor[]>();

  for (const entry of ENTITY_DESCRIPTOR_REGISTRY) {
    const list = byKind.get(entry.kind) ?? [];
    list.push(entry);
    byKind.set(entry.kind, list);
  }

  const lines: string[] = [
    "Supported create descriptors",
    "",
    "Use --kind for the entity kind, --type for spec.type when needed, and --schema only when a kind/type pair is ambiguous.",
    "",
  ];

  for (const kind of [...byKind.keys()].sort()) {
    lines.push(`${kind}`);
    const entries = (byKind.get(kind) ?? []).slice().sort((a, b) => {
      const left = `${a.specType ?? ""}:${a.schema}`;
      const right = `${b.specType ?? ""}:${b.schema}`;
      return left.localeCompare(right);
    });

    for (const entry of entries) {
      lines.push(`  - ${formatDescriptorLabel(entry)}: ${entry.description}`);
    }
    lines.push("");
  }

  lines.push("Examples:");
  lines.push('  anchored-spec create --kind Domain --title "Commerce" --owner group:default/platform');
  lines.push('  anchored-spec create --kind System --title "Checkout Platform" --owner group:default/platform');
  lines.push('  anchored-spec create --kind Component --type website --title "Orders App" --owner group:default/platform');

  return lines.join("\n");
}

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function runInteractiveCreate(baseOptions: CreateOptions): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log(chalk.blue("Anchored Spec — Interactive Backstage Descriptor Wizard\n"));

    const kinds = getAllEntityKinds();
    const defaultKind = kinds[0]!;
    console.log(chalk.dim(`Kinds: ${kinds.join(", ")}`));
    const kindInput = await prompt(rl, chalk.cyan("Kind? ") + chalk.dim(`(${defaultKind}) `));
    const kind = kindInput || defaultKind;

    let candidates = ENTITY_DESCRIPTOR_REGISTRY.filter((entry) => entry.kind === kind);
    if (candidates.length === 0) {
      throw new CliError(`Unknown kind "${kind}". Valid kinds: ${kinds.join(", ")}. Use --list to inspect supported descriptors.`, 2);
    }

    const types = [...new Set(candidates.map((entry) => entry.specType).filter(Boolean))] as string[];
    const defaultType = types[0] ?? "";
    let type: string | undefined;
    if (types.length > 0) {
      console.log(chalk.dim(`Types: ${types.join(", ")}`));
      const typeInput = await prompt(rl, chalk.cyan("Type? ") + chalk.dim(defaultType ? `(${defaultType}) ` : "(leave blank) "));
      type = typeInput || defaultType || undefined;
      if (type) {
        candidates = candidates.filter((entry) => entry.specType === type);
      }
    }

    let schema: string | undefined;
    if (candidates.length > 1) {
      const schemas = candidates.map((entry) => entry.schema);
      const defaultSchema = schemas[0]!;
      console.log(chalk.dim(`Schemas: ${schemas.join(", ")}`));
      const schemaInput = await prompt(rl, chalk.cyan("Schema? ") + chalk.dim(`(${defaultSchema}) `));
      schema = schemaInput || defaultSchema;
    }

    const descriptor = resolveDescriptorSelection({ kind, type, schema });

    const title = await prompt(rl, chalk.cyan("Title? "));
    if (!title) {
      throw new CliError("Title is required.", 2);
    }

    const ownerInput = await prompt(rl, chalk.cyan("Owner? ") + chalk.dim("(your-team) "));
    const owner = ownerInput || "your-team";

    const relations: Array<{ target: string; type: string }> = [];
    console.log(chalk.dim("\nAdd relations (leave target empty to finish):"));
    while (true) {
      const target = await prompt(rl, chalk.cyan("  Related entity ref? "));
      if (!target) break;
      const relType = await prompt(rl, chalk.cyan("  Relation type? ") + chalk.dim("(depends-on) "));
      relations.push({ target, type: relType || "depends-on" });
    }

    console.log("");

    await createBackstageEntity(
      descriptor,
      title,
      {
        ...baseOptions,
        kind: descriptor.kind,
        type: descriptor.specType,
        schema: descriptor.schema,
        owner,
        relations: relations.length > 0 ? relations : undefined,
      },
      loadProjectConfig(process.cwd(), baseOptions.rootDir ?? "docs"),
      process.cwd(),
    );
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

function loadProjectConfig(cwd: string, rootDir: string): AnchoredSpecConfigV1 {
  const configPath = join(cwd, ".anchored-spec", "config.json");
  if (!existsSync(configPath)) {
    return resolveConfigV1({
      rootDir,
      entityMode: "manifest",
      manifestPath: "catalog-info.yaml",
    });
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    return resolveConfigV1(raw as Partial<AnchoredSpecConfigV1>);
  } catch {
    throw new CliError("Malformed .anchored-spec/config.json", 1);
  }
}

function resolveDescriptorSelection(options: Pick<CreateOptions, "kind" | "type" | "schema">): EntityDescriptor {
  const { kind, type, schema } = options;
  if (!kind) {
    throw new CliError("Missing required option: --kind", 2);
  }

  let candidates = ENTITY_DESCRIPTOR_REGISTRY.filter((entry) => entry.kind === kind);
  if (candidates.length === 0) {
    throw new CliError(
      `Unknown kind "${kind}". Valid kinds: ${getAllEntityKinds().join(", ")}. Use --list to inspect supported descriptors.`,
      2,
    );
  }

  if (type) {
    candidates = candidates.filter((entry) => entry.specType === type);
  }

  if (schema) {
    candidates = candidates.filter((entry) => entry.schema === schema);
  }

  if (candidates.length === 1) {
    return candidates[0]!;
  }

  if (candidates.length === 0) {
    throw new CliError(buildDescriptorSelectionError(options), 2);
  }

  const matches = candidates
    .map((entry) => formatDescriptorLabel(entry))
    .join(", ");
  throw new CliError(
    `Descriptor selection is ambiguous for kind "${kind}"${type ? ` and type "${type}"` : ""}. Add --schema to choose one of: ${matches}. Use --list to inspect all descriptors.`,
    2,
  );
}

function buildDescriptorSelectionError(options: Pick<CreateOptions, "kind" | "type" | "schema">): string {
  const constraints = [
    options.kind ? `kind=${options.kind}` : null,
    options.type ? `type=${options.type}` : null,
    options.schema ? `schema=${options.schema}` : null,
  ].filter(Boolean);

  const sampleMatches = ENTITY_DESCRIPTOR_REGISTRY
    .filter((entry) => !options.kind || entry.kind === options.kind)
    .map((entry) => formatDescriptorLabel(entry))
    .join(", ");

  return `No descriptor matches ${constraints.join(", ")}. Available descriptors${options.kind ? ` for ${options.kind}` : ""}: ${sampleMatches}. Use --list to inspect all descriptors.`;
}

async function createBackstageEntity(
  descriptor: EntityDescriptor,
  title: string,
  options: CreateOptions,
  config: AnchoredSpecConfigV1,
  cwd: string,
): Promise<void> {
  const entityName = (options.id ?? slugify(title))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const owner = options.owner ?? "your-team";

  const entity: BackstageEntity = {
    apiVersion: descriptor.apiVersion,
    kind: descriptor.kind,
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
      ...(descriptor.specType ? { type: descriptor.specType } : {}),
      lifecycle: "experimental",
      owner,
      ...(options.relations && options.relations.length > 0
        ? {
            dependsOn: options.relations
              .filter((relation) => relation.type === "depends-on")
              .map((relation) => relation.target),
          }
        : {}),
    },
  };

  try {
    const result = await writeEntity(entity, config, cwd);
    console.log(chalk.green(`Created ${result.filePath}`));
    console.log(chalk.dim(`  Kind:   ${descriptor.kind}`));
    if (descriptor.specType) {
      console.log(chalk.dim(`  Type:   ${descriptor.specType}`));
    }
    console.log(chalk.dim(`  Schema: ${descriptor.schema}`));
    console.log(chalk.dim(`  Name:   ${entityName}`));
    console.log(chalk.dim(`  Mode:   ${config.entityMode ?? "manifest"}`));
  } catch (err) {
    throw new CliError(`Failed to write entity: ${(err as Error).message}`, 1);
  }
}
