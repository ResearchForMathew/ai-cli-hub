import { access } from "node:fs/promises";
import { accessSync, constants } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { appendLedger, createRunMetadata } from "./ledger.mjs";
import { expandPath, SAFE_BASE_ENV_NAMES } from "./config.mjs";

export function findExecutable(command, env = process.env) {
  if (command.includes("/")) {
    const candidate = resolve(command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      return null;
    }
  }
  for (const directory of (env.PATH || "").split(delimiter)) {
    if (directory) {
      const candidate = join(directory, command);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {}
    }
  }
  return null;
}

export function buildChildEnv(lane, baseEnv = process.env, home) {
  const allowedNames = new Set([...SAFE_BASE_ENV_NAMES, ...lane.passEnv]);
  const env = {};
  const scrubbed = [];
  const explicitlyUnset = new Set(lane.unsetEnv);
  for (const [key, value] of Object.entries(baseEnv)) {
    if (explicitlyUnset.has(key)) {
      scrubbed.push(key);
      continue;
    }
    if (allowedNames.has(key)) {
      env[key] = value;
    } else if (/(?:AUTH|CREDENTIAL|KEY|PASSWORD|SECRET|TOKEN)/i.test(key)) {
      scrubbed.push(key);
    }
  }
  for (const [key, value] of Object.entries(lane.env)) {
    env[key] = expandPath(value, home);
  }
  env.AIH_ACTIVE_LANE = lane.label;
  return { env, scrubbed };
}

export function enforcePolicy(lane, options = {}) {
  if (lane.expiresOn) {
    const expiry = new Date(`${lane.expiresOn}T23:59:59Z`);
    if (Number.isNaN(expiry.valueOf())) throw new Error(`invalid expiresOn date: ${lane.expiresOn}`);
    if (Date.now() > expiry.valueOf()) throw new Error(`lane expired on ${lane.expiresOn}`);
  }
  if (lane.requiresProviderUploadConsent && !options.allowProviderUpload) {
    throw new Error("this lane may upload repository context; repeat with --allow-provider-upload");
  }
}

function waitForChild(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "inherit",
      shell: false
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code: code ?? (signal ? 128 : 1), signal }));
  });
}

export async function runLane({ laneId, lane, paths, mode, userArgs, cwd, allowProviderUpload, env, home }) {
  enforcePolicy(lane, { allowProviderUpload: mode === "login" || allowProviderUpload });
  const executable = findExecutable(lane.command, env);
  if (!executable) throw new Error(`command not found for ${laneId}: ${lane.command}`);
  const childEnv = buildChildEnv(lane, env, home);
  const modeArgs = mode === "print" ? lane.printArgs : mode === "login" ? lane.loginArgs : lane.interactiveArgs;
  const args = [...modeArgs, ...userArgs];
  const metadata = createRunMetadata({ laneId, provider: lane.provider, cwd, mode });
  const startedAt = new Date().toISOString();
  await appendLedger(paths.stateRoot, {
    event: "run_started",
    ...metadata,
    startedAt,
    scrubbedEnvNames: childEnv.scrubbed.sort()
  });
  const start = performance.now();
  try {
    const result = await waitForChild(executable, args, { cwd, env: childEnv.env });
    await appendLedger(paths.stateRoot, {
      event: "run_finished",
      ...metadata,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - start),
      exitCode: result.code,
      signal: result.signal || null
    });
    return result.code;
  } catch (error) {
    await appendLedger(paths.stateRoot, {
      event: "run_finished",
      ...metadata,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - start),
      exitCode: 1,
      errorClass: error.name
    });
    throw error;
  }
}

export async function pathIsExecutable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
