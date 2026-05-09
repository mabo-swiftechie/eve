# PR Draft: Bilingual Live Stage and Speaker Learning

## Suggested title

`feat: add bilingual live stage and speaker learning review flow`

## Suggested body

```md
## Summary
- add bilingual live stage foundations for improved speaker-named review output
- add `Review & Learn` workflow with audio playback, sentence cues, sentence editing, and structured manual corrections
- add speaker candidate review flow, including sentence-level candidate derivation, source metadata, locate actions, and instant preview updates

## What changed
- add live stage and review snapshot contracts shared between desktop main and renderer
- add speaker profile persistence, candidate persistence, and review store support for structured sentence corrections
- add `Review & Learn` UI for:
  - segment browsing
  - audio playback
  - cue jumping
  - sentence-level editing
  - speaker profile updates
  - candidate apply / keep note / reject actions
- add sentence-source metadata to candidates and link candidate cards to sentence drafts
- auto-play located candidate cues when audio is available or after the segment audio loads

## Verification
- `bun test apps/desktop/src/main/review-store.test.ts`
- `bun test apps/desktop/src/renderer/src/components/review-interactions.test.ts apps/desktop/src/renderer/src/components/review-learn.test.tsx`
- `bun run --filter ./apps/desktop typecheck`

## Notes
- the renderer test environment is still `node`, not `jsdom`, so the new review interaction coverage is implemented through extracted state helpers instead of browser-level click simulation
- `Review & Learn` has been split into smaller panels to keep file sizes within repo limits and make follow-up iteration safer

## Launch strategy note
- live bilingual meeting mode is now expected to move toward a `raw-first` display strategy
- the intended direction is progressive upgrade of the same segment:
  - `V0 Raw`
  - `V1 Fast Translate`
  - `V2 Speaker Improve`
  - `V3 Fluency Improve`
  - `V4 Stable Final`
- operator-facing display levels should stay simple:
  - `L1 Fast`
  - `L2 Balanced`
  - `L3 Stable`
- higher-quality stages must not block the first visible subtitle on screen
```

## Review self-check

### Scope
- `Live Stage` and `Review & Learn` are both represented in the branch
- the branch stays focused on bilingual review and speaker learning foundations
- the branch does not introduce unrelated app-wide behavior changes

### Data integrity
- raw, improved, manual, and translated transcript layers are still preserved separately
- structured sentence corrections are saved in sidecars instead of being flattened into one opaque blob
- sentence-level rule candidates are derived only from changed sentences
- whole-segment candidate fallback still works when sentence-level data is unavailable

### UX behavior
- named speakers are shown with concrete display names
- candidate cards show sentence origin and time window when available
- `Locate` moves review focus to the right sentence draft
- `Locate` also highlights and plays the matching cue when a cue is available
- audio playback still works when loaded manually and after deferred load

### Code health
- no touched file exceeds the 500-line repository limit
- `review-learn.tsx` was reduced to 386 lines by splitting audio and sentence editor panels
- review interaction state transitions are now covered by pure helper tests
- branch worktree is clean after the latest commit

### Remaining risks
- there is still no browser-DOM interaction test because the desktop vitest environment remains `node`
- candidate learning is still conservative and driven by review data; it does not yet include broader automatic rule mining heuristics
- the current live stage implementation has been wired to engine segments, but the raw-first progressive level model is still tracked as follow-up work
- upstream review may still ask for PR splitting because this branch covers multiple closely related review workflow milestones

## Current branch

- branch: `feature/bilingual-live-stage-speaker-learning-pr`
- compare: `https://github.com/nexmoe/eve/compare/main...mabo-swiftechie:feature/bilingual-live-stage-speaker-learning-pr?expand=1`
