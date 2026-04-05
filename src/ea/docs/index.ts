/** Anchored Spec — Document Traceability Module
 *
 * Bridges markdown documents (with YAML frontmatter) and structured EA
 * entities via bidirectional trace links.
 */

// Frontmatter parser
export type { DocFrontmatter, ParsedDoc } from "./frontmatter.js";
export { parseFrontmatter, extractEntityRefs, hasEaFrontmatter, serializeFrontmatter } from "./frontmatter.js";

// Document scanner
export type { ScannedDoc, ScanResult, ScanOptions, DocDiscoveryResult } from "./scanner.js";
export { DEFAULT_DOC_DIRS, scanDocs, buildDocIndex, discoverFromDocs } from "./scanner.js";
