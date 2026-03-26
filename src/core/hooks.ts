/**
 * Anchored Spec — Lifecycle Hooks
 *
 * Executes user-defined shell commands on lifecycle events
 * (post-create, post-transition). Users control the scripts —
 * this is their trust boundary.
 */

import { execFileSync } from "node:child_process";
import type { HookEvent, HookDefinition, AnchoredSpecConfig } from "./types.js";

export interface HookEnv {
  ANCHORED_SPEC_EVENT: string;
  ANCHORED_SPEC_ID?: string;
  ANCHORED_SPEC_TYPE?: string;
  ANCHORED_SPEC_STATUS?: string;
  [key: string]: string | undefined;
}

/**
 * Run all hooks matching the given event.
 * Supports compound events (e.g., "post-create:requirement"):
 * 1. Exact match hooks fire first
 * 2. Base event hooks (e.g., "post-create") fire as fallback
 * Hooks run sequentially; a failing hook logs a warning but does not abort.
 */
export function runHooks(
  event: HookEvent,
  config: AnchoredSpecConfig,
  env: HookEnv,
  options?: { dryRun?: boolean; cwd?: string },
): void {
  const allHooks = config.hooks ?? [];
  const baseEvent = event.includes(":") ? event.split(":")[0] : null;

  // Exact match first, then base-event fallback (deduplicated)
  const matched = allHooks.filter((h: HookDefinition) => h.event === event);
  if (baseEvent) {
    for (const h of allHooks) {
      if (h.event === baseEvent && !matched.includes(h)) {
        matched.push(h);
      }
    }
  }

  if (matched.length === 0) return;

  const mergedEnv = { ...process.env, ...env };
  const cwd = options?.cwd ?? process.cwd();

  for (const hook of matched) {
    if (options?.dryRun) {
      console.log(`[hook:${event}] Would run: ${hook.run}`);
      continue;
    }

    try {
      execFileSync("/bin/sh", ["-c", hook.run], {
        env: mergedEnv,
        cwd,
        stdio: "inherit",
        timeout: 30_000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[hook:${event}] Warning: hook failed — ${msg}`);
    }
  }
}
