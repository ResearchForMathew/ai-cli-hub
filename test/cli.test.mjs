import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseHubArgs } from "../src/cli.mjs";
import { createDefaultConfig } from "../src/config.mjs";

test("upload consent is recognized only in the hub option prefix", () => {
  assert.deepEqual(parseHubArgs(["--allow-provider-upload", "review", "repo"]), {
    allowProviderUpload: true,
    args: ["review", "repo"]
  });
  assert.deepEqual(parseHubArgs(["review", "--allow-provider-upload"]), {
    allowProviderUpload: false,
    args: ["review", "--allow-provider-upload"]
  });
});

test("vendor options require an explicit separator", () => {
  assert.throws(() => parseHubArgs(["--sandbox", "read-only"]), /after --/);
  assert.deepEqual(parseHubArgs(["--", "--sandbox", "read-only"]), {
    allowProviderUpload: false,
    args: ["--sandbox", "read-only"]
  });
});

test("bin propagates doctor failure as a nonzero exit code", async () => {
  const root = await mkdtemp(join(tmpdir(), "aih-doctor-"));
  const configPath = join(root, "config.json");
  const config = createDefaultConfig({
    configPath,
    dataRoot: join(root, "data"),
    stateRoot: join(root, "state")
  });
  for (const lane of Object.values(config.lanes)) lane.command = join(root, "missing-command");
  await writeFile(configPath, `${JSON.stringify(config)}\n`);
  const result = spawnSync(process.execPath, ["bin/aih.mjs", "doctor"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      AIH_CONFIG: configPath,
      AIH_DATA_HOME: join(root, "data"),
      AIH_STATE_HOME: join(root, "state")
    }
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /doctor: 6 failure\(s\)/);
});
