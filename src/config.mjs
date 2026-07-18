import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const SECRET_ENV_NAMES = Object.freeze([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_USE_VERTEX",
  "DEEPSEEK_API_KEY",
  "GOOGLE_API_KEY",
  "GROK_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_API_TOKEN",
  "SAKANA_API_KEY",
  "XAI_API_KEY",
  "XAI_TOKEN",
  "ZAI_API_KEY"
]);

export const SAFE_BASE_ENV_NAMES = Object.freeze([
  "COLORTERM",
  "FORCE_COLOR",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LOGNAME",
  "NO_COLOR",
  "PATH",
  "SHELL",
  "SSH_AUTH_SOCK",
  "TEMP",
  "TERM",
  "TERM_PROGRAM",
  "TERM_PROGRAM_VERSION",
  "TMP",
  "TMPDIR",
  "USER",
  "XDG_RUNTIME_DIR"
]);

export function expandPath(value, home = homedir()) {
  if (value === "~") return home;
  if (value.startsWith("~/")) return join(home, value.slice(2));
  return resolve(value);
}

export function defaultPaths(env = process.env, home = homedir()) {
  const configRoot = env.XDG_CONFIG_HOME || join(home, ".config");
  const dataRoot = env.XDG_DATA_HOME || join(home, ".local", "share");
  const stateRoot = env.XDG_STATE_HOME || join(home, ".local", "state");
  return {
    configPath: env.AIH_CONFIG || join(configRoot, "aih", "config.json"),
    dataRoot: env.AIH_DATA_HOME || join(dataRoot, "aih"),
    stateRoot: env.AIH_STATE_HOME || join(stateRoot, "aih")
  };
}

function codexLane(label, home) {
  return {
    provider: "codex",
    label,
    command: "codex",
    authMode: "chatgpt-oauth",
    env: {
      CODEX_HOME: home,
      CODEX_SQLITE_HOME: home
    },
    passEnv: [],
    unsetEnv: SECRET_ENV_NAMES,
    loginArgs: ["login"],
    statusArgs: ["login", "status"],
    interactiveArgs: [],
    printArgs: ["exec"]
  };
}

export function createDefaultConfig(paths = defaultPaths()) {
  const homes = join(paths.dataRoot, "homes");
  const zaiRoot = join(homes, "opencode-zai");
  return {
    version: 1,
    defaultLane: "codex-personal",
    lanes: {
      "codex-personal": codexLane("ChatGPT Personal", join(homes, "codex-personal")),
      "codex-business-a": codexLane("ChatGPT Business A", join(homes, "codex-business-a")),
      "codex-business-b": codexLane("ChatGPT Business B", join(homes, "codex-business-b")),
      "claude-max": {
        provider: "claude",
        label: "Claude Max",
        command: "claude",
        authMode: "claude-oauth",
        env: {},
        passEnv: [],
        unsetEnv: SECRET_ENV_NAMES,
        loginArgs: ["auth", "login"],
        statusArgs: ["auth", "status"],
        interactiveArgs: [],
        printArgs: ["--print"]
      },
      "grok-oauth": {
        provider: "grok",
        label: "Grok Subscription OAuth",
        command: "grok",
        authMode: "grok-oauth",
        env: {},
        passEnv: [],
        unsetEnv: SECRET_ENV_NAMES,
        loginArgs: ["login", "--oauth"],
        statusArgs: ["models"],
        interactiveArgs: ["--oauth"],
        printArgs: ["--oauth", "--single"],
        requiresProviderUploadConsent: true
      },
      "zai-temp": {
        provider: "opencode",
        label: "Z.AI Coding Plan (temporary)",
        command: "opencode",
        authMode: "opencode-oauth",
        temporary: true,
        expiresOn: null,
        env: {
          XDG_CONFIG_HOME: join(zaiRoot, "config"),
          XDG_DATA_HOME: join(zaiRoot, "data")
        },
        passEnv: [],
        unsetEnv: SECRET_ENV_NAMES,
        loginArgs: ["auth", "login"],
        statusArgs: ["auth", "list"],
        interactiveArgs: ["--model", "zai-coding-plan/glm-5.2"],
        printArgs: ["--model", "zai-coding-plan/glm-5.2", "run"]
      }
    }
  };
}

export function validateConfig(config) {
  if (!config || config.version !== 1 || !config.lanes || typeof config.lanes !== "object") {
    throw new Error("unsupported or malformed config; expected version 1 with lanes");
  }
  for (const [id, lane] of Object.entries(config.lanes)) {
    if (lane.passEnv === undefined) lane.passEnv = [];
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`invalid lane id: ${id}`);
    for (const key of ["provider", "label", "command", "authMode"]) {
      if (typeof lane[key] !== "string" || lane[key].length === 0) {
        throw new Error(`lane ${id} is missing ${key}`);
      }
    }
    for (const key of ["loginArgs", "statusArgs", "interactiveArgs", "printArgs", "unsetEnv", "passEnv"]) {
      if (!Array.isArray(lane[key]) || lane[key].some((item) => typeof item !== "string")) {
        throw new Error(`lane ${id} has invalid ${key}`);
      }
    }
    if (!lane.env || typeof lane.env !== "object" || Array.isArray(lane.env)) {
      throw new Error(`lane ${id} has invalid env`);
    }
  }
  if (!config.lanes[config.defaultLane]) throw new Error("defaultLane does not exist");
  return config;
}

export async function loadConfig(options = {}) {
  const paths = options.paths || defaultPaths(options.env, options.home);
  try {
    const parsed = JSON.parse(await readFile(paths.configPath, "utf8"));
    return { config: validateConfig(parsed), paths };
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`config not found: ${paths.configPath}; run 'aih init' first`);
    }
    throw error;
  }
}

export async function initializeConfig(options = {}) {
  const paths = options.paths || defaultPaths(options.env, options.home);
  let config;
  let created = false;
  await mkdir(dirname(paths.configPath), { recursive: true, mode: 0o700 });
  if (options.force) {
    config = createDefaultConfig(paths);
  } else {
    try {
      config = validateConfig(JSON.parse(await readFile(paths.configPath, "utf8")));
    } catch (error) {
      if (error.code === "ENOENT") {
        config = createDefaultConfig(paths);
        created = true;
      } else {
        throw error;
      }
    }
  }
  if (created || options.force) {
    await writeFile(paths.configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  }
  await chmod(paths.configPath, 0o600);

  for (const lane of Object.values(config.lanes)) {
    for (const value of Object.values(lane.env)) {
      await mkdir(expandPath(value, options.home), { recursive: true, mode: 0o700 });
    }
    if (lane.provider === "codex") {
      const codexHome = expandPath(lane.env.CODEX_HOME, options.home);
      const codexConfig = join(codexHome, "config.toml");
      try {
        await readFile(codexConfig, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await writeFile(codexConfig, 'cli_auth_credentials_store = "file"\n', { mode: 0o600 });
      }
    }
  }
  await mkdir(paths.stateRoot, { recursive: true, mode: 0o700 });
  return { config, paths, created };
}
