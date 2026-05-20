#!/usr/bin/env tsx
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const RULESETS_DIR = join(REPO_ROOT, ".github", "rulesets");

type Ruleset = { id: number; name: string };

const SERVER_ASSIGNED_TOP_LEVEL = new Set([
  "id",
  "node_id",
  "created_at",
  "updated_at",
  "source",
  "source_type",
  "_links",
  "current_user_can_bypass",
  "links",
]);

const SERVER_ASSIGNED_RULE = new Set(["id", "ruleset_source_type", "ruleset_source", "ruleset_id"]);

function gh(args: string[], input?: string): { stdout: string; status: number } {
  const res = spawnSync("gh", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  });
  return { stdout: res.stdout, status: res.status ?? 1 };
}

function ghOrThrow(args: string[], input?: string): string {
  const res = gh(args, input);
  if (res.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed with exit ${res.status}`);
  }
  return res.stdout;
}

function getRepoSlug(): string {
  const env = process.env.GITHUB_REPOSITORY;
  if (env && env.includes("/")) return env;
  const out = ghOrThrow([
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "-q",
    ".nameWithOwner",
  ]).trim();
  if (!out) throw new Error("Could not determine current repo");
  return out;
}

function listRulesets(repo: string): Ruleset[] {
  const out = ghOrThrow([
    "api",
    "-H",
    "Accept: application/vnd.github+json",
    `/repos/${repo}/rulesets`,
  ]);
  return JSON.parse(out) as Ruleset[];
}

function getRuleset(repo: string, id: number): unknown {
  const out = ghOrThrow([
    "api",
    "-H",
    "Accept: application/vnd.github+json",
    `/repos/${repo}/rulesets/${id}`,
  ]);
  return JSON.parse(out);
}

function normalize(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) {
    return value.map((v, i) => normalize(v, [...path, String(i)]));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const inRules = path[path.length - 1] === "rules" ||
      path[path.length - 2] === "rules";
    const isTopLevel = path.length === 0;
    for (const [k, v] of Object.entries(obj)) {
      if (isTopLevel && SERVER_ASSIGNED_TOP_LEVEL.has(k)) continue;
      if (inRules && SERVER_ASSIGNED_RULE.has(k)) continue;
      out[k] = normalize(v, [...path, k]);
    }
    // Sort keys for stable comparison
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(out).sort()) sorted[k] = out[k];
    return sorted;
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

type DriftReport = {
  file: string;
  name: string;
  status: "ok" | "drift" | "missing" | "unmanaged_remote";
  localJson?: string;
  remoteJson?: string;
};

function diff(local: string, remote: string): string {
  const a = local.split("\n");
  const b = remote.split("\n");
  const out: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      if (a[i] !== undefined) out.push(`- ${a[i]}`);
      if (b[i] !== undefined) out.push(`+ ${b[i]}`);
    } else {
      out.push(`  ${a[i]}`);
    }
  }
  return out.join("\n");
}

async function openOrUpdateIssue(repo: string, body: string): Promise<void> {
  const title = "Ruleset drift detected between GitHub and committed JSON";
  const searchOut = ghOrThrow([
    "api",
    "-H",
    "Accept: application/vnd.github+json",
    `/repos/${repo}/issues?state=open&labels=ruleset-drift&per_page=100`,
  ]);
  const issues = JSON.parse(searchOut) as Array<{ number: number; title: string }>;
  const existing = issues.find((i) => i.title === title);

  if (existing) {
    console.log(`Commenting on existing drift issue #${existing.number}`);
    ghOrThrow(
      [
        "api",
        "--method",
        "POST",
        "-H",
        "Accept: application/vnd.github+json",
        `/repos/${repo}/issues/${existing.number}/comments`,
        "--input",
        "-",
      ],
      JSON.stringify({ body }),
    );
    return;
  }

  console.log("Opening new drift tracking issue");
  // Ensure label exists (ignore failure if it already does)
  gh(
    [
      "api",
      "--method",
      "POST",
      "-H",
      "Accept: application/vnd.github+json",
      `/repos/${repo}/labels`,
      "--input",
      "-",
    ],
    JSON.stringify({
      name: "ruleset-drift",
      color: "d73a4a",
      description: "Live GitHub ruleset has drifted from committed JSON",
    }),
  );
  ghOrThrow(
    [
      "api",
      "--method",
      "POST",
      "-H",
      "Accept: application/vnd.github+json",
      `/repos/${repo}/issues`,
      "--input",
      "-",
    ],
    JSON.stringify({ title, body, labels: ["ruleset-drift"] }),
  );
}

async function main(): Promise<void> {
  const files = readdirSync(RULESETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(RULESETS_DIR, f))
    .sort();

  if (files.length === 0) {
    console.log(`No ruleset JSON files found in ${RULESETS_DIR}`);
    return;
  }

  const repo = getRepoSlug();
  console.log(`Checking ${files.length} ruleset(s) on ${repo} for drift`);

  const existing = listRulesets(repo);
  const byName = new Map(existing.map((r) => [r.name, r]));

  const reports: DriftReport[] = [];
  const localNames = new Set<string>();

  for (const file of files) {
    const body = readFileSync(file, "utf8");
    const parsed = JSON.parse(body) as { name?: unknown };
    if (typeof parsed.name !== "string" || !parsed.name) {
      throw new Error(`${file}: missing required string "name" field`);
    }
    const name = parsed.name;
    localNames.add(name);
    const remoteMeta = byName.get(name);

    if (!remoteMeta) {
      console.log(`  ✗ ${basename(file)} (${name}): not present on GitHub`);
      reports.push({ file: basename(file), name, status: "missing" });
      continue;
    }

    const remote = getRuleset(repo, remoteMeta.id);
    const local = JSON.parse(body);

    const localNorm = stableStringify(normalize(local));
    const remoteNorm = stableStringify(normalize(remote));

    if (localNorm === remoteNorm) {
      console.log(`  ✓ ${basename(file)} (${name})`);
      reports.push({ file: basename(file), name, status: "ok" });
    } else {
      console.log(`  ✗ ${basename(file)} (${name}): DRIFT`);
      reports.push({
        file: basename(file),
        name,
        status: "drift",
        localJson: localNorm,
        remoteJson: remoteNorm,
      });
    }
  }

  for (const remote of existing) {
    if (localNames.has(remote.name)) continue;
    console.log(
      `  ✗ ${remote.name}: present on GitHub but no matching JSON file`,
    );
    const remoteFull = getRuleset(repo, remote.id);
    reports.push({
      file: "(none)",
      name: remote.name,
      status: "unmanaged_remote",
      remoteJson: stableStringify(normalize(remoteFull)),
    });
  }

  const bad = reports.filter((r) => r.status !== "ok");
  if (bad.length === 0) {
    console.log("\nAll rulesets match committed JSON.");
    return;
  }

  const sections: string[] = [
    "One or more repository rulesets on GitHub no longer match the JSON in `.github/rulesets/`.",
    "",
    "This usually means someone edited a ruleset in the GitHub UI (Settings → Rules → Rulesets) without updating the committed JSON. The JSON files are meant to be the source of truth.",
    "",
    "**Fix:** either (a) re-apply the committed JSON to overwrite the UI change with `pnpm --filter @workspace/scripts run apply-rulesets`, or (b) pull the UI change back into the JSON file and commit it.",
    "",
  ];

  for (const r of bad) {
    sections.push(`### \`${r.file}\` — ${r.name}`);
    sections.push("");
    if (r.status === "missing") {
      sections.push(
        "This ruleset exists in the repo as JSON but **does not exist on GitHub**. Run `apply-rulesets` to create it.",
      );
    } else if (r.status === "unmanaged_remote") {
      sections.push(
        "This ruleset exists **on GitHub but has no matching JSON file** in `.github/rulesets/`. Either commit a JSON file with this `name` so it becomes managed, or delete it from the GitHub UI if it was created by mistake.",
      );
      sections.push("");
      sections.push("Live ruleset config:");
      sections.push("");
      sections.push("```json");
      sections.push(r.remoteJson!);
      sections.push("```");
    } else {
      sections.push("```diff");
      sections.push(diff(r.localJson!, r.remoteJson!));
      sections.push("```");
    }
    sections.push("");
  }

  const body = sections.join("\n");
  console.error("\n--- DRIFT REPORT ---\n");
  console.error(body);

  if (process.env.GITHUB_ACTIONS === "true") {
    try {
      await openOrUpdateIssue(repo, body);
    } catch (e) {
      console.error(`Failed to open/update tracking issue: ${(e as Error).message}`);
    }
  }

  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
