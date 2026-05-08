import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { improveTranscript, type DesktopSnapshot, type SentenceCue } from "@eve/shared";
import { SpeakerProfilePanel } from "./speaker-profile-panel";
import {
  buildSentenceDrafts,
  composeSentenceDrafts,
  cueKey,
  getCueAtTime,
  type SentenceDraft
} from "./review-interactions";
import { createT } from "../lib/i18n";

export function ReviewLearn({
  actions,
  snapshot
}: {
  actions: {
    loadReviewAudio: (recordingId: string, segmentId: string) => Promise<string | null>;
    saveManualCorrection: (
      recordingId: string,
      segmentId: string,
      transcript: string
    ) => Promise<void>;
    updateSpeakerProfile: (
      profile: NonNullable<DesktopSnapshot["review"]["speakers"]>[number]
    ) => Promise<void>;
  };
  snapshot: DesktopSnapshot;
}) {
  const t = createT(snapshot.settings.desktop.language);
  const segments = snapshot.review.segments;
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    segments[0]?.segmentId ?? null
  );
  const activeSegment =
    segments.find((segment) => segment.segmentId === selectedSegmentId) ?? segments[0] ?? null;
  const currentDraft =
    activeSegment?.manualCorrectedTranscript ?? activeSegment?.improvedAutoTranscript ?? "";
  const [draftManual, setDraftManual] = useState(
    currentDraft
  );
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioMissing, setAudioMissing] = useState(false);
  const [activeCueKey, setActiveCueKey] = useState<string | null>(null);
  const [pendingCue, setPendingCue] = useState<SentenceCue | null>(null);
  const [sentenceDrafts, setSentenceDrafts] = useState<SentenceDraft[]>(
    activeSegment
      ? buildSentenceDrafts({
          cues: activeSegment.sentenceCues ?? [],
          language: activeSegment.detectedLanguage,
          seedText: currentDraft
        })
      : []
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pauseTimerRef = useRef<number | null>(null);
  const activeSpeaker =
    snapshot.review.speakers.find((speaker) => speaker.speakerId === activeSegment?.speakerId) ??
    null;
  const previewTranscript =
    activeSegment && activeSpeaker
      ? improveTranscript(activeSegment.rawTranscript, activeSegment.detectedLanguage, activeSpeaker)
      : activeSegment?.improvedAutoTranscript ?? activeSegment?.rawTranscript ?? "";
  const cueList = activeSegment?.sentenceCues ?? [];

  useEffect(() => {
    setSelectedSegmentId(segments[0]?.segmentId ?? null);
  }, [snapshot.review.selectedRecordingId]);

  useEffect(() => {
    const nextDraft = currentDraft;
    setDraftManual(nextDraft);
    setSentenceDrafts(
      activeSegment
        ? buildSentenceDrafts({
            cues: activeSegment.sentenceCues ?? [],
            language: activeSegment.detectedLanguage,
            seedText: nextDraft
          })
        : []
    );
  }, [
    currentDraft,
    activeSegment?.detectedLanguage,
    activeSegment?.segmentId,
    activeSegment?.sentenceCues
  ]);

  useEffect(() => {
    setAudioDataUrl(null);
    setAudioLoading(false);
    setAudioMissing(false);
    setActiveCueKey(null);
    setPendingCue(null);
  }, [activeSegment?.segmentId]);

  useEffect(() => {
    if (!audioDataUrl || !pendingCue || !audioRef.current) {
      return;
    }
    void playCue(audioRef.current, pendingCue, pauseTimerRef);
    setPendingCue(null);
  }, [audioDataUrl, pendingCue]);

  useEffect(() => {
    return () => {
      if (pauseTimerRef.current !== null) {
        window.clearTimeout(pauseTimerRef.current);
      }
    };
  }, []);

  if (!snapshot.review.selectedRecordingId) {
    return (
      <section className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--panel)] p-5 shadow-[var(--shadow-raised-sm)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
          {t("reviewModeTitle")}
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--foreground)]">
          {t("reviewModeDescription")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
          {t("reviewModeEmptyState")}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--panel)] p-5 shadow-[var(--shadow-raised-sm)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
          {t("reviewModeTitle")}
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--foreground)]">
          {t("reviewModeDescription")}
        </h2>
        <p className="mt-2 break-all text-xs leading-6 text-[color:var(--muted)]">
          {snapshot.review.selectedRecordingId}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
        <aside className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
            {t("reviewSegmentsTitle")}
          </p>
          <div className="mt-3 grid gap-2">
            {segments.map((segment) => (
              <button
                key={segment.segmentId}
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-left text-xs leading-5 text-[color:var(--foreground)]"
                type="button"
                onClick={() => setSelectedSegmentId(segment.segmentId)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{segment.speakerDisplayName}</span>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
                    {segment.detectedLanguage}
                  </span>
                </div>
                <p className="mt-1 line-clamp-3">
                  {segment.improvedAutoTranscript ?? segment.rawTranscript}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          {activeSegment ? (
            <div className="space-y-4">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] pb-3">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-[color:var(--foreground)]">
                    {activeSegment.speakerDisplayName}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">
                    {activeSegment.startAt}
                  </p>
                </div>
                <div className="rounded-full bg-[color:var(--panel)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  {activeSegment.status}
                </div>
              </header>

              <LayerBlock label={t("reviewRawLabel")} value={activeSegment.rawTranscript} />
              <LayerBlock
                label={t("reviewImprovedLabel")}
                value={activeSegment.improvedAutoTranscript ?? ""}
              />
              <LayerBlock label={t("reviewPreviewLabel")} value={previewTranscript} />
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                      {t("reviewAudioLabel")}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">
                      {audioDataUrl
                        ? t("reviewAudioReady")
                        : audioMissing
                          ? t("reviewAudioMissing")
                          : t("reviewAudioDescription")}
                    </p>
                  </div>
                  <button
                    className="inline-flex h-8 items-center justify-center rounded-lg bg-[color:var(--surface)] px-3.5 text-xs font-medium text-[color:var(--foreground)] ring-1 ring-[color:var(--border)] shadow-[var(--shadow-raised-sm)]"
                    disabled={!snapshot.review.selectedRecordingId || audioLoading}
                    type="button"
                    onClick={() => void loadAudio()}
                  >
                    {audioLoading ? t("reviewAudioLoading") : t("reviewAudioAction")}
                  </button>
                </div>
                {audioDataUrl ? (
                  <audio
                    ref={audioRef}
                    className="mt-3 w-full"
                    controls
                    onEnded={() => setActiveCueKey(null)}
                    preload="metadata"
                    src={audioDataUrl}
                    onPause={() => {
                      if (audioRef.current?.ended) {
                        setActiveCueKey(null);
                      }
                    }}
                    onTimeUpdate={() => {
                      const currentAudio = audioRef.current;
                      if (!currentAudio) {
                        return;
                      }
                      const currentCue = getCueAtTime(
                        cueList,
                        Math.round(currentAudio.currentTime * 1000)
                      );
                      setActiveCueKey(currentCue ? cueKey(currentCue) : null);
                    }}
                  />
                ) : null}
                {cueList.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                      {t("reviewSentenceCuesTitle")}
                    </p>
                    <div className="grid gap-2">
                      {cueList.map((cue, index) => (
                        <button
                          key={`${cue.startMs}:${cue.endMs}:${index}`}
                          aria-pressed={activeCueKey === cueKey(cue)}
                          className={
                            activeCueKey === cueKey(cue)
                              ? "rounded-lg border border-[color:var(--ring)] bg-[color:var(--surface)] px-3 py-2 text-left text-xs leading-5 text-[color:var(--foreground)] ring-1 ring-[color:var(--ring)]"
                              : "rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-left text-xs leading-5 text-[color:var(--foreground)]"
                          }
                          type="button"
                          onClick={() => void jumpToCue(cue)}
                        >
                          <span className="font-semibold text-[color:var(--muted)]">
                            {formatCueTime(cue.startMs)}
                          </span>
                          <span className="ml-2">{cue.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                  {t("reviewManualLabel")}
                </span>
                <textarea
                  className="min-h-28 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-sm leading-7 text-[color:var(--foreground)] outline-none focus:border-[color:var(--ring)] focus:ring-1 focus:ring-[color:var(--ring)]"
                  value={draftManual}
                  onChange={(event) => setDraftManual(event.currentTarget.value)}
                />
              </label>
              {sentenceDrafts.length > 0 ? (
                <div className="space-y-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                    {t("reviewSentenceEditorTitle")}
                  </p>
                  <div className="grid gap-3">
                    {sentenceDrafts.map((draft, index) => (
                      <label key={draft.id} className="block space-y-1">
                        <span className="text-[11px] font-semibold text-[color:var(--muted)]">
                          {draft.cue ? formatCueTime(draft.cue.startMs) : `${index + 1}`}
                        </span>
                        <textarea
                          className="min-h-20 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm leading-6 text-[color:var(--foreground)] outline-none focus:border-[color:var(--ring)] focus:ring-1 focus:ring-[color:var(--ring)]"
                          value={draft.text}
                          onChange={(event) => {
                            if (!activeSegment) {
                              return;
                            }
                            const nextSentenceDrafts = sentenceDrafts.map((item) =>
                              item.id === draft.id
                                ? { ...item, text: event.currentTarget.value }
                                : item
                            );
                            setSentenceDrafts(nextSentenceDrafts);
                            setDraftManual(
                              composeSentenceDrafts({
                                drafts: nextSentenceDrafts,
                                language: activeSegment.detectedLanguage
                              })
                            );
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              {activeSegment.jaTranslation ? (
                <LayerBlock label={t("reviewTranslationLabel")} value={activeSegment.jaTranslation} />
              ) : null}

              <div className="flex justify-end">
                <button
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-gradient-to-b from-[color:var(--accent)] to-[color:color-mix(in_srgb,var(--accent)_85%,black)] px-3.5 text-xs font-medium text-[color:var(--accent-foreground)] shadow-[var(--shadow-raised)]"
                  type="button"
                  onClick={() =>
                    void actions.saveManualCorrection(
                      snapshot.review.selectedRecordingId!,
                      activeSegment.segmentId,
                      draftManual
                    )
                  }
                >
                  {t("reviewSaveManualAction")}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-6 text-[color:var(--muted)]">
              {t("reviewSegmentsEmpty")}
            </p>
          )}
        </div>

        <SpeakerProfilePanel
          actions={{ updateSpeakerProfile: actions.updateSpeakerProfile }}
          language={snapshot.settings.desktop.language}
          profile={activeSpeaker}
        />
      </div>
    </section>
  );

  async function loadAudio(): Promise<void> {
    if (!snapshot.review.selectedRecordingId || !activeSegment) {
      return;
    }
    setAudioLoading(true);
    setAudioMissing(false);
    try {
      const nextAudioDataUrl = await actions.loadReviewAudio(
        snapshot.review.selectedRecordingId,
        activeSegment.segmentId
      );
      setAudioDataUrl(nextAudioDataUrl);
      setAudioMissing(nextAudioDataUrl === null);
    } finally {
      setAudioLoading(false);
    }
  }

  async function jumpToCue(cue: SentenceCue): Promise<void> {
    const currentAudio = audioRef.current;
    setActiveCueKey(cueKey(cue));
    if (audioDataUrl && currentAudio) {
      await playCue(currentAudio, cue, pauseTimerRef);
      return;
    }
    setPendingCue(cue);
    await loadAudio();
  }
}

async function playCue(
  audio: HTMLAudioElement,
  cue: SentenceCue,
  pauseTimerRef: MutableRefObject<number | null>
): Promise<void> {
  if (pauseTimerRef.current !== null) {
    window.clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = null;
  }
  audio.currentTime = cue.startMs / 1000;
  await audio.play();
  pauseTimerRef.current = window.setTimeout(() => {
    audio.pause();
    pauseTimerRef.current = null;
  }, Math.max(cue.endMs - cue.startMs, 500));
}

function formatCueTime(startMs: number): string {
  const totalSeconds = Math.floor(startMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function LayerBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[color:var(--foreground)]">
        {value}
      </p>
    </div>
  );
}
