import type { MutableRefObject } from "react";
import type { SentenceDraft } from "./review-interactions";
import { createT } from "../lib/i18n";

export function ReviewSentenceEditor({
  focusedSentenceDraftId,
  language,
  sentenceDraftRefs,
  sentenceDrafts,
  setFocusedSentenceDraftId,
  updateSentenceDraft
}: {
  focusedSentenceDraftId: string | null;
  language: "en-US" | "system" | "zh-CN";
  sentenceDraftRefs: MutableRefObject<Record<string, HTMLTextAreaElement | null>>;
  sentenceDrafts: SentenceDraft[];
  setFocusedSentenceDraftId: (value: string | null) => void;
  updateSentenceDraft: (draftId: string, value: string) => void;
}) {
  const t = createT(language);
  if (sentenceDrafts.length === 0) {
    return null;
  }

  return (
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
              ref={(node) => {
                sentenceDraftRefs.current[draft.id] = node;
              }}
              aria-label={`sentence-draft-${index + 1}`}
              className={
                focusedSentenceDraftId === draft.id
                  ? "min-h-20 w-full rounded-lg border border-[color:var(--ring)] bg-[color:var(--surface)] px-3 py-2 text-sm leading-6 text-[color:var(--foreground)] outline-none ring-1 ring-[color:var(--ring)] focus:border-[color:var(--ring)] focus:ring-1 focus:ring-[color:var(--ring)]"
                  : "min-h-20 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm leading-6 text-[color:var(--foreground)] outline-none focus:border-[color:var(--ring)] focus:ring-1 focus:ring-[color:var(--ring)]"
              }
              value={draft.text}
              onFocus={() => setFocusedSentenceDraftId(draft.id)}
              onChange={(event) => updateSentenceDraft(draft.id, event.currentTarget.value)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function formatCueTime(startMs: number): string {
  const totalSeconds = Math.floor(startMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
