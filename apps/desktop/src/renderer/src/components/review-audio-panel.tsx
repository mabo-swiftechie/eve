import type { RefObject } from "react";
import type { SentenceCue } from "@eve/shared";
import { cueKey, getCueAtTime } from "./review-interactions";
import { createT, type MessageKey } from "../lib/i18n";

export function ReviewAudioPanel({
  activeCueKey,
  audioDataUrl,
  audioLoading,
  audioMissing,
  audioRef,
  cueList,
  language,
  loadAudio,
  setActiveCueKey,
  jumpToCue
}: {
  activeCueKey: string | null;
  audioDataUrl: string | null;
  audioLoading: boolean;
  audioMissing: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  cueList: SentenceCue[];
  language: "en-US" | "system" | "zh-CN";
  loadAudio: () => Promise<void>;
  setActiveCueKey: (value: string | null) => void;
  jumpToCue: (cue: SentenceCue) => Promise<void>;
}) {
  const t = createT(language);

  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
            {t("reviewAudioLabel")}
          </p>
          <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">
            {describeAudioState({ audioDataUrl, audioMissing, t })}
          </p>
        </div>
        <button
          className="inline-flex h-8 items-center justify-center rounded-lg bg-[color:var(--surface)] px-3.5 text-xs font-medium text-[color:var(--foreground)] ring-1 ring-[color:var(--border)] shadow-[var(--shadow-raised-sm)]"
          disabled={audioLoading}
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
            const currentCue = getCueAtTime(cueList, Math.round(currentAudio.currentTime * 1000));
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
  );
}

function describeAudioState({
  audioDataUrl,
  audioMissing,
  t
}: {
  audioDataUrl: string | null;
  audioMissing: boolean;
  t: (key: MessageKey) => string;
}): string {
  if (audioDataUrl) {
    return t("reviewAudioReady");
  }
  if (audioMissing) {
    return t("reviewAudioMissing");
  }
  return t("reviewAudioDescription");
}

function formatCueTime(startMs: number): string {
  const totalSeconds = Math.floor(startMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
