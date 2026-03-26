import { describe, it, expect } from "vitest";
import { runPluginChecks } from "../../core/plugins.js";
import type {
  AnchoredSpecPlugin,
  PluginContext,
  ValidationError,
  Requirement,
} from "../../core/types.js";

function makeCtx(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    requirements: [],
    changes: [],
    decisions: [],
    policy: null,
    projectRoot: "/tmp",
    ...overrides,
  };
}

describe("plugin system", () => {
  it("runs plugin checks and collects errors", () => {
    const plugin: AnchoredSpecPlugin = {
      name: "test-plugin",
      checks: [
        {
          id: "no-empty-title",
          description: "Titles must not be empty",
          check: (ctx) => {
            const errors: ValidationError[] = [];
            for (const req of ctx.requirements) {
              if (!req.title) {
                errors.push({
                  path: req.id,
                  message: "Title is empty",
                  severity: "error",
                });
              }
            }
            return errors;
          },
        },
      ],
    };

    const req = {
      id: "REQ-1",
      title: "",
      summary: "Test",
      priority: "must",
      status: "draft",
      behaviorStatements: [
        { id: "BS-01", text: "When x, the system shall y", format: "EARS", response: "y" },
      ],
      owners: ["team"],
    } as unknown as Requirement;

    const ctx = makeCtx({ requirements: [req] });
    const errors = runPluginChecks([plugin], ctx);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.rule).toBe("plugin:test-plugin/no-empty-title");
  });

  it("handles plugins with no checks", () => {
    const plugin: AnchoredSpecPlugin = { name: "empty-plugin" };
    const errors = runPluginChecks([plugin], makeCtx());
    expect(errors).toHaveLength(0);
  });

  it("catches check function errors", () => {
    const plugin: AnchoredSpecPlugin = {
      name: "bad-plugin",
      checks: [
        {
          id: "throws",
          description: "Always throws",
          check: () => {
            throw new Error("boom");
          },
        },
      ],
    };
    const errors = runPluginChecks([plugin], makeCtx());
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("boom");
    expect(errors[0]!.rule).toBe("plugin:bad-plugin/throws");
  });

  it("runs multiple plugins sequentially", () => {
    const p1: AnchoredSpecPlugin = {
      name: "plugin-a",
      checks: [
        {
          id: "check-a",
          description: "Check A",
          check: () => [{ path: "", message: "A", severity: "warning" as const }],
        },
      ],
    };
    const p2: AnchoredSpecPlugin = {
      name: "plugin-b",
      checks: [
        {
          id: "check-b",
          description: "Check B",
          check: () => [{ path: "", message: "B", severity: "error" as const }],
        },
      ],
    };
    const errors = runPluginChecks([p1, p2], makeCtx());
    expect(errors).toHaveLength(2);
    expect(errors[0]!.rule).toBe("plugin:plugin-a/check-a");
    expect(errors[1]!.rule).toBe("plugin:plugin-b/check-b");
  });

  it("provides full context to check functions", () => {
    let receivedCtx: PluginContext | null = null;
    const plugin: AnchoredSpecPlugin = {
      name: "spy-plugin",
      checks: [
        {
          id: "spy",
          description: "Captures context",
          check: (ctx) => {
            receivedCtx = ctx;
            return [];
          },
        },
      ],
    };
    const ctx = makeCtx({ projectRoot: "/my/project" });
    runPluginChecks([plugin], ctx);
    expect(receivedCtx).not.toBeNull();
    expect(receivedCtx!.projectRoot).toBe("/my/project");
  });
});
