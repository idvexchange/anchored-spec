/**
 * Tests for EA Plugin System
 *
 * Covers:
 *   - runEaPluginChecks execution
 *   - Plugin check error handling
 *   - Plugin with no checks
 */
import { describe, it, expect } from "vitest";
import { runEaPluginChecks, type EaPlugin, type EaPluginContext, } from "../plugins.js";
import { getEntityDescription, getEntityId } from "../backstage/accessors.js";
import { makeEntity } from "./helpers/make-entity.js";
// ─── Fixtures ───────────────────────────────────────────────────────────────────
function makeContext(entities?: ReturnType<typeof makeEntity>[]): EaPluginContext {
    return {
        entities: entities ?? [],
        projectRoot: "/tmp/test",
        config: {}
    };
}
function makePluginEntity(ref: string, status = "active") {
    return makeEntity({
        ref: `component:${ref}`,
        kind: "Component",
        type: "service",
        status: status as "active" | "draft",
        summary: ""
    });
}
// ─── runEaPluginChecks ──────────────────────────────────────────────────────────
describe("runEaPluginChecks", () => {
    it("runs checks from a plugin and returns findings", () => {
        const plugin: EaPlugin = {
            name: "test-plugin",
            checks: [
                {
                    id: "must-have-summary",
                    description: "Entities must have a summary",
                    check: (ctx) => ctx.entities
                        .filter((entity) => !getEntityDescription(entity))
                        .map((entity) => ({
                        path: getEntityId(entity),
                        message: `Entity ${getEntityId(entity)} has no summary`,
                        severity: "warning" as const,
                        rule: "must-have-summary"
                    }))
                }
            ]
        };
        const entity = makePluginEntity("svc-no-summary");
        const errors = runEaPluginChecks([plugin], makeContext([entity]));
        expect(errors).toHaveLength(1);
        expect(errors[0]!.rule).toBe("plugin:test-plugin/must-have-summary");
        expect(errors[0]!.path).toBe("component:default/svc-no-summary");
    });
    it("returns empty array when plugin has no checks", () => {
        const plugin: EaPlugin = { name: "empty-plugin" };
        const errors = runEaPluginChecks([plugin], makeContext());
        expect(errors).toHaveLength(0);
    });
    it("returns empty array for empty checks array", () => {
        const plugin: EaPlugin = { name: "no-checks", checks: [] };
        const errors = runEaPluginChecks([plugin], makeContext());
        expect(errors).toHaveLength(0);
    });
    it("handles check that throws an error", () => {
        const plugin: EaPlugin = {
            name: "failing-plugin",
            checks: [
                {
                    id: "boom",
                    description: "This check always throws",
                    check: () => {
                        throw new Error("unexpected crash");
                    }
                }
            ]
        };
        const errors = runEaPluginChecks([plugin], makeContext());
        expect(errors).toHaveLength(1);
        expect(errors[0]!.severity).toBe("error");
        expect(errors[0]!.rule).toBe("plugin:failing-plugin/boom");
        expect(errors[0]!.message).toContain("unexpected crash");
    });
    it("runs checks from multiple plugins", () => {
        const pluginA: EaPlugin = {
            name: "plugin-a",
            checks: [
                {
                    id: "check-a",
                    description: "Always finds one issue",
                    check: () => [{ path: "a", message: "issue a", severity: "warning" as const, rule: "check-a" }]
                }
            ]
        };
        const pluginB: EaPlugin = {
            name: "plugin-b",
            checks: [
                {
                    id: "check-b",
                    description: "Always finds one issue",
                    check: () => [{ path: "b", message: "issue b", severity: "error" as const, rule: "check-b" }]
                }
            ]
        };
        const errors = runEaPluginChecks([pluginA, pluginB], makeContext());
        expect(errors).toHaveLength(2);
        expect(errors[0]!.rule).toBe("plugin:plugin-a/check-a");
        expect(errors[1]!.rule).toBe("plugin:plugin-b/check-b");
    });
    it("prefixes rule names with plugin:name/", () => {
        const plugin: EaPlugin = {
            name: "my-plugin",
            checks: [
                {
                    id: "naming-check",
                    description: "Test rule prefix",
                    check: () => [{ path: "x", message: "test", severity: "warning" as const, rule: "naming-check" }]
                }
            ]
        };
        const errors = runEaPluginChecks([plugin], makeContext());
        expect(errors[0]!.rule).toBe("plugin:my-plugin/naming-check");
    });
});
