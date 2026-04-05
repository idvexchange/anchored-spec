/**
 * Anchored Spec — EA Resolver Types
 *
 * Core interfaces for the EA resolver framework. Resolvers bridge declared
 * EA entities with live infrastructure by resolving anchors, collecting
 * observed state, and discovering new entities.
 *
 * Design reference: docs/guides/user-guides/bottom-up-discovery.md
 */

import type { BackstageEntity } from "../backstage/types.js";
import type { EaDomain } from "../types.js";
import type { ResolverCache } from "../cache.js";

// ─── Resolver Context ───────────────────────────────────────────────────────────

/** Context passed to every resolver method. */
export interface EaResolverContext {
  /** Absolute path to project root. */
  projectRoot: string;
  /** All loaded EA entities. */
  entities: BackstageEntity[];
  /** Resolver cache for storing observed state across runs. */
  cache: ResolverCache;
  /** Resolver logger. */
  logger: ResolverLogger;
  /** Optional source path hint (e.g., a directory to scan). */
  source?: string;
  /** Optional source path set hint (for multi-directory scanning). */
  sourcePaths?: string[];
}

/** Logger interface for resolvers. */
export interface ResolverLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ─── Anchor Resolution ──────────────────────────────────────────────────────────

/** Result of resolving a single anchor. */
export interface EaAnchorResolution {
  /** Which anchor category (e.g., "apis", "repos", "packages"). */
  anchorKind: string;
  /** The anchor value that was resolved. */
  anchorValue: string;
  /** Resolution status. */
  status: "found" | "missing" | "changed" | "unknown";
  /** Confidence level. */
  confidence: "high" | "medium" | "low";
  /** ISO 8601 timestamp of resolution. */
  resolvedAt: string;
  /** Where the anchor was found (file paths, URLs, etc). */
  foundIn?: string[];
  /** Human-readable message (especially for missing/changed). */
  message?: string;
  /** Additional metadata from the resolver. */
  metadata?: Record<string, unknown>;
}

// ─── Observed State ─────────────────────────────────────────────────────────────

/** Observed state collected from external systems. */
export interface ObservedEaState {
  /** Resolver source identifier. */
  source: string;
  /** ISO 8601 timestamp of collection. */
  collectedAt: string;
  /** Observed entities (potential EA entities). */
  entities: ObservedEntity[];
  /** Observed relationships between entities. */
  relationships: ObservedRelationship[];
}

/** An entity observed in external systems. */
export interface ObservedEntity {
  /** External system identifier. */
  externalId: string;
  /** Inferred schema profile. */
  inferredSchema?: string;
  /** Inferred EA domain. */
  inferredDomain?: EaDomain;
  /** If matched to an existing EA entity, its ID. */
  matchedEntityId?: string;
  /** Arbitrary metadata from the source. */
  metadata?: Record<string, unknown>;
}

/** A relationship observed between two external entities. */
export interface ObservedRelationship {
  sourceExternalId: string;
  targetExternalId: string;
  type: string;
}

// ─── Discovery Draft (re-export for convenience) ────────────────────────────────

// We re-use EntityDraft from discovery.ts
export type { EntityDraft } from "../discovery.js";

// ─── EaResolver Interface ───────────────────────────────────────────────────────

/**
 * An EA Resolver bridges declared EA entities with live infrastructure.
 *
 * Each method is optional — a resolver can implement just one or all three:
 * - resolveAnchors: validate that declared anchors exist in real systems
 * - collectObservedState: enumerate entities from external sources
 * - discoverEntities: create draft EA entities from discovered entities
 */
export interface EaResolver {
  /** Unique resolver name. */
  name: string;
  /** Which EA domains this resolver handles. */
  domains?: EaDomain[];
  /** Which schema profiles this resolver handles. */
  schemas?: string[];

  /**
   * Resolve anchors on an entity against real infrastructure.
   * Returns null to defer to the next resolver in the chain.
   */
  resolveAnchors?(
    entity: BackstageEntity,
    ctx: EaResolverContext,
  ): EaAnchorResolution[] | null;

  /**
   * Collect observed state from an external system.
   * Returns null if no state could be collected.
   */
  collectObservedState?(
    ctx: EaResolverContext,
  ): ObservedEaState | null;

  /**
   * Discover new entities from an external system.
   * Returns null if no entities were discovered.
   */
  discoverEntities?(
    ctx: EaResolverContext,
  ): import("../discovery.js").EntityDraft[] | null;
}

// ─── Console Logger (default) ───────────────────────────────────────────────────

/** Simple console-based logger for resolvers. */
export const consoleLogger: ResolverLogger = {
  debug(message: string, data?: Record<string, unknown>) {
    if (process.env.DEBUG) console.debug(`[resolver:debug] ${message}`, data ?? "");
  },
  info(message: string, data?: Record<string, unknown>) {
    console.info(`[resolver] ${message}`, data ? JSON.stringify(data) : "");
  },
  warn(message: string, data?: Record<string, unknown>) {
    console.warn(`[resolver:warn] ${message}`, data ? JSON.stringify(data) : "");
  },
  error(message: string, data?: Record<string, unknown>) {
    console.error(`[resolver:error] ${message}`, data ? JSON.stringify(data) : "");
  },
};

/** Silent logger (for tests and programmatic use). */
export const silentLogger: ResolverLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
