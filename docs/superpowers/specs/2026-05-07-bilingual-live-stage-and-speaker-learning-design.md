# Bilingual Live Stage And Speaker Learning Design

## Goal

Add a first-version bilingual live subtitle experience for Chinese and Japanese event scenarios, while introducing a speaker-bound correction and learning system that improves transcript quality over time without losing the original ASR output.

## Scope

This design covers:

- A `Live Stage` mode for Japanese event display
- A `Review & Learn` mode for post-recording correction
- Speaker-bound transcript enhancement for both Chinese and Japanese speech
- A first-version learning loop based on raw transcript, auto-improved transcript, and manual correction
- Project structure and milestone planning for managing this work in-repo

This design does not cover:

- English or Korean live translation
- Free-form paraphrasing or summarization as transcript improvement
- Real-time manual editing on the stage screen
- Fully autonomous long-term learning without review
- Multi-operator conference control backends

## Product Direction

The first release targets event and sharing-session usage where Chinese and Japanese may both appear in the same room. The system should prioritize stable stage display and traceable post-event correction over aggressive real-time rewriting.

The display strategy is:

- Real-time stage view shows only improved text and required translation
- Review view keeps raw transcript, improved transcript, manual correction, and audio together
- Named speakers always display a concrete person name instead of generic placeholders such as `current`

The language strategy is:

- Chinese speech: show improved Chinese plus Japanese translation
- Japanese speech: show improved Japanese on stage
- Other language pairs remain explicit future extensions

## System Boundaries

The feature is split into two coordinated subsystems.

### 1. Live Bilingual Pipeline

Responsibilities:

- Capture audio with the existing desktop recording pipeline
- Detect or carry forward the speaker identity
- Detect the current segment language
- Generate an auto-improved transcript from the raw ASR result
- Generate Japanese translation for Chinese segments
- Render stable bilingual output for stage display

This subsystem is optimized for low-friction display, not for deep editing.

### 2. Speaker Learning Pipeline

Responsibilities:

- Replay recorded audio
- Allow correction by segment and by sentence
- Compare raw transcript, auto-improved transcript, and manual correction
- Produce and manage speaker-specific correction assets
- Feed low-risk confirmed improvements back into the real-time path

This subsystem is optimized for traceability and cumulative improvement.

## End-To-End Data Flow

### Capture

The existing recording, VAD, ASR, and speaker identification flow continues to produce speech segments. Each stable segment becomes the input unit for the new system.

Required segment payload at capture time:

- `speakerId`
- `speakerDisplayName`
- `detectedLanguage`
- `startAt`
- `endAt`
- `audioClipRef`
- `rawTranscript`
- `recordingId`

### Enhancement

For each segment, the system loads the speaker profile and applies conservative enhancement rules for that speaker and language.

The enhancement order is:

1. Shared terms
2. Speaker-specific lexicon corrections
3. Speaker-specific phrase corrections
4. Conservative fluency cleanup

The raw transcript is never overwritten.

### Translation

The first version only guarantees `Chinese -> Japanese` translation in the live path.

- If the segment language is Chinese:
  - produce `jaTranslation`
- If the segment language is Japanese:
  - skip stage-side Chinese translation
  - keep improved Japanese as the primary display output

### Presentation

Two separate presentation surfaces consume the same underlying records.

- `Live Stage` reads speaker name, improved transcript, and Japanese translation when needed
- `Review & Learn` reads raw transcript, improved transcript, manual correction, translation output, and audio references

## Data Model

### SegmentRecord

Each speech unit is stored as a `SegmentRecord`.

Required fields:

- `segmentId`
- `recordingId`
- `speakerId`
- `speakerDisplayName`
- `detectedLanguage`
- `startAt`
- `endAt`
- `audioClipRef`
- `rawTranscript`
- `improvedAutoTranscript`
- `manualCorrectedTranscript`
- `jaTranslation`
- `status`

Recommended status values:

- `raw_only`
- `auto_improved`
- `manually_corrected`
- `translation_ready`

This supports one storage model for live use, history review, and future analytics.

### SpeakerProfile

Speaker identity must be modeled separately from display naming so that future renaming does not break historical references.

Required fields:

- `speakerId`
- `displayName`
- `aliases`
- `notes`
- `languagesSeen`
- `correctionLexiconZh`
- `correctionLexiconJa`
- `sharedTerms`
- `styleRulesZh`
- `styleRulesJa`
- `ruleCandidates`
- `updatedAt`

This structure intentionally separates three kinds of assets:

- `sharedTerms`
  - person names, company names, product names, event terminology
- language-specific lexicons
  - high-confidence word and phrase corrections for that speaker
- language-specific style rules
  - conservative cleanup rules for fluency, not semantic rewriting

## Improvement Boundary

The first version of `improvedAutoTranscript` must remain conservative.

Allowed operations:

- Word-level correction
- Fixed phrase correction
- Conservative fluency cleanup

Disallowed operations:

- Free paraphrasing
- Summary-like rewriting
- Meaning-changing restructuring

This boundary is required so the user can trust the improved result while still auditing it against the original audio.

## Segment And Sentence Relationship

The default operating unit is a stable semantic segment.

- `Segment` is the primary unit for live display and historical review
- `Sentence` is a child unit used only when the user expands a segment during review

Implications:

- Live display updates per stable segment, not per token
- Review defaults to segment editing
- Fine-grained sentence editing is available without changing the top-level storage model
- Learning results attach primarily to the speaker profile, not to one recording

## Learning Loop

The system maintains three transcript layers:

- `rawTranscript`
- `improvedAutoTranscript`
- `manualCorrectedTranscript`

The learning sequence is:

1. ASR produces `rawTranscript`
2. Enhancement produces `improvedAutoTranscript`
3. User reviews audio and saves `manualCorrectedTranscript`
4. System compares `raw -> auto -> manual`
5. System derives `ruleCandidates`
6. Confirmed low-risk candidates are promoted into speaker assets

This ensures that correction quality improves over time without making the raw source unrecoverable.

## Automatic Rule Derivation

The system should support automatic pattern discovery, but only through controlled candidate generation.

Rules for the first version:

- Automatic derivation creates `candidate` rules, not strong rules
- Strong rules should come from:
  - explicit user confirmation
  - repeated high-frequency, low-risk candidate patterns
- Risky or ambiguous patterns remain candidates until reviewed

This prevents one bad correction from polluting a speaker's long-term enhancement profile.

## Live Stage UI

The project should add a dedicated `Live Stage` mode instead of overloading the current home screen.

First-version supported layouts:

- Primary: single-screen dual-column layout
- Future extension: subtitle-bar layout

Display rules:

- Chinese speech:
  - left column shows improved Chinese
  - right column shows Japanese translation
- Japanese speech:
  - left column shows improved Japanese
  - right column may stay empty or use a low-noise placeholder
- Named speakers:
  - always show the concrete person name
- Unnamed speakers:
  - use a stable fallback such as `Speaker A`

Refresh rules:

- Update by stable semantic segment
- Do not stream token-by-token edits onto the stage
- Translation may lag slightly behind the source segment if it preserves semantic alignment

## Review & Learn UI

The project should add a dedicated `Review & Learn` mode for post-recording correction and speaker training.

Primary capabilities:

- Browse recordings by day and session
- Filter by speaker
- Replay original audio
- Review by segment by default
- Expand segment into sentence-level editing when needed
- View:
  - raw transcript
  - auto-improved transcript
  - manual corrected transcript
  - Japanese translation
- Decide whether a correction should influence long-term speaker assets
- Review system-generated candidate rules

This mode becomes the operational center for training transcript quality over time.

## Speaker Management

The project should add basic speaker asset management inside settings or review mode.

First-version capabilities:

- Bind and update `displayName`
- View observed languages for a speaker
- View and edit:
  - shared terms
  - correction lexicons
  - style rules
  - candidate rules
- Confirm or reject candidate rules

The storage model must support renamed speakers without rewriting historical segment ownership.

## Project Management In Repo

This work should be managed through three documentation layers in the repository.

### 1. Spec

This design document defines product goals, boundaries, data models, UI, and the learning loop.

### 2. Implementation Plan

A follow-up plan should convert this design into executable tasks with exact files, tests, and milestones.

### 3. Tracking Documents

Milestones should be tracked explicitly so this feature does not become an unbounded stream of UI and ML changes.

Recommended milestones:

- `M1` Live Stage
- `M2` Review & Learn
- `M3` Speaker Assets
- `M4` Candidate Workflow

## First-Version Scope Freeze

The first release should include only:

- Chinese and Japanese support
- `Live Stage` dual-column mode
- Concrete speaker names for named speakers
- Speaker-bound transcript enhancement for Chinese and Japanese
- Audio-backed review and correction
- Candidate-driven learning workflow

The first release should not include:

- English live translation
- Free-form transcript rewriting
- Real-time stage editing
- Fully automatic permanent rule writing
- Advanced event control surfaces

## Risks And Controls

### Risk 1: Bad learning gets permanently encoded

Controls:

- Preserve raw, auto-improved, and manual layers
- Keep automatic derivation in `candidate` state first
- Promote only low-risk confirmed rules

### Risk 2: Stage text feels unstable

Controls:

- Refresh only on stable semantic segments
- Allow translation delay when needed
- Avoid token-level stage rendering

### Risk 3: Speaker identification is imperfect

Controls:

- Bind behavior to `speakerId`
- Use weaker enhancement when speaker confidence is low
- Allow later renaming without historical breakage

### Risk 4: Mixed Chinese and Japanese speech increases path complexity

Controls:

- Detect language per segment
- Route Chinese segments to `improve + translate`
- Route Japanese segments to `improve only`
- Keep reverse translation outside first-version scope

## Milestones

### M1: Live Stage

- Add dedicated stage mode
- Show speaker names
- Show improved Chinese and Japanese translation for Chinese segments
- Show improved Japanese for Japanese segments
- Use stable semantic segment refresh

### M2: Review & Learn

- Add audio playback in history flow
- Support segment-level correction
- Support sentence-level expansion and correction
- Persist raw, auto-improved, and manual layers

### M3: Speaker Assets

- Add `SpeakerProfile`
- Store shared terms, lexicons, and style rules
- Ensure named speakers always resolve to concrete display names

### M4: Candidate Workflow

- Generate rule candidates from correction diffs
- Review, confirm, or reject candidate rules
- Feed confirmed low-risk rules back into the live enhancement path

## Acceptance Criteria

The first version is successful when:

- Named speakers display concrete person names in live stage and history views
- Chinese speech produces improved Chinese and Japanese translation in live stage mode
- Japanese speech produces improved Japanese in live stage mode
- History and review surfaces support audio playback with raw, improved, and manual transcript layers
- Manual correction can enrich long-term speaker assets
- Automatic derivation improves the system only through controlled candidate promotion

## Open Extensions

Explicit future extensions after the first version:

- `Chinese -> English`
- `Japanese -> English`
- `Japanese -> Chinese`
- Subtitle-bar optimized stage mode
- Higher-confidence automatic rule promotion
- Multi-operator event workflows
