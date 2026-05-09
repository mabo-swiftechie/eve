# Eve Recorder

English | [中文](README.zh.md)

Eve Recorder (formerly `eve`, short for `eavesdropper`) is a tray-first desktop recorder built with Electron. It records microphone audio for long sessions, segments files automatically, and uses `sherpa-onnx` with Qwen3 ASR plus Silero VAD for live transcription and offline reprocessing.

## Features

- Long-running microphone recording with automatic segmentation
- Live transcription powered by Qwen3 ASR (can be disabled)
- VAD-only recording — only speech segments are saved to disk
- Real-time waveform visualization
- Manual microphone selection with automatic switch to the more active input
- WAV and FLAC output
- Batch transcription of existing WAV/FLAC recordings
- Recording history viewer grouped by day
- Live Stage mode for stable Chinese/Japanese event display
- Review & Learn mode with raw / auto-improved / manual transcript layers
- Speaker profile storage with candidate correction rules
- System tray app with launch-at-login, start-on-launch, and auto-update
- Bilingual UI (English / 中文)
- Light / Dark / System theme

## Project Structure

```text
apps/desktop        Electron main/preload/renderer, tray, packaging
packages/shared     Shared TypeScript contracts for main + renderer
scripts             Workspace-level development helpers
```

## Desktop Preview

![Eve Recorder desktop app](docs/images/desktop-gui-preview.png)

## Download

- Release page: [nexmoe/eve Releases](https://github.com/nexmoe/eve/releases)
- macOS: `.dmg` or `.zip`
- Windows: `.exe` (NSIS installer)

The packaged app checks for updates automatically and installs them on quit.

## Runtime Notes

- Eve Recorder downloads Qwen3 ASR and Silero VAD model files on first use and caches them under the app user-data directory.

## Development Shortcuts

```bash
bun run dev:desktop
bun run stop:desktop
bun run restart:desktop
```

- `dev:desktop` starts the Electron desktop app in development mode
- `stop:desktop` stops matching Eve desktop development processes for the current workspace
- `restart:desktop` stops the current desktop dev processes, then starts them again
- `bash scripts/stop-desktop.sh --dry-run` shows which processes would be stopped

## OpenAI Live Translation

To backfill Japanese output for Chinese segments in `Live Stage`, export these before launch:

```bash
export OPENAI_API_KEY="your_api_key_here"
export EVE_OPENAI_TRANSLATION_MODEL="gpt-5-mini"
```

- without `OPENAI_API_KEY`, the app falls back to the local passthrough translator and keeps showing only source text
- `EVE_OPENAI_TRANSLATION_MODEL` is optional; the current default is `gpt-5-mini`
- the current integration is text-segment based: raw text appears first, then Japanese fills in asynchronously

## Review Workflow

- Use `History` to open a recording day in `Review & Learn`
- Review each segment with `raw`, `auto improved`, and `manual correction` text
- Save manual corrections to write back into the segment sidecar JSON
- Named speakers can keep notes, seen languages, and candidate correction rules
- Candidate rules can be confirmed or rejected from the speaker panel

## Output

- Audio and transcript JSON files are archived under `recordings/YYYYMMDD/`
- Filenames look like `eve_YYYYMMDD_HHMMSS.wav` or `.flac`
- Each segment writes a matching `.json` with transcript text and metadata

Example JSON:

```json
{
  "audio_file": "eve_20260201_120513.wav",
  "audio_path": "/path/to/recordings/20260201/eve_20260201_120513.wav",
  "backend": "sherpa-onnx",
  "created_at": "2026-02-01T12:05:13.000Z",
  "input_device": "MacBook Air Microphone",
  "model": "Qwen3 ASR",
  "segment_start_time": "2026-02-01T12:05:13.000Z",
  "status": "ok",
  "text": "Please stand up and stretch for a minute."
}
```

## More Documentation

- [Development Guide](docs/development.md)
- [Changelog](CHANGELOG.md)
