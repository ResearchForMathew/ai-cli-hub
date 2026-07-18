import { createHash, randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

function hashText(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function gitMetadata(cwd) {
  const run = (args) => spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const root = run(["rev-parse", "--show-toplevel"]);
  if (root.status !== 0) return null;
  const branch = run(["branch", "--show-current"]);
  const commit = run(["rev-parse", "--short=12", "HEAD"]);
  return {
    repo: basename(root.stdout.trim()),
    branch: branch.status === 0 ? branch.stdout.trim() || null : null,
    commit: commit.status === 0 ? commit.stdout.trim() : null
  };
}

export function createRunMetadata({ laneId, provider, cwd, mode }) {
  return {
    runId: randomUUID(),
    lane: laneId,
    provider,
    mode,
    cwdName: basename(cwd),
    cwdHash: hashText(cwd),
    git: gitMetadata(cwd)
  };
}

export async function appendLedger(stateRoot, event) {
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  const path = join(stateRoot, "history.jsonl");
  await appendFile(path, `${JSON.stringify(event)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function readHistory(stateRoot, limit = 20) {
  const path = join(stateRoot, "history.jsonl");
  try {
    const records = (await readFile(path, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return records.filter((item) => item.event === "run_finished").slice(-limit).reverse();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
