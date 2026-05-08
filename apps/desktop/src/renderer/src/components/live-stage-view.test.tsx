import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATUS,
  EMPTY_REVIEW_SNAPSHOT,
  type DesktopSnapshot,
  type SegmentRecord
} from "@eve/shared";
import { LiveStageView } from "./live-stage-view";

describe("LiveStageView", () => {
  it("renders named bilingual stage content for chinese segments", () => {
    const markup = renderToStaticMarkup(
      <LiveStageView
        snapshot={createSnapshot({
          activeSegment: createSegment()
        })}
      />
    );

    expect(markup).toContain("王晋");
    expect(markup).toContain("长句短句都有，这设计吧。");
    expect(markup).toContain("長文も短文もあります、この設計ですね。");
  });

  it("renders waiting state when no stable segment exists", () => {
    const markup = renderToStaticMarkup(
      <LiveStageView snapshot={createSnapshot({ activeSegment: null })} />
    );

    expect(markup).toContain("Waiting for stable speech");
  });
});

function createSnapshot({
  activeSegment
}: {
  activeSegment: SegmentRecord | null;
}): DesktopSnapshot {
  return {
    app: {
      name: "eve",
      repositoryUrl: "https://github.com/nexmoe/eve",
      version: "0.0.0"
    },
    devices: [],
    engineReady: true,
    history: [],
    liveStage: {
      activeSegment,
      recentSegments: activeSegment ? [activeSegment] : []
    },
    permission: {
      message: "",
      state: "authorized",
      supported: true
    },
    review: EMPTY_REVIEW_SNAPSHOT,
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

function createSegment(): SegmentRecord {
  return {
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
}
