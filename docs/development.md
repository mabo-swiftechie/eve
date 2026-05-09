# Development Guide

[← Back to README](../README.md)

## Project Structure

```text
apps/desktop        Electron main/preload/renderer, tray, packaging
packages/shared     Shared TypeScript contracts for main + renderer
scripts             Workspace-level development helpers
```

## Requirements

- [Bun](https://bun.sh/) >= 1.3.2
- `ffmpeg` for FLAC output and non-WAV transcription

```bash
brew install bun ffmpeg
```

## Install

```bash
bun install
```

## Development

```bash
bun run dev:desktop
bun run stop:desktop
bun run restart:desktop
```

The app is Electron-only. There is no Python runtime or CLI sidecar anymore.

Helpful workflow notes:

- `stop:desktop` targets matching Eve desktop development processes under the current workspace
- `restart:desktop` is a convenience wrapper around stop + start
- `bash scripts/stop-desktop.sh --dry-run` shows which processes would be stopped

To enable OpenAI Chinese-to-Japanese translation before launch, export:

```bash
export OPENAI_API_KEY="your_api_key_here"
export EVE_OPENAI_TRANSLATION_MODEL="gpt-5-mini"
```

- `OPENAI_API_KEY` is required
- `EVE_OPENAI_TRANSLATION_MODEL` is optional and defaults to `gpt-5-mini`

## Checks

```bash
bun run typecheck
bun run test
```

## Build Packages

```bash
bun run build
cd apps/desktop
bun run build:mac
bun run build:win
```

Build targets:

- macOS: `.dmg`, `.zip`, `.pkg`
- Windows: NSIS `.exe`

## Notes

- Models download on first use into the app user-data directory.
- `sherpa-onnx-node` is bundled with the Electron app and unpacked for production builds.
- New source files should stay under 500 lines.
