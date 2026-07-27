import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const { TEST_HOME } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  return {
    TEST_HOME: path.join(os.tmpdir(), `xct-home-catalog-${Date.now()}`),
  };
});

vi.mock("./installer", () => ({ HERMES_HOME: TEST_HOME }));

import { importXctHomeAgents, xctHomeProfileName } from "./xct-home-catalog";

const catalogAgent = {
  id: "agent-1",
  slug: "research-helper",
  displayName: "Research Helper",
  name: "Research Helper",
  description: "Find and summarize reliable sources.",
  category: "research",
  tags: ["research", "sources"],
  skills: [
    { name: "Web research", description: "Find sources", tags: ["web"] },
  ],
};

beforeEach(() => {
  rmSync(TEST_HOME, { recursive: true, force: true });
  mkdirSync(TEST_HOME, { recursive: true });
  writeFileSync(join(TEST_HOME, "config.yaml"), "models:\n  default: gpt-4o\n");
  writeFileSync(join(TEST_HOME, ".env"), "OPENAI_API_KEY=test\n");
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(TEST_HOME, { recursive: true, force: true });
});

function mockCatalog(data: unknown[], degraded = false): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data, degraded }),
    }),
  );
}

describe("Xcity home catalog import", () => {
  it("creates usable local profiles and refreshes their catalog persona", async () => {
    mockCatalog([catalogAgent]);

    const first = await importXctHomeAgents();
    const name = xctHomeProfileName(catalogAgent);
    const home = join(TEST_HOME, "profiles", name);

    expect(first).toEqual({
      success: true,
      total: 1,
      created: 1,
      updated: 0,
      skipped: 0,
    });
    expect(readFileSync(join(home, "config.yaml"), "utf-8")).toContain(
      "gpt-4o",
    );
    expect(readFileSync(join(home, ".env"), "utf-8")).toContain(
      "OPENAI_API_KEY",
    );
    expect(readFileSync(join(home, "SOUL.md"), "utf-8")).toContain(
      "Research Helper",
    );
    expect(readFileSync(join(home, "profile-meta.json"), "utf-8")).toContain(
      '"displayName": "Research Helper"',
    );

    mockCatalog([{ ...catalogAgent, description: "Updated catalog persona." }]);
    const second = await importXctHomeAgents();

    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(readFileSync(join(home, "SOUL.md"), "utf-8")).toContain(
      "Updated catalog persona.",
    );
  });

  it("does not create profiles when xct-home reports a degraded catalog", async () => {
    mockCatalog([catalogAgent], true);

    const result = await importXctHomeAgents();

    expect(result.success).toBe(false);
    expect(result.error).toContain("temporarily unavailable");
    expect(existsSync(join(TEST_HOME, "profiles"))).toBe(false);
  });
});
