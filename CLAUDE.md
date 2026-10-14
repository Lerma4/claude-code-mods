# claude-code-mods

A Claude Code plugin marketplace. Each top-level folder is one mod.

## Layout

- `.claude-plugin/marketplace.json`: the marketplace manifest; lists every mod with its version and description
- `<mod>/.claude-plugin/plugin.json`: the mod manifest
- `<mod>/hooks/hooks.json`: points to the TSX module(s) Claude Code loads
- `<mod>/hooks/register.tsx`: the mod itself, written against the `claude-code` module API
- `<mod>/types/index.d.ts`: the mod's own state types (`PluginState` augmentation)
- `<mod>/tests/`: tests using `claude-code/testing`

## Rules

- **Bump the version on every change.** Update `version` in both `<mod>/.claude-plugin/plugin.json` and the matching entry in `marketplace.json`, and keep them identical. Installed copies only update when the version changes.
- Adding a mod means adding a folder and a new entry in `marketplace.json`.
- `.claude-plugin/types/` holds Claude Code's generated type definitions. It is gitignored and must not be committed.
- In-app strings are in Italian; keep new UI text consistent with that. Manifests and docs are in English.
- The repo is public: no paths, emails, tokens or other personal data in the code.
