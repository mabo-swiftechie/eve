#!/usr/bin/env bash

set -euo pipefail

dry_run=0
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=1
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

mapfile -t targets < <(
  ps -axo pid=,command= 2>/dev/null |
    awk -v repo_root="$repo_root" '
      index($0, repo_root) == 0 { next }
      index($0, "bun run dev") > 0 ||
      index($0, "bun run dev:desktop") > 0 ||
      index($0, "electron-vite dev") > 0 ||
      index($0, "/Electron.app/Contents/MacOS/Electron .") > 0 ||
      index($0, "app-path=") > 0 ||
      index($0, "@esbuild/") > 0 { print }
    '
)

if [[ "${#targets[@]}" -eq 0 ]]; then
  echo "No desktop development processes found."
  exit 0
fi

pids=()
for line in "${targets[@]}"; do
  [[ -z "${line//[[:space:]]/}" ]] && continue
  line="${line#"${line%%[![:space:]]*}"}"
  pid="${line%% *}"
  command="${line#* }"
  [[ "$pid" =~ ^[0-9]+$ ]] || continue
  pids+=("$pid")
  if [[ "$dry_run" -eq 1 ]]; then
    echo "Would stop $pid $command"
  else
    echo "Stopping $pid $command"
  fi
done

if [[ "${#pids[@]}" -eq 0 ]]; then
  echo "No desktop development processes found."
  exit 0
fi

if [[ "$dry_run" -eq 0 ]]; then
  kill "${pids[@]}"
fi
