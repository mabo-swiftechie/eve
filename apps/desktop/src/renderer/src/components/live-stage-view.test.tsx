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

  it("renders live stage diagnostics for language routing", () => {
    const markup = renderToStaticMarkup(
      <LiveStageView
        snapshot={createSnapshot({
          activeSegment: createSegment({
            detectedLanguage: "zh",
            rawDetectedLanguage: "cmn"
          })
        })}
      />
    );

    expect(markup).toContain("Diagnostics");
    expect(markup).toContain("Raw lang");
    expect(markup).toContain("cmn");
    expect(markup).toContain("Normalized");
    expect(markup).toContain("zh");
    expect(markup).toContain("Route");
    expect(markup).toContain("zh→ja");
    expect(markup).toContain("Raw publish");
    expect(markup).toContain("50ms");
    expect(markup).toContain("First JA");
    expect(markup).toContain("1.35s");
  });

  it("renders bilingual recent stage cards for chinese segments", () => {
    const markup = renderToStaticMarkup(
      <LiveStageView
        snapshot={createSnapshot({
          activeSegment: createSegment(),
          recentSegments: [
            createSegment(),
            createSegment({
              segmentId: "segment-2",
              improvedAutoTranscript: "我们继续看这一段。",
              jaTranslation: "この部分を続けて見ていきます。"
            })
          ]
        })}
      />
    );

    expect(markup).toContain("Recent stage segments");
    expect(markup).toContain("Chinese improved");
    expect(markup).toContain("Japanese display");
    expect(markup).toContain("我们继续看这一段。");
    expect(markup).toContain("この部分を続けて見ていきます。");
  });

  it("shows chinese fallback text in the japanese panel while translation is pending", () => {
    const markup = renderToStaticMarkup(
      <LiveStageView
        snapshot={createSnapshot({
          activeSegment: createSegment({
            jaTranslation: null,
            status: "auto_improved"
          })
        })}
      />
    );

    expect(markup).toContain("Translation");
    expect(markup).toContain("pending");
    expect(markup).toContain("长句短句都有，这设计吧。");
  });

  it("shows a mixed japanese and chinese panel while chunked translation is streaming", () => {
    const markup = renderToStaticMarkup(
      <LiveStageView
        snapshot={createSnapshot({
          activeSegment: createSegment({
            jaTranslation: "長文も短文もあります。这设计吧。",
            status: "auto_improved"
          })
        })}
      />
    );

    expect(markup).toContain("streaming");
    expect(markup).toContain("長文も短文もあります。这设计吧。");
  });

  it("shows translation failure details in diagnostics", () => {
    const markup = renderToStaticMarkup(
      <LiveStageView
        snapshot={createSnapshot({
          activeSegment: createSegment({
            jaTranslation: null,
            status: "auto_improved",
            translationError: "network_error"
          })
        })}
      />
    );

    expect(markup).toContain("failed");
    expect(markup).toContain("Diagnostics · failed · network_error");
    expect(markup).toContain("Translation error");
    expect(markup).toContain("network_error");
  });

  it("renders waiting state when no stable segment exists", () => {
    const markup = renderToStaticMarkup(
      <LiveStageView snapshot={createSnapshot({ activeSegment: null })} />
    );

    expect(markup).toContain("Waiting for stable speech");
  });
});

function createSnapshot({
  activeSegment,
  recentSegments
}: {
  activeSegment: SegmentRecord | null;
  recentSegments?: SegmentRecord[];
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
      recentSegments: recentSegments ?? (activeSegment ? [activeSegment] : [])
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

function createSegment(
  overrides: Partial<SegmentRecord> = {}
): SegmentRecord {
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
    status: "translation_ready",
    timings: {
      liveStagePublishedAt: "2026-05-08T11:00:00.050Z",
      segmentDetectedAt: "2026-05-08T11:00:00.000Z",
      translationCompletedAt: "2026-05-08T11:00:01.900Z",
      translationFirstChunkAt: "2026-05-08T11:00:01.350Z",
      translationQueuedAt: "2026-05-08T11:00:00.080Z",
      translationStartedAt: "2026-05-08T11:00:00.400Z"
    },
    ...overrides
  };
}
