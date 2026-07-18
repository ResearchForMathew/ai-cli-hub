# AI CLI Hub agent guidance

- Never commit credentials, OAuth tokens, provider session files, prompts, or transcripts.
- Keep this project dependency-free unless a dependency is explicitly approved.
- Vendor-native CLIs remain the execution and authentication boundary.
- Tests must use fake executables and temporary directories; never spend provider tokens.
- The ledger is metadata-only and must not store raw argv, prompt text, response text, environment values, or full working-directory paths.
- Run `npm run check` after changes.
