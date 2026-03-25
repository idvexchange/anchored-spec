import { describe, it, expect } from "vitest";

describe("CLI", () => {
  it("exports all commands", async () => {
    const { initCommand } = await import("../commands/init.js");
    const { createCommand } = await import("../commands/create.js");
    const { verifyCommand } = await import("../commands/verify.js");
    const { generateCommand } = await import("../commands/generate.js");
    const { statusCommand } = await import("../commands/status.js");

    expect(typeof initCommand).toBe("function");
    expect(typeof createCommand).toBe("function");
    expect(typeof verifyCommand).toBe("function");
    expect(typeof generateCommand).toBe("function");
    expect(typeof statusCommand).toBe("function");
  });
});
