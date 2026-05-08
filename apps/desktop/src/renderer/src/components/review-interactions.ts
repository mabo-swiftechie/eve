import type {
  RuleCandidateResolution,
  SentenceCorrection,
  SentenceCue,
  SpeakerProfile
} from "@eve/shared";

export interface SentenceDraft extends SentenceCorrection {
  cue: SentenceCue | null;
  id: string;
  text: string;
}

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

export function buildSentenceDrafts({
  cues,
  language,
  manualCorrections,
  seedText
}: {
  cues: SentenceCue[];
  language: string;
  manualCorrections?: SentenceCorrection[];
  seedText: string;
}): SentenceDraft[] {
  const normalizedSeed = seedText.trim();
  if (cues.length === 0) {
    if (manualCorrections && manualCorrections.length > 0) {
      return manualCorrections.map((correction, index) => ({
        ...correction,
        id: `draft:${correction.cue ? cueKey(correction.cue) : index}`
      }));
    }
    return normalizedSeed ? [{ cue: null, id: "draft:0", text: normalizedSeed }] : [];
  }

  if (manualCorrections && manualCorrections.length === cues.length) {
    return manualCorrections.map((correction, index) => ({
      cue: correction.cue ?? cues[index] ?? null,
      id: `draft:${correction.cue ? cueKey(correction.cue) : index}`,
      text: correction.text
    }));
  }

  const splitSentences = splitTextIntoSentences(normalizedSeed, language);
  return cues.map((cue, index) => ({
    cue,
    id: `draft:${cueKey(cue)}`,
    text: splitSentences[index] ?? cue.text
  }));
}

export function composeSentenceDrafts({
  drafts,
  language
}: {
  drafts: SentenceDraft[];
  language: string;
}): string {
  const parts = drafts
    .map((draft) => draft.text.trim())
    .filter((text) => text.length > 0);
  if (language === "zh" || language === "ja") {
    return parts.join("");
  }
  return parts.join(" ");
}

function splitTextIntoSentences(input: string, language: string): string[] {
  if (!input) {
    return [];
  }
  const sentences =
    language === "zh" || language === "ja"
      ? input
          .split(/(?<=[。！？!?；;])/u)
          .map((part) => part.trim())
          .filter(Boolean)
      : input
          .split(/(?<=[.!?;])/)
          .map((part) => part.trim())
          .filter(Boolean);
  return sentences;
}
