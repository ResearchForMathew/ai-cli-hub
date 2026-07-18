import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDefaultConfig, defaultPaths, initializeConfig, validateConfig } from "../src/config.mjs";

test("default config has three distinct Codex homes", () => {
  const config = createDefaultConfig({ dataRoot: "/data", stateRoot: "/state", configPath: "/config" });
  const homes = Object.values(config.lanes)
    .filter((lane) => lane.provider === "codex")
    .map((lane) => lane.env.CODEX_HOME);
  assert.equal(homes.length, 3);
  assert.equal(new Set(homes).size, 3);
});

test("initialize writes private config and Codex file credential policy", async () => {
  const home = await mkdtemp(join(tmpdir(), "aih-home-"));
  const paths = defaultPaths({}, home);
  await initializeConfig({ paths, home });
  assert.equal((await stat(paths.configPath)).mode & 0o777, 0o600);
  const config = JSON.parse(await readFile(paths.configPath, "utf8"));
  validateConfig(config);
  for (const lane of Object.values(config.lanes).filter((item) => item.provider === "codex")) {
    const codexConfig = await readFile(join(lane.env.CODEX_HOME, "config.toml"), "utf8");
    assert.match(codexConfig, /cli_auth_credentials_store = "file"/);
  }
});

test("initialize is idempotent and repairs missing Codex artifacts", async () => {
  const home = await mkdtemp(join(tmpdir(), "aih-repair-"));
  const paths = defaultPaths({}, home);
  const first = await initializeConfig({ paths, home });
  const target = first.config.lanes["codex-business-a"].env.CODEX_HOME;
  await unlink(join(target, "config.toml"));
  const second = await initializeConfig({ paths, home });
  assert.equal(second.created, false);
  assert.match(await readFile(join(target, "config.toml"), "utf8"), /cli_auth_credentials_store/);
});
