import { realpath } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { expandPath, initializeConfig, loadConfig } from "./config.mjs";
import { readHistory } from "./ledger.mjs";
import { buildChildEnv, findExecutable, runLane } from "./runner.mjs";

const HELP = `AI CLI Hub (aih)

Usage:
  aih init [--force]
  aih lanes
  aih show <lane>
  aih login <lane>
  aih run <lane> [--allow-provider-upload] [-- <vendor args...>]
  aih ask <lane> [--allow-provider-upload] <prompt>
  aih doctor
  aih history [--limit N]
  aih config-path

The hub launches vendor-native CLIs and stores metadata only. It never stores
prompt text, response text, raw argv, tokens, or secret values.`;

function laneOrThrow(config, id) {
  const lane = config.lanes[id];
  if (!lane) throw new Error(`unknown lane '${id}'; run 'aih lanes'`);
  return lane;
}

export function parseHubArgs(args) {
  let index = 0;
  let allowProviderUpload = false;
  while (index < args.length && args[index].startsWith("--")) {
    const value = args[index];
    if (value === "--") {
      index += 1;
      break;
    }
    if (value !== "--allow-provider-upload") {
      throw new Error(`unknown hub option '${value}'; place vendor options after --`);
    }
    allowProviderUpload = true;
    index += 1;
  }
  return {
    allowProviderUpload,
    args: args.slice(index)
  };
}

async function canonicalPath(value, home) {
  const expanded = expandPath(value, home);
  try {
    return await realpath(expanded);
  } catch {
    return resolve(expanded);
  }
}

function renderLane(id, lane, env = process.env) {
  const executable = findExecutable(lane.command, env);
  const temporary = lane.temporary ? " temporary" : "";
  return `${id.padEnd(22)} ${lane.provider.padEnd(9)} ${executable ? "ready" : "missing"}${temporary}  ${lane.label}`;
}

export async function main(argv, context = {}) {
  const env = context.env || process.env;
  const cwd = context.cwd || process.cwd();
  const home = context.home;
  const output = context.output || console.log;
  const errorOutput = context.errorOutput || console.error;
  const [command = "help", ...rest] = argv;

  if (["help", "--help", "-h"].includes(command)) {
    output(HELP);
    return 0;
  }

  if (command === "init") {
    const result = await initializeConfig({ env, home, force: rest.includes("--force"), paths: context.paths });
    output(`${result.created ? "created" : "reconciled"} ${result.paths.configPath}`);
    output(`state   ${result.paths.stateRoot}`);
    output("next: run 'aih doctor', then 'aih login <lane>'");
    return 0;
  }

  const { config, paths } = await loadConfig({ env, home, paths: context.paths });

  if (command === "config-path") {
    output(paths.configPath);
    return 0;
  }

  if (["lanes", "list"].includes(command)) {
    for (const [id, lane] of Object.entries(config.lanes)) output(renderLane(id, lane, env));
    return 0;
  }

  if (command === "show") {
    const id = rest[0];
    const lane = laneOrThrow(config, id);
    const child = buildChildEnv(lane, env, home);
    output(JSON.stringify({
      id,
      provider: lane.provider,
      label: lane.label,
      command: lane.command,
      authMode: lane.authMode,
      temporary: Boolean(lane.temporary),
      expiresOn: lane.expiresOn || null,
      envPaths: lane.env,
      scrubbedEnvNames: child.scrubbed.sort()
    }, null, 2));
    return 0;
  }

  if (command === "doctor") {
    let failures = 0;
    const codexHomes = new Set();
    for (const [id, lane] of Object.entries(config.lanes)) {
      const executable = findExecutable(lane.command, env);
      if (!executable) failures += 1;
      if (lane.provider === "codex") {
        const homePath = await canonicalPath(lane.env.CODEX_HOME, home);
        if (codexHomes.has(homePath)) {
          failures += 1;
          errorOutput(`FAIL ${id}: CODEX_HOME is shared`);
        }
        codexHomes.add(homePath);
      }
      output(`${executable ? "PASS" : "FAIL"} ${renderLane(id, lane, env)}`);
      if (lane.temporary && !lane.expiresOn) output(`WARN ${id}: temporary lane has no expiresOn date`);
    }
    output(`${failures === 0 ? "PASS" : "FAIL"} distinct Codex homes: ${codexHomes.size}`);
    output(failures === 0 ? "doctor: healthy" : `doctor: ${failures} failure(s)`);
    return failures === 0 ? 0 : 1;
  }

  if (command === "history") {
    const limitIndex = rest.indexOf("--limit");
    const limit = limitIndex >= 0 ? Number(rest[limitIndex + 1]) : 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("--limit must be 1..1000");
    const records = await readHistory(paths.stateRoot, limit);
    if (records.length === 0) {
      output("no completed runs");
      return 0;
    }
    for (const item of records) {
      const repo = item.git?.repo || item.cwdName;
      output(`${item.finishedAt} ${item.lane} ${item.mode} exit=${item.exitCode} repo=${repo} run=${item.runId}`);
    }
    return 0;
  }

  if (["login", "run", "ask"].includes(command)) {
    const id = rest[0] || config.defaultLane;
    const lane = laneOrThrow(config, id);
    const parsed = parseHubArgs(rest.slice(1));
    const mode = command === "ask" ? "print" : command;
    if (mode === "print" && parsed.args.length === 0) throw new Error("ask requires a prompt");
    const userArgs = mode === "print" ? [parsed.args.join(" ")] : parsed.args;
    const code = await runLane({
      laneId: id,
      lane,
      paths,
      mode,
      userArgs,
      cwd,
      allowProviderUpload: parsed.allowProviderUpload,
      env,
      home
    });
    if (context.setExitCode !== false) process.exitCode = code;
    return code;
  }

  throw new Error(`unknown command '${basename(command)}'; run 'aih help'`);
}
