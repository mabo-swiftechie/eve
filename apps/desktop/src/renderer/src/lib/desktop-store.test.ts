import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATUS,
  type DesktopSnapshot,
  type SegmentRecord
} from "@eve/shared";
import { statusTone } from "./status-tone";

describe("statusTone", () => {
  it("maps recording status to tone", () => {
    expect(
      statusTone({
        ...DEFAULT_STATUS,
        elapsed: "00:00:01",
        recording: true,
        statusMessage: ""
      })
    ).toBe("recording");
  });

  it("supports live stage and review snapshot segments", () => {
    const segment: SegmentRecord = {
      audioClipRef: "/tmp/20260507_120000.wav",
      detectedLanguage: "zh",
      endAt: "2026-05-07T12:00:08.000Z",
      improvedAutoTranscript: "长句短句都有，这设计吧。",
      jaTranslation: "長文も短文もあります、この設計ですね。",
      manualCorrectedTranscript: null,
      rawTranscript: "长劲短劲都有，这设计吧。",
      recordingId: "rec-1",
      segmentId: "seg-1",
      speakerDisplayName: "王晋",
      speakerId: "speaker-wj",
      startAt: "2026-05-07T12:00:00.000Z",
      status: "translation_ready"
    };
    const snapshot: DesktopSnapshot = {
      app: {
        name: "eve",
        repositoryUrl: "https://github.com/nexmoe/eve",
        version: "0.0.0"
      },
      devices: [],
      engineReady: true,
      history: [],
      liveStage: {
        activeSegment: segment,
        recentSegments: [segment]
      },
      permission: {
        message: "Ready",
        state: "authorized",
        supported: true
      },
      review: {
        selectedRecordingId: "rec-1",
        segments: [segment],
        speakers: []
      },
      settings: DEFAULT_SETTINGS,
      status: DEFAULT_STATUS,
      updater: {
        currentVersion: "0.0.0",
        downloadedVersion: null,
        downloadedVersionReady: false,
        errorMessage: null,
        installDeferredUntilIdle: false,
        latestVersion: null,
        phase: "idle",
        statusMessage: "Idle"
      },
      windowPinned: false
    };

    expect(snapshot.liveStage.activeSegment?.status).toBe("translation_ready");
    expect(snapshot.review.segments[0]?.rawTranscript).toBe("长劲短劲都有，这设计吧。");
  });
});
