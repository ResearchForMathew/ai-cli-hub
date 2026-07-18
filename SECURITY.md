# Security policy

## Trust boundary

AI CLI Hub is a local process supervisor. Vendor-native CLIs own provider
authentication and model execution. The hub must not become a shared token
store or provider proxy.

## Invariants

- One ChatGPT account per Codex `CODEX_HOME`.
- Child processes receive a minimal environment allowlist. Known AI keys and
  other credential-like parent variables are not inherited by default.
- No shell interpolation when starting vendor processes.
- No prompt, response, transcript, raw argv, token, secret value, or full
  working-directory path in the hub ledger.
- Grok execution requires explicit repository-context consent.
- Temporary lanes fail closed after a configured expiry date.

## Local files

Runtime configuration and history are outside this repository:

- `~/.config/aih/config.json`
- `~/.local/share/aih/homes/`
- `~/.local/state/aih/history.jsonl`

Do not commit any of these files. If a credential appears in a process list,
debug log, crash report, shell history, or repository, rotate it at the provider
and remove the local copy after rotation.

## Reporting

This is initially a private repository. Record suspected issues in a private
GitHub issue without including credential values or provider transcripts.
