import { NextRequest, NextResponse } from "next/server";
import { runCliJson } from "@/lib/openclaw";
import { fetchConfig, patchConfig } from "@/lib/gateway-config";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { getDefaultWorkspaceSync, getSystemSkillsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

/* ── Types ────────────────────────────────────────── */

type Skill = {
  name: string;
  description: string;
  emoji: string;
  eligible: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  source: string;
  bundled: boolean;
  homepage?: string;
  missing: {
    bins: string[];
    anyBins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
};

type SkillsList = {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: Skill[];
};

type SkillsCheck = {
  summary: {
    total: number;
    eligible: number;
    disabled: number;
    blocked: number;
    missingRequirements: number;
  };
  eligible: string[];
  disabled: string[];
  blocked: string[];
  missingRequirements: { name: string; missing: string[] }[];
};

type SkillDetail = {
  name: string;
  description: string;
  source: string;
  bundled: boolean;
  filePath: string;
  baseDir: string;
  skillKey: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    anyBins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    anyBins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  configChecks: unknown[];
  install: { id: string; kind: string; label: string; bins?: string[] }[];
};

/* ── Filesystem fallback for when CLI returns empty output ────── */

/**
 * Parse SKILL.md frontmatter to extract metadata.
 * Handles both YAML-style and JSON-in-YAML metadata blocks.
 */
function parseSkillFrontmatter(raw: string): {
  name?: string;
  description?: string;
  emoji?: string;
  requires?: { bins?: string[]; anyBins?: string[]; env?: string[]; config?: string[]; os?: string[] };
} {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return {};
  const fm = fmMatch[1];

  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  const description = fm.match(/^description:\s*["']?([\s\S]*?)["']?\s*$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");

  // Extract emoji from metadata.openclaw.emoji
  const emoji = fm.match(/"emoji":\s*"([^"]+)"/)?.[1];

  // Extract requires from metadata.openclaw.requires
  let requires: { bins?: string[]; anyBins?: string[]; env?: string[]; config?: string[]; os?: string[] } | undefined;
  const reqMatch = fm.match(/"requires":\s*(\{[^}]*\})/);
  if (reqMatch) {
    try { requires = JSON.parse(reqMatch[1]); } catch { /* skip */ }
  }

  return { name, description, emoji, requires };
}

/**
 * Read skills directly from the filesystem when the CLI is unavailable.
 * Returns a degraded SkillsList with basic metadata parsed from SKILL.md files.
 */
async function readSkillsFromFilesystem(): Promise<SkillsList> {
  const skills: Skill[] = [];
  const seen = new Set<string>();

  const scanDir = async (dir: string, source: string) => {
    let entries: import("fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" }) as import("fs").Dirent[];
    } catch { return; }

    for (const entry of entries) {
      if (!entry.isDirectory() || seen.has(entry.name)) continue;
      seen.add(entry.name);

      const skillPath = join(dir, entry.name, "SKILL.md");
      let fm: ReturnType<typeof parseSkillFrontmatter> = {};
      try {
        const raw = await readFile(skillPath, "utf-8");
        fm = parseSkillFrontmatter(raw);
      } catch { /* SKILL.md may not exist */ }

      const bins = fm.requires?.bins || [];
      const anyBins = fm.requires?.anyBins || [];
      const env = fm.requires?.env || [];
      const config = fm.requires?.config || [];
      const os = fm.requires?.os || [];

      skills.push({
        name: fm.name || entry.name,
        description: fm.description || "",
        emoji: fm.emoji || "",
        eligible: false, // Can't determine without CLI
        disabled: false,
        blockedByAllowlist: false,
        source,
        bundled: source !== "workspace",
        homepage: undefined,
        missing: { bins, anyBins, env, config, os },
      });
    }
  };

  // Scan workspace skills first, then system skills
  await scanDir(join(getDefaultWorkspaceSync(), "skills"), "workspace");
  try {
    const sysDir = await getSystemSkillsDir();
    await scanDir(sysDir, "openclaw-bundled");
  } catch { /* system skills dir may not exist */ }

  return {
    workspaceDir: getDefaultWorkspaceSync(),
    managedSkillsDir: "",
    skills,
  };
}

/* ── GET ──────────────────────────────────────────── */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "list";

  try {
    if (action === "check") {
      const data = await runCliJson<SkillsCheck>(["skills", "check"]);
      return NextResponse.json(data);
    }

    if (action === "info") {
      const name = searchParams.get("name");
      if (!name)
        return NextResponse.json({ error: "name required" }, { status: 400 });

      const data = await runCliJson<SkillDetail>(["skills", "info", name]);

      // Try to read the SKILL.md content for display
      let skillMd: string | null = null;
      if (data.filePath) {
        try {
          const raw = await readFile(data.filePath, "utf-8");
          // Truncate very long files
          skillMd = raw.length > 10000 ? raw.slice(0, 10000) + "\n\n...(truncated)" : raw;
        } catch {
          // file may not be readable
        }
      }

      // Check the config for skill-specific settings
      let skillConfig: Record<string, unknown> | null = null;
      try {
        const configData = await fetchConfig(8000);
        const tools = (configData.resolved.tools || {}) as Record<string, unknown>;
        if (tools[data.skillKey || data.name]) {
          skillConfig = tools[data.skillKey || data.name] as Record<string, unknown>;
        }
      } catch {
        // config not available
      }

      return NextResponse.json({ ...data, skillMd, skillConfig });
    }

    if (action === "config") {
      // Get the full config to see skills/tools section
      try {
        const configData = await fetchConfig(8000);

        return NextResponse.json({
          tools: {
            resolved: configData.resolved.tools || {},
            parsed: configData.parsed.tools || {},
          },
          skills: {
            resolved: configData.resolved.skills || {},
            parsed: configData.parsed.skills || {},
          },
          hash: configData.hash,
        });
      } catch (err) {
        return NextResponse.json({
          tools: { resolved: {}, parsed: {} },
          skills: { resolved: {}, parsed: {} },
          hash: null,
          warning: String(err),
          degraded: true,
        });
      }
    }

    // Default: list all skills
    const data = await runCliJson<SkillsList>(["skills", "list"]);
    return NextResponse.json(data);
  } catch (err) {
    console.error("Skills API error:", err);

    // Filesystem fallback — read skills directly from disk when CLI fails.
    // This handles the no-TTY empty stdout issue in OpenClaw v2026.3.23+.
    if (action === "list" || action === "check") {
      try {
        const fsSkills = await readSkillsFromFilesystem();
        if (fsSkills.skills.length > 0) {
          if (action === "check") {
            return NextResponse.json({
              summary: {
                total: fsSkills.skills.length,
                eligible: 0,
                disabled: 0,
                blocked: 0,
                missingRequirements: 0,
              },
              eligible: [],
              disabled: [],
              blocked: [],
              missingRequirements: [],
              warning: "Loaded from filesystem (CLI unavailable)",
              fromFilesystem: true,
            });
          }
          return NextResponse.json({
            ...fsSkills,
            warning: "Loaded from filesystem (CLI unavailable)",
            fromFilesystem: true,
          });
        }
      } catch (fsErr) {
        console.error("Skills filesystem fallback error:", fsErr);
      }
    }

    if (action === "check") {
      return NextResponse.json({
        summary: {
          total: 0,
          eligible: 0,
          disabled: 0,
          blocked: 0,
          missingRequirements: 0,
        },
        eligible: [],
        disabled: [],
        blocked: [],
        missingRequirements: [],
        warning: String(err),
        degraded: true,
      });
    }
    if (action === "list") {
      return NextResponse.json({
        workspaceDir: "",
        managedSkillsDir: "",
        skills: [],
        warning: String(err),
        degraded: true,
      });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/* ── POST: install / enable / disable / config ──── */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as string;

    switch (action) {
      case "install-brew": {
        // Install a binary dependency via brew
        const pkg = body.package as string;
        if (!pkg)
          return NextResponse.json(
            { error: "package required" },
            { status: 400 }
          );
        // Run brew install
        const { execFile } = await import("child_process");
        const { promisify } = await import("util");
        const exec = promisify(execFile);
        try {
          const { stdout, stderr } = await exec("brew", ["install", pkg], {
            timeout: 120000,
          });
          return NextResponse.json({
            ok: true,
            action,
            package: pkg,
            output: stdout + stderr,
          });
        } catch (err: unknown) {
          const e = err as { stderr?: string; message?: string };
          return NextResponse.json(
            {
              error: `brew install failed: ${e.stderr || e.message || String(err)}`,
            },
            { status: 500 }
          );
        }
      }

      case "enable-skill":
      case "disable-skill": {
        // Toggle skill via skills.entries.<name>.enabled
        const name = body.name as string;
        if (!name)
          return NextResponse.json(
            { error: "name required" },
            { status: 400 }
          );

        const enabling = action === "enable-skill";

        try {
          await patchConfig({
            skills: {
              entries: {
                [name]: { enabled: enabling },
              },
            },
          }, { restartDelayMs: 2000 });
          return NextResponse.json({ ok: true, action, name });
        } catch (err) {
          return NextResponse.json({ error: String(err) }, { status: 500 });
        }
      }

      case "update-tool-config": {
        // Patch tools.<skillKey> config
        const skillKey = body.skillKey as string;
        const config = body.config as Record<string, unknown>;
        if (!skillKey || !config)
          return NextResponse.json(
            { error: "skillKey and config required" },
            { status: 400 }
          );

        try {
          await patchConfig({ tools: { [skillKey]: config } });
          return NextResponse.json({ ok: true, action, skillKey });
        } catch (err) {
          return NextResponse.json({ error: String(err) }, { status: 500 });
        }
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("Skills POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
