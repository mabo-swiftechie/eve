import type { RuleCandidateResolution, SentenceCue, SpeakerProfile } from "@eve/shared";

export function cueKey(cue: SentenceCue): string {
  return `${cue.startMs}:${cue.endMs}:${cue.text}`;
}

export function getCueAtTime(
  cues: SentenceCue[],
  timeMs: number
): SentenceCue | null {
  return cues.find((cue) => timeMs >= cue.startMs && timeMs <= cue.endMs) ?? null;
}

export function resolveCandidateUpdate({
  candidateId,
  decision,
  profile,
  updatedAt
}: {
  candidateId: string;
  decision: "apply" | "record" | "reject";
  profile: SpeakerProfile;
  updatedAt: string;
}): SpeakerProfile {
  const confirmationMode: RuleCandidateResolution | undefined =
    decision === "apply" ? "applied" : decision === "record" ? "recorded" : undefined;

  const nextProfile = profile.ruleCandidates.reduce(
    (draft, candidate) => {
      if (candidate.candidateId !== candidateId) {
        draft.ruleCandidates.push(candidate);
        return draft;
      }

      const nextCandidate = {
        ...candidate,
        confirmationMode,
        status: decision === "reject" ? "rejected" : "confirmed",
        updatedAt
      } as const;
      draft.ruleCandidates.push(nextCandidate);

      if (decision === "apply") {
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

  return {
    ...profile,
    correctionLexiconJa: nextProfile.correctionLexiconJa,
    correctionLexiconZh: nextProfile.correctionLexiconZh,
    ruleCandidates: nextProfile.ruleCandidates,
    updatedAt
  };
}
