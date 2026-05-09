import { describe, expect, it, vi } from "vitest";
import type { SegmentRecord } from "@eve/shared";
import {
  backfillChineseTranslation,
  splitTranslationChunks
} from "./live-stage-translation";

describe("splitTranslationChunks", () => {
  it("keeps short text as a single translation request", () => {
    expect(splitTranslationChunks("这是中文。")).toEqual(["这是中文。"]);
  });

  it("splits longer text around punctuation boundaries", () => {
    expect(
      splitTranslationChunks(
        "第一句比较长，但是还在一个合理范围内。第二句也不短，而且应该被拆成新的翻译块。第三句继续补充说明。"
      )
    ).toEqual([
      "第一句比较长，但是还在一个合理范围内。第二句也不短，而且应该被拆成新的翻译块。",
      "第三句继续补充说明。"
    ]);
  });
});

describe("backfillChineseTranslation", () => {
  it("updates the live stage translation progressively for long chinese segments", async () => {
    const translatedStates: Array<string | null> = [];
    const segment = createSegment(
      "第一句比较长，但是还在一个合理范围内。第二句也不短，而且应该被拆成新的翻译块。第三句继续补充说明。"
    );
    const translator = {
      translateChineseToJapanese: vi
        .fn()
        .mockResolvedValueOnce("最初の訳です。")
        .mockResolvedValueOnce("続きの訳です。")
    };

    backfillChineseTranslation({
      detectedLanguage: "zh",
      onError: vi.fn(),
      onTranslated: () => {
        translatedStates.push(segment.jaTranslation);
      },
      segment,
      segmentTranslator: translator
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(translator.translateChineseToJapanese).toHaveBeenCalledTimes(2);
    expect(translatedStates).toEqual(["最初の訳です。", "最初の訳です。続きの訳です。"]);
    expect(segment.status).toBe("translation_ready");
  });
});

function createSegment(improvedAutoTranscript: string): SegmentRecord {
  return {
    audioClipRef: "/tmp/segment.wav",
    detectedLanguage: "zh",
    endAt: "2026-05-10T12:00:05.000Z",
    improvedAutoTranscript,
    jaTranslation: null,
    manualCorrectedTranscript: null,
    rawTranscript: improvedAutoTranscript,
    recordingId: "recording-1",
    segmentId: "segment-1",
    speakerDisplayName: "Speaker A",
    speakerId: null,
    startAt: "2026-05-10T12:00:00.000Z",
    status: "auto_improved"
  };
}
