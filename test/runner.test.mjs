import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChildEnv, enforcePolicy, findExecutable, runLane } from "../src/runner.mjs";

const lane = {
  provider: "fake",
  label: "Fake OAuth",
  command: "fake-agent",
  authMode: "oauth",
  env: { CODEX_HOME: "/isolated" },
  passEnv: [],
  unsetEnv: ["OPENAI_API_KEY", "XAI_API_KEY"],
  loginArgs: ["login"],
  statusArgs: ["status"],
  interactiveArgs: [],
  printArgs: ["print"]
};

test("child environment removes secret values and applies lane home", () => {
  const result = buildChildEnv(lane, {
    PATH: "/bin",
    OPENAI_API_KEY: "secret-openai",
    XAI_API_KEY: "secret-xai",
    AWS_SECRET_ACCESS_KEY: "secret-aws",
    GITHUB_TOKEN: "secret-github",
    SAFE: "yes"
  });
  assert.equal(result.env.OPENAI_API_KEY, undefined);
  assert.equal(result.env.XAI_API_KEY, undefined);
  assert.equal(result.env.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(result.env.GITHUB_TOKEN, undefined);
  assert.equal(result.env.SAFE, undefined);
  assert.equal(result.env.CODEX_HOME, "/isolated");
  assert.deepEqual(result.scrubbed.sort(), [
    "AWS_SECRET_ACCESS_KEY",
    "GITHUB_TOKEN",
    "OPENAI_API_KEY",
    "XAI_API_KEY"
  ]);
});

test("slash command must exist and be executable", async () => {
  const root = await mkdtemp(join(tmpdir(), "aih-command-"));
  const missing = join(root, "missing-agent");
  assert.equal(findExecutable(missing, { PATH: "" }), null);
  const present = join(root, "present-agent");
  await writeFile(present, "#!/bin/sh\nexit 0\n");
  await chmod(present, 0o755);
  assert.equal(findExecutable(present, { PATH: "" }), present);
});

test("provider upload lane fails closed without explicit consent", () => {
  assert.throws(
    () => enforcePolicy({ ...lane, requiresProviderUploadConsent: true }),
    /allow-provider-upload/
  );
  assert.doesNotThrow(() => enforcePolicy(
    { ...lane, requiresProviderUploadConsent: true },
    { allowProviderUpload: true }
  ));
});

test("metadata ledger never stores prompt, argv, secret, or full cwd", async () => {
  const root = await mkdtemp(join(tmpdir(), "aih-run-"));
  const bin = join(root, "bin");
  const stateRoot = join(root, "state");
  const script = join(bin, "fake-agent");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(bin, { recursive: true }));
  await writeFile(script, "#!/bin/sh\nexit 0\n");
  await chmod(script, 0o755);
  const prompt = "do-not-store-this-prompt";
  const secret = "do-not-store-this-secret";
  const code = await runLane({
    laneId: "fake",
    lane,
    paths: { stateRoot },
    mode: "print",
    userArgs: [prompt],
    cwd: root,
    allowProviderUpload: false,
    env: { PATH: bin, OPENAI_API_KEY: secret }
  });
  assert.equal(code, 0);
  const ledger = await readFile(join(stateRoot, "history.jsonl"), "utf8");
  assert.doesNotMatch(ledger, new RegExp(prompt));
  assert.doesNotMatch(ledger, new RegExp(secret));
  assert.doesNotMatch(ledger, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(ledger, /argv/);
});
