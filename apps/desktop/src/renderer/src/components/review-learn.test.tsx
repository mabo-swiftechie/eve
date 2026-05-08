import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATUS,
  type DesktopSnapshot,
  type SegmentRecord,
  type SpeakerProfile
} from "@eve/shared";

import { ReviewLearn } from "./review-learn";

describe("ReviewLearn", () => {
  it("renders layered transcript editing content", () => {
    const markup = renderToStaticMarkup(
      <ReviewLearn
        actions={{
          saveManualCorrection: vi.fn(async () => undefined),
          updateSpeakerProfile: vi.fn(async () => undefined)
        }}
        snapshot={createSnapshot()}
      />
    );

    expect(markup).toContain("长劲短劲都有，这设计吧。");
    expect(markup).toContain("长句短句都有，这设计吧。");
    expect(markup).toContain("Save manual correction");
    expect(markup).toContain("王晋");
  });
});

function createSnapshot(): DesktopSnapshot {
  const segment: SegmentRecord = {
    audioClipRef: "/tmp/segment.wav",
    detectedLanguage: "zh",
    endAt: "2026-05-08T11:00:05.000Z",
    improvedAutoTranscript: "长句短句都有，这设计吧。",
    jaTranslation: "長文も短文もあります、この設計ですね。",
    manualCorrectedTranscript: null,
    rawTranscript: "长劲短劲都有，这设计吧。",
    recordingId: "recording-1",
    segmentId: "segment-1",
    speakerDisplayName: "王晋",
    speakerId: "speaker-wj",
    startAt: "2026-05-08T11:00:00.000Z",
    status: "translation_ready"
  };
  const speaker: SpeakerProfile = {
    aliases: [],
    correctionLexiconJa: {},
    correctionLexiconZh: { "长劲短劲": "长句短句" },
    displayName: "王晋",
    languagesSeen: ["zh", "ja"],
    notes: "平翘舌容易混。",
    ruleCandidates: [],
    sharedTerms: {},
    speakerId: "speaker-wj",
    styleRulesJa: [],
    styleRulesZh: [],
    updatedAt: "2026-05-08T11:10:00.000Z"
  };
  return {
    app: {
      name: "eve",
      repositoryUrl: "https://github.com/nexmoe/eve",
      version: "0.0.0"
    },
    devices: [],
    engineReady: true,
    history: [],
    liveStage: { activeSegment: null, recentSegments: [] },
    permission: {
      message: "",
      state: "authorized",
      supported: true
    },
    review: {
      selectedRecordingId: "/tmp/20260508",
      segments: [segment],
      speakers: [speaker]
    },
    settings: {
      ...DEFAULT_SETTINGS,
      desktop: {
        ...DEFAULT_SETTINGS.desktop,
        language: "en-US"
      }
    },
    status: DEFAULT_STATUS,
    updater: {
      currentVersion: "0.0.0",
      downloadedVersion: null,
      downloadedVersionReady: false,
      errorMessage: null,
      installDeferredUntilIdle: false,
      latestVersion: null,
      phase: "idle",
      statusMessage: ""
    },
    windowPinned: false
  };
}
