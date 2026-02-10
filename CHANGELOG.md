# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-06

### Changed

- Replace `find`-based scratchpad discovery with session index file for O(1) lookup
- Fix lossy path escaping — initial directory stored verbatim instead of reversed from hyphens
- Remove `UserPromptSubmit` staleness hook (`prompt-submit.sh`) — protocol instructions handle freshness
- Simplify `hasJq` check to use `execFileSync` instead of manual PATH iteration
- `hooks/hooks.json` uses real default path (`~/.claude/session-summary`) instead of unexpanded placeholder

### Fixed

- `cleanSettings` no longer logs "Removed hooks" when no hooks were actually ours
- `askChoice` logs "(defaulting to option 1)" on invalid input instead of silent fallback

## [1.0.0] - 2025-02-04

### Added

- Initial release
- Two-line statusline showing API domain, project, git branch, context %, and session summary
- SessionStart hook that injects the summary protocol
- UserPromptSubmit hook that nudges if summary becomes stale (>5 minutes)
- Update script for Claude to set the current task summary
- Setup skill (`/session-summary:setup`) for easy configuration
- Cross-platform stat compatibility (macOS and Linux)
- JSON parsing via Node.js
