import { basename, join } from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { ResolverLogger } from "../types.js";
import type { QueryMatch } from "./types.js";

type Project = import("ts-morph").Project;
type SourceFile = import("ts-morph").SourceFile;
type TsMorphModule = typeof import("ts-morph");

type ExportedDeclarationInfo = {
  name: string;
  startLine: number;
  endLine: number;
};

let tsMorphModule: TsMorphModule | null = null;

function loadTsMorph(): TsMorphModule {
  if (tsMorphModule) return tsMorphModule;
  const esmRequire = createRequire(import.meta.url);
  tsMorphModule = esmRequire("ts-morph") as TsMorphModule;
  return tsMorphModule;
}

function fileStem(filePath: string): string {
  return basename(filePath).replace(/\.[^.]+$/, "");
}

function isCodeFile(filePath: string): boolean {
  return /\.(?:ts|tsx|js|jsx|mts|mjs|cts|cjs)$/.test(filePath);
}

function buildProject(projectRoot: string, files: string[]): Project {
  const { Project } = loadTsMorph();
  const tsconfigPath = join(projectRoot, "tsconfig.json");
  const project = new Project({
    ...(existsSync(tsconfigPath) ? { tsConfigFilePath: tsconfigPath } : {}),
    skipAddingFilesFromTsConfig: true,
    compilerOptions: existsSync(tsconfigPath)
      ? undefined
      : {
          allowJs: true,
          target: 99,
          module: 99,
        },
  });

  for (const filePath of files) {
    try {
      project.addSourceFileAtPath(filePath);
    } catch {
      // Skip files ts-morph cannot parse.
    }
  }
  return project;
}

function getExportInfo(sourceFile: SourceFile): {
  exportNames: string[];
  declarations: ExportedDeclarationInfo[];
} {
  const exportNames: string[] = [];
  const declarations: ExportedDeclarationInfo[] = [];

  for (const [name, decls] of sourceFile.getExportedDeclarations()) {
    exportNames.push(name);
    for (const decl of decls) {
      const startLine = decl.getStartLineNumber?.();
      const endLine = decl.getEndLineNumber?.();
      if (typeof startLine !== "number" || typeof endLine !== "number") continue;
      declarations.push({ name, startLine, endLine });
    }
  }

  declarations.sort((left, right) => {
    const leftSpan = left.endLine - left.startLine;
    const rightSpan = right.endLine - right.startLine;
    return leftSpan - rightSpan;
  });

  return {
    exportNames: [...new Set(exportNames)].sort(),
    declarations,
  };
}

function findBestSymbol(
  declarations: ExportedDeclarationInfo[],
  startLine: number,
): string | undefined {
  const lineNumber = startLine + 1;
  return declarations.find(
    (decl) => decl.startLine <= lineNumber && decl.endLine >= lineNumber,
  )?.name;
}

export async function enrichTypeScriptMatches(
  matches: QueryMatch[],
  projectRoot: string,
  logger: ResolverLogger,
): Promise<QueryMatch[]> {
  for (const match of matches) {
    if (!match.captures["@file.stem"]) {
      match.captures["@file.stem"] = fileStem(match.file);
    }
    if (!match.captures["@file.path"]) {
      match.captures["@file.path"] = match.file;
    }
    if (!match.captures["@module.name"]) {
      match.captures["@module.name"] = fileStem(match.file);
    }
  }

  const sourceFiles = [...new Set(
    matches
      .map((match) => match.file)
      .filter((file) => isCodeFile(file))
      .map((file) => join(projectRoot, file)),
  )];

  if (sourceFiles.length === 0) return matches;

  let project: Project;
  try {
    project = buildProject(projectRoot, sourceFiles);
  } catch (err) {
    logger.debug("Tree-sitter: ts-morph enrichment unavailable", {
      reason: err instanceof Error ? err.message : String(err),
    });
    return matches;
  }

  const fileInfo = new Map<string, ReturnType<typeof getExportInfo>>();
  for (const sourceFile of project.getSourceFiles()) {
    fileInfo.set(sourceFile.getFilePath(), getExportInfo(sourceFile));
  }

  for (const match of matches) {
    const absPath = join(projectRoot, match.file);
    const info = fileInfo.get(absPath);
    if (!info) continue;

    if (!match.captures["@exports.list"] && info.exportNames.length > 0) {
      match.captures["@exports.list"] = info.exportNames.join(", ");
    }

    if (!match.captures["@symbol.name"]) {
      const symbolName = findBestSymbol(info.declarations, match.startLine);
      if (symbolName) {
        match.captures["@symbol.name"] = symbolName;
      }
    }

    if (!match.captures["@module.name"]) {
      match.captures["@module.name"] = fileStem(match.file);
    }
  }

  return matches;
}
