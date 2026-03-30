/** Anchored Spec — Document Traceability Module
 *
 * Bridges markdown documents (with YAML frontmatter) and structured EA
 * artifacts via bidirectional trace links.
 */

// Frontmatter parser
export type { DocFrontmatter, ParsedDoc } from "./frontmatter.js";
export { parseFrontmatter, extractArtifactIds, hasEaFrontmatter, serializeFrontmatter } from "./frontmatter.js";

// Document scanner
export type { ScannedDoc, ScanResult, ScanOptions } from "./scanner.js";
export { DEFAULT_DOC_DIRS, scanDocs, buildDocIndex } from "./scanner.js";
