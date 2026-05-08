import { describe, expect, it } from "vitest";
import type { SentenceCue, SpeakerProfile } from "@eve/shared";
import {
  buildSentenceDrafts,
  composeSentenceDrafts,
  cueKey,
  findSentenceDraftIdForCandidate,
  getCueAtTime,
  resolveCandidateFocusState,
  resolveCandidateUpdate
} from "./review-interactions";

describe("review interactions", () => {
  it("applies a confirmed candidate into the speaker lexicon", () => {
    const profile = createProfile();

    const updated = resolveCandidateUpdate({
      candidateId: "candidate-1",
      decision: "apply",
      profile,
      updatedAt: "2026-05-08T12:10:00.000Z"
    });

    expect(updated.correctionLexiconZh["长劲短劲"]).toBe("长句短句");
    expect(updated.ruleCandidates[0]).toMatchObject({
      confirmationMode: "applied",
      status: "confirmed"
    });
  });

  it("records a candidate without applying it into the lexicon", () => {
    const profile = createProfile({
      correctionLexiconZh: {}
    });

    const updated = resolveCandidateUpdate({
      candidateId: "candidate-1",
      decision: "record",
      profile,
      updatedAt: "2026-05-08T12:10:00.000Z"
    });

    expect(updated.correctionLexiconZh["长劲短劲"]).toBeUndefined();
    expect(updated.ruleCandidates[0]).toMatchObject({
      confirmationMode: "recorded",
      status: "confirmed"
    });
  });

  it("finds the active cue for a playback time", () => {
    const cues: SentenceCue[] = [
      { endMs: 1800, startMs: 0, text: "第一句。" },
      { endMs: 4200, startMs: 1801, text: "第二句。" }
    ];

    expect(getCueAtTime(cues, 2500)).toEqual(cues[1]);
    expect(cueKey(cues[1]!)).toBe("1801:4200:第二句。");
  });

  it("builds sentence drafts from cue count when improved text is already sentence-split", () => {
    const drafts = buildSentenceDrafts({
      cues: [
        { endMs: 1800, startMs: 0, text: "第一句。" },
        { endMs: 4200, startMs: 1801, text: "第二句。" }
      ],
      language: "zh",
      seedText: "改善后的第一句。改善后的第二句。"
    });

    expect(drafts.map((draft) => draft.text)).toEqual(["改善后的第一句。", "改善后的第二句。"]);
  });

  it("prefers stored manual sentence corrections when present", () => {
    const drafts = buildSentenceDrafts({
      cues: [
        { endMs: 1800, startMs: 0, text: "第一句。" },
        { endMs: 4200, startMs: 1801, text: "第二句。" }
      ],
      language: "zh",
      manualCorrections: [
        { cue: null, text: "人工第一句。" },
        { cue: null, text: "人工第二句。" }
      ],
      seedText: "不会被使用。"
    });

    expect(drafts.map((draft) => draft.text)).toEqual(["人工第一句。", "人工第二句。"]);
  });

  it("finds the matching sentence draft for a candidate cue", () => {
    const drafts = buildSentenceDrafts({
      cues: [
        { endMs: 1200, startMs: 0, text: "长劲短劲都有。" },
        { endMs: 2400, startMs: 1201, text: "这个设计吧。" }
      ],
      language: "zh",
      seedText: "长句短句都有。这个设计吧。"
    });

    const draftId = findSentenceDraftIdForCandidate({
      candidate: {
        candidateId: "candidate-1",
        createdAt: "2026-05-08T11:05:00.000Z",
        fromText: "长劲短劲都有。",
        language: "zh",
        segmentId: "segment-1",
        sentenceCue: {
          endMs: 1200,
          startMs: 0,
          text: "长劲短劲都有。"
        },
        sentenceIndex: 0,
        speakerId: "speaker-wj",
        status: "pending",
        toText: "长句短句都有。",
        updatedAt: "2026-05-08T11:05:00.000Z"
      },
      drafts
    });

    expect(draftId).toBe(drafts[0]?.id);
  });

  it("resolves locate state into cue highlight and playback targets", () => {
    const drafts = buildSentenceDrafts({
      cues: [
        { endMs: 1200, startMs: 0, text: "长劲短劲都有。" },
        { endMs: 2400, startMs: 1201, text: "这个设计吧。" }
      ],
      language: "zh",
      seedText: "长句短句都有。这个设计吧。"
    });

    const state = resolveCandidateFocusState({
      drafts,
      focus: {
        cue: {
          endMs: 1200,
          startMs: 0,
          text: "长劲短劲都有。"
        },
        segmentId: "segment-1",
        sentenceIndex: 0
      }
    });

    expect(state).toEqual({
      activeCueKey: "0:1200:长劲短劲都有。",
      cueToPlay: {
        endMs: 1200,
        startMs: 0,
        text: "长劲短劲都有。"
      },
      draftId: drafts[0]?.id ?? null
    });
  });

  it("composes sentence drafts back into one zh transcript", () => {
    const transcript = composeSentenceDrafts({
      drafts: [
        { cue: null, id: "1", text: "第一句。" },
        { cue: null, id: "2", text: "第二句。" }
      ],
      language: "zh"
    });

    expect(transcript).toBe("第一句。第二句。");
  });
});

function createProfile(overrides: Partial<SpeakerProfile> = {}): SpeakerProfile {
  return {
    aliases: [],
    correctionLexiconJa: {},
    correctionLexiconZh: {},
    displayName: "王晋",
    languagesSeen: ["zh"],
    notes: "",
    ruleCandidates: [
      {
        candidateId: "candidate-1",
        createdAt: "2026-05-08T12:00:00.000Z",
        fromText: "长劲短劲",
        language: "zh",
        segmentId: "segment-1",
        speakerId: "speaker-wj",
        status: "pending",
        toText: "长句短句",
        updatedAt: "2026-05-08T12:00:00.000Z"
      }
    ],
    sharedTerms: {},
    speakerId: "speaker-wj",
    styleRulesJa: [],
    styleRulesZh: [],
    updatedAt: "2026-05-08T12:00:00.000Z",
    ...overrides
  };
}
