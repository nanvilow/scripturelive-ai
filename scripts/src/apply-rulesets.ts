#!/usr/bin/env tsx
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const RULESETS_DIR = join(REPO_ROOT, ".github", "rulesets");

type Ruleset = { id: number; name: string };

function gh(args: string[], input?: string): string {
  const res = spawnSync("gh", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  });
  if (res.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed with exit ${res.status}`);
  }
  return res.stdout;
}

function getRepoSlug(): string {
  const out = gh([
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "-q",
    ".nameWithOwner",
  ]).trim();
  if (!out) throw new Error("Could not determine current repo (gh repo view)");
  return out;
}

function listRulesets(repo: string): Ruleset[] {
  const out = gh([
    "api",
    "-H",
    "Accept: application/vnd.github+json",
    `/repos/${repo}/rulesets`,
  ]);
  const parsed = JSON.parse(out) as Ruleset[];
  return parsed;
}

function applyRuleset(
  repo: string,
  filePath: string,
  body: string,
  name: string,
  existing: Ruleset | undefined,
): void {
  if (existing) {
    console.log(`  → PUT /repos/${repo}/rulesets/${existing.id} (${name})`);
    gh(
      [
        "api",
        "--method",
        "PUT",
        "-H",
        "Accept: application/vnd.github+json",
        `/repos/${repo}/rulesets/${existing.id}`,
        "--input",
        "-",
      ],
      body,
    );
  } else {
    console.log(`  → POST /repos/${repo}/rulesets (${name})`);
    gh(
      [
        "api",
        "--method",
        "POST",
        "-H",
        "Accept: application/vnd.github+json",
        `/repos/${repo}/rulesets`,
        "--input",
        filePath,
      ],
    );
  }
}

function main(): void {
  const files = readdirSync(RULESETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(RULESETS_DIR, f))
    .sort();

  if (files.length === 0) {
    console.log(`No ruleset JSON files found in ${RULESETS_DIR}`);
    return;
  }

  const repo = getRepoSlug();
  console.log(`Applying ${files.length} ruleset(s) to ${repo}`);

  const existing = listRulesets(repo);
  const byName = new Map(existing.map((r) => [r.name, r]));

  for (const file of files) {
    const body = readFileSync(file, "utf8");
    let parsed: { name?: unknown };
    try {
      parsed = JSON.parse(body) as { name?: unknown };
    } catch (e) {
      throw new Error(`${file}: invalid JSON: ${(e as Error).message}`);
    }
    if (typeof parsed.name !== "string" || !parsed.name) {
      throw new Error(`${file}: missing required string "name" field`);
    }
    const name = parsed.name;
    console.log(`\n${file}`);
    applyRuleset(repo, file, body, name, byName.get(name));
  }

  console.log("\nDone.");
}

main();
