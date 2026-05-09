import { describe, expect, it } from "vitest";
import { buildLiveStageSnapshot } from "./desktop-engine-live-stage";

describe("buildLiveStageSnapshot", () => {
  it("returns the latest segment as active and keeps recent items ordered newest first", () => {
    const snapshot = buildLiveStageSnapshot({
      speechSegments: [
        {
          audioClipRef: "/tmp/1.wav",
          confidence: null,
          detectedLanguage: "zh",
          endAt: "2026-05-09T10:00:02.000Z",
          improvedAutoTranscript: "第一句改善版。",
          jaTranslation: "一つ目の改善文です。",
          manualCorrectedTranscript: null,
          rawTranscript: "第一句原文。",
          recordingId: "recording-1",
          segmentId: "segment-1",
          speaker: "王晋",
          speakerDisplayName: "王晋",
          speakerId: "speaker-wj",
          startAt: "2026-05-09T10:00:00.000Z",
          status: "translation_ready",
          text: "第一句原文。"
        },
        {
          audioClipRef: "/tmp/1.wav",
          confidence: null,
          detectedLanguage: "ja",
          endAt: "2026-05-09T10:00:05.000Z",
          improvedAutoTranscript: "二つ目の改善文です。",
          jaTranslation: null,
          manualCorrectedTranscript: null,
          rawTranscript: "第二句原文。",
          recordingId: "recording-1",
          segmentId: "segment-2",
          speaker: "曲boss",
          speakerDisplayName: "曲boss",
          speakerId: "speaker-q",
          startAt: "2026-05-09T10:00:03.000Z",
          status: "auto_improved",
          text: "第二句原文。"
        }
      ]
    });

    expect(snapshot.activeSegment?.segmentId).toBe("segment-2");
    expect(snapshot.recentSegments.map((segment) => segment.segmentId)).toEqual([
      "segment-2",
      "segment-1"
    ]);
  });
});
