import { useEffect, useState } from "react";
import type { SpeakerProfile } from "@eve/shared";
import { createT } from "../lib/i18n";

export function SpeakerProfilePanel({
  actions,
  language,
  profile
}: {
  actions: {
    updateSpeakerProfile: (profile: SpeakerProfile) => Promise<void>;
  };
  language: "en-US" | "system" | "zh-CN";
  profile: SpeakerProfile | null;
}) {
  const t = createT(language);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [notes, setNotes] = useState(profile?.notes ?? "");

  useEffect(() => {
    setDisplayName(profile?.displayName ?? "");
    setNotes(profile?.notes ?? "");
  }, [profile?.displayName, profile?.notes, profile?.speakerId]);

  if (!profile) {
    return (
      <aside className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
          {t("reviewSpeakerTitle")}
        </p>
        <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
          {t("reviewSpeakerEmpty")}
        </p>
      </aside>
    );
  }

  return (
    <aside className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
        {t("reviewSpeakerTitle")}
      </p>
      <div className="mt-4 space-y-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
            {t("reviewSpeakerName")}
          </span>
          <input
            className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 text-xs text-[color:var(--foreground)] outline-none focus:border-[color:var(--ring)] focus:ring-1 focus:ring-[color:var(--ring)]"
            value={displayName}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
            {t("reviewSpeakerNotes")}
          </span>
          <textarea
            className="min-h-24 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-xs leading-6 text-[color:var(--foreground)] outline-none focus:border-[color:var(--ring)] focus:ring-1 focus:ring-[color:var(--ring)]"
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
        </label>
        <dl className="grid gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[color:var(--muted)]">{t("reviewSpeakerLanguages")}</dt>
            <dd className="text-right text-[color:var(--foreground)]">
              {profile.languagesSeen.join(", ") || "unknown"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[color:var(--muted)]">{t("reviewSpeakerCandidates")}</dt>
            <dd className="text-right text-[color:var(--foreground)]">
              {profile.ruleCandidates.length}
            </dd>
          </div>
        </dl>
        {profile.ruleCandidates.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
              {t("reviewSpeakerCandidateList")}
            </p>
            <div className="grid gap-2">
              {profile.ruleCandidates.map((candidate) => (
                <article
                  key={candidate.candidateId}
                  className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[color:var(--foreground)]">
                      {candidate.language.toUpperCase()}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
                      {candidate.status}
                    </span>
                  </div>
                  <p className="mt-2 text-[color:var(--muted)]">{candidate.fromText}</p>
                  <p className="mt-1 text-[color:var(--foreground)]">{candidate.toText}</p>
                  <div className="mt-3 flex gap-2">
                    <CandidateButton
                      label={t("reviewSpeakerConfirmCandidate")}
                      onClick={() =>
                        void saveCandidateStatus({
                          actions,
                          candidateId: candidate.candidateId,
                          nextStatus: "confirmed",
                          profile
                        })
                      }
                    />
                    <CandidateButton
                      label={t("reviewSpeakerRejectCandidate")}
                      onClick={() =>
                        void saveCandidateStatus({
                          actions,
                          candidateId: candidate.candidateId,
                          nextStatus: "rejected",
                          profile
                        })
                      }
                    />
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
        <button
          className="inline-flex h-8 items-center justify-center rounded-lg bg-[color:var(--surface)] px-3.5 text-xs font-medium text-[color:var(--foreground)] ring-1 ring-[color:var(--border)] shadow-[var(--shadow-raised-sm)]"
          type="button"
          onClick={() =>
            void actions.updateSpeakerProfile({
              ...profile,
              displayName: displayName.trim() || profile.displayName,
              notes,
              updatedAt: new Date().toISOString()
            })
          }
        >
          {t("reviewSpeakerSave")}
        </button>
      </div>
    </aside>
  );
}

function CandidateButton({
  label,
  onClick
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex h-7 items-center justify-center rounded-lg bg-[color:var(--panel)] px-2.5 text-[11px] font-medium text-[color:var(--foreground)] ring-1 ring-[color:var(--border)]"
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

async function saveCandidateStatus({
  actions,
  candidateId,
  nextStatus,
  profile
}: {
  actions: { updateSpeakerProfile: (profile: SpeakerProfile) => Promise<void> };
  candidateId: string;
  nextStatus: "confirmed" | "rejected";
  profile: SpeakerProfile;
}) {
  const updatedAt = new Date().toISOString();
  const nextProfile = profile.ruleCandidates.reduce(
    (draft, candidate) => {
      if (candidate.candidateId !== candidateId) {
        draft.ruleCandidates.push(candidate);
        return draft;
      }

      const nextCandidate = {
        ...candidate,
        status: nextStatus,
        updatedAt
      };
      draft.ruleCandidates.push(nextCandidate);
      if (nextStatus === "confirmed") {
        if (candidate.language === "ja") {
          draft.correctionLexiconJa[nextCandidate.fromText] = nextCandidate.toText;
        } else if (candidate.language === "zh") {
          draft.correctionLexiconZh[nextCandidate.fromText] = nextCandidate.toText;
        }
      }
      return draft;
    },
    {
      correctionLexiconJa: { ...profile.correctionLexiconJa },
      correctionLexiconZh: { ...profile.correctionLexiconZh },
      ruleCandidates: [] as SpeakerProfile["ruleCandidates"]
    }
  );
  await actions.updateSpeakerProfile({
    ...profile,
    correctionLexiconJa: nextProfile.correctionLexiconJa,
    correctionLexiconZh: nextProfile.correctionLexiconZh,
    ruleCandidates: nextProfile.ruleCandidates,
    updatedAt
  });
}
