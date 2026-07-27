import { createHash } from "crypto";
import { copyFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { HERMES_HOME } from "./installer";
import { readProfileMeta, writeXctHomeProfileMeta } from "./profile-meta";
import { writeSoul } from "./soul";
import { isValidNamedProfileName, profileHome } from "./utils";

const CATALOG_URL =
  process.env.XCT_HOME_CATALOG_URL ||
  "https://www.xcity.one/api/catalog/agents";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_CATALOG_AGENTS = 2_000;
const PROFILE_FILES = [
  ".env",
  "config.yaml",
  "models.json",
  "providers.json",
  "account.json",
] as const;

export interface XctHomeAgent {
  id: string;
  slug: string;
  displayName: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  skills: XctHomeSkill[];
}

export interface XctHomeImportResult {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  error?: string;
}

type XctHomeSkill = { name: string; description: string; tags: string[] };

function text(value: unknown, max = 4_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function textList(value: unknown, maxItems = 40): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, 120))
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseAgent(value: unknown): XctHomeAgent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 200);
  const slug = text(raw.slug, 160);
  const displayName = text(raw.displayName, 240);
  const name = text(raw.name, 240) || displayName || slug;
  if (!id || !slug || !name) return null;

  const skills = Array.isArray(raw.skills)
    ? raw.skills
        .map((skill) => {
          if (!skill || typeof skill !== "object") return null;
          const entry = skill as Record<string, unknown>;
          const skillName = text(entry.name, 200);
          return skillName
            ? {
                name: skillName,
                description: text(entry.description),
                tags: textList(entry.tags),
              }
            : null;
        })
        .filter((skill): skill is XctHomeSkill => skill !== null)
        .slice(0, 80)
    : [];

  return {
    id,
    slug,
    displayName: displayName || name,
    name,
    description: text(raw.description, 12_000),
    category: text(raw.category, 120) || "general",
    tags: textList(raw.tags),
    skills,
  };
}

export function xctHomeProfileName(
  agent: Pick<XctHomeAgent, "id" | "slug">,
): string {
  const slug = agent.slug
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = createHash("sha256")
    .update(agent.id)
    .digest("hex")
    .slice(0, 8);
  const name = `xct-${slug || "agent"}-${suffix}`.slice(0, 64);
  if (!isValidNamedProfileName(name)) {
    throw new Error("Catalog agent could not be assigned a valid profile name");
  }
  return name;
}

function soulFor(agent: XctHomeAgent): string {
  const capabilityLines = agent.skills
    .map(
      (skill) =>
        `- ${skill.name}${skill.description ? `: ${skill.description}` : ""}`,
    )
    .join("\n");
  const tags = agent.tags.length ? agent.tags.join(", ") : "general assistance";
  return `# ${agent.displayName}

You are ${agent.name}, an agent from the Xcity public catalog.

## Role

${agent.description || `Help the user with ${agent.category} tasks.`}

## Focus

Category: ${agent.category}
Tags: ${tags}
${capabilityLines ? `\n## Catalog capabilities\n\n${capabilityLines}\n` : ""}
Use the configured model, tools, and credentials in this local Hermes profile. Be clear about missing credentials or capabilities instead of inventing results.
`;
}

async function copyUsableDefaultProfileFiles(target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  await Promise.all(
    PROFILE_FILES.map(async (file) => {
      const source = join(HERMES_HOME, file);
      if (existsSync(source)) await copyFile(source, join(target, file));
    }),
  );
}

async function fetchCatalog(): Promise<{
  agents: XctHomeAgent[];
  degraded: boolean;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(CATALOG_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Xcity catalog returned ${response.status}`);
    const body = (await response.json()) as {
      data?: unknown;
      degraded?: unknown;
    };
    if (!Array.isArray(body.data))
      throw new Error("Xcity catalog returned an invalid response");
    return {
      agents: body.data
        .slice(0, MAX_CATALOG_AGENTS)
        .map(parseAgent)
        .filter((agent): agent is XctHomeAgent => agent !== null),
      degraded: body.degraded === true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Materialize every public Xcity marketplace entry as an isolated, usable
 * local profile. Existing Xcity profiles are refreshed; unrelated profiles are
 * never modified, even if their filesystem name collides with a catalog entry.
 */
export async function importXctHomeAgents(): Promise<XctHomeImportResult> {
  try {
    const { agents, degraded } = await fetchCatalog();
    if (degraded) {
      return {
        success: false,
        total: agents.length,
        created: 0,
        updated: 0,
        skipped: 0,
        error: "Xcity catalog is temporarily unavailable",
      };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const agent of agents) {
      const name = xctHomeProfileName(agent);
      const home = profileHome(name);
      const existing = existsSync(home);
      if (existing) {
        const meta = await readProfileMeta(name);
        if (meta.xctHome?.id !== agent.id) {
          skipped += 1;
          continue;
        }
      } else {
        await copyUsableDefaultProfileFiles(home);
        created += 1;
      }

      if (!writeSoul(soulFor(agent), name)) {
        throw new Error(`Failed to write persona for ${agent.displayName}`);
      }
      await writeXctHomeProfileMeta(name, agent);
      if (existing) updated += 1;
    }

    return { success: true, total: agents.length, created, updated, skipped };
  } catch (err) {
    return {
      success: false,
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      error:
        err instanceof Error ? err.message : "Failed to import Xcity agents",
    };
  }
}
