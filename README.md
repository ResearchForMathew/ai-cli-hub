# AI CLI Hub

`aih` is a small, dependency-free supervisor for vendor-native AI coding CLIs.
It borrows Pi's lane-oriented terminal ergonomics while keeping authentication,
sessions, and policy inside the official Codex, Claude Code, Grok Build, and
OpenCode processes.

AI CLI Hub is designed for developers who use multiple vendor-native coding
CLIs and want to keep provider identities, sessions, and state isolated. A
typical setup can include:

- multiple isolated Codex lanes;
- optional Claude Code, Grok Build, and OpenCode lanes;
- provider-specific safety, consent, and expiry controls.

## Why a supervisor instead of one universal provider client?

Subscription OAuth behavior and account policy differ by vendor. `aih` does not
reimplement provider APIs, rotate accounts to evade limits, or copy tokens into
a shared store. Each lane invokes the installed vendor CLI with a minimal
allowlisted environment. Each Codex lane gets a distinct `CODEX_HOME`.

## Install locally

Requirements: Node.js 22 or newer and the vendor CLIs you intend to use.

```bash
git clone git@github.com:ResearchForMathew/ai-cli-hub.git
cd ai-cli-hub
npm install --ignore-scripts
npm link
aih init
aih doctor
```

`aih init` creates:

- `~/.config/aih/config.json` with mode `0600`;
- isolated homes below `~/.local/share/aih/homes/`;
- a metadata-only ledger below `~/.local/state/aih/`.

Override these paths with `AIH_CONFIG`, `AIH_DATA_HOME`, and `AIH_STATE_HOME`.
Running `aih init` again reconciles missing directories or Codex policy files
without replacing the existing lane configuration. `--force` regenerates the
default configuration.

## Lanes

```bash
aih lanes
aih show codex-personal
```

Default lane IDs:

- `codex-personal`
- `codex-business-a`
- `codex-business-b`
- `claude-max`
- `grok-oauth`
- `zai-temp`

The names are purpose labels, not automatic account discovery. Log into each
lane deliberately:

```bash
aih login codex-personal
aih login codex-business-a
aih login codex-business-b
aih login claude-max
aih login grok-oauth
aih login zai-temp
```

Codex lane logins open separate state roots. Do not copy
`auth.json` between them.

## Run

Interactive sessions:

```bash
aih run codex-personal
aih run claude-max
aih run zai-temp
```

Single prompt mode:

```bash
aih ask codex-personal "review the current diff"
aih ask claude-max "explain the failing test"
aih ask zai-temp "summarize this repository"
```

Pass native CLI options after `--`:

```bash
aih run codex-personal -- --sandbox read-only
aih run claude-max -- --permission-mode plan
```

Grok Build has an explicit repository-context consent gate because its workflow
may upload repository context:

```bash
aih run grok-oauth --allow-provider-upload
aih ask grok-oauth --allow-provider-upload "review this repository"
```

## History

```bash
aih history
aih history --limit 50
```

The JSONL ledger stores run ID, lane, provider, timestamps, duration, exit code,
hashed working directory, and Git branch/commit metadata. It does **not** store
raw arguments, prompts, responses, transcripts, environment values, tokens, or
full working-directory paths.

## Optional expiring OpenCode lane

The included `zai-temp` example defaults to `zai-coding-plan/glm-5.2`
in an isolated OpenCode data and config root. When the cancellation date is known, set `expiresOn` in
`~/.config/aih/config.json` using `YYYY-MM-DD`; the lane then fails closed after
that date.

## Development

```bash
npm run check
```

Tests use fake executables and do not call providers or spend tokens.

## Scope of v0.1

Included: lane selection, isolated Codex account homes, OAuth/API-key conflict
scrubbing, minimal environment allowlisting, login routing, interactive and
print modes, static doctor checks,
temporary-lane expiry policy, Grok upload consent, and metadata-only history.

Not included yet: a full-screen TUI, RPC server, Keychain-managed API-key lanes,
cross-machine sync, transcript aggregation, or automatic account rotation.
