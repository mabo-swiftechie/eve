import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SegmentRecord } from "@eve/shared";
import {
  backfillChineseTranslation,
  resetLiveStageTranslationPriority,
  splitTranslationChunks
} from "./live-stage-translation";

beforeEach(() => {
  resetLiveStageTranslationPriority();
});

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

  it("finishes the current request and then runs only the newest queued segment", async () => {
    let resolveFirstOldChunk: ((value: string) => void) | null = null;
    let resolveSecondOldChunk: ((value: string) => void) | null = null;
    let resolveNewestChunk: ((value: string) => void) | null = null;
    const oldSegment = createSegment(
      "第一句比较长，但是还在一个合理范围内。第二句也不短，而且应该被拆成新的翻译块。第三句继续补充说明。"
    );
    const staleMiddleSegment = createSegment("中间那句其实已经过时了。");
    const newestSegment = createSegment("新的句子来了。");
    const translator = {
      translateChineseToJapanese: vi.fn((text: string) => {
        if (text === "新的句子来了。") {
          return new Promise<string>((resolve) => {
            resolveNewestChunk = resolve;
          });
        }
        if (text === "中间那句其实已经过时了。") {
          return Promise.resolve("这条不该被执行。");
        }
        if (!resolveFirstOldChunk) {
          return new Promise<string>((resolve) => {
            resolveFirstOldChunk = resolve;
          });
        }
        return new Promise<string>((resolve) => {
          resolveSecondOldChunk = resolve;
        });
      })
    };

    backfillChineseTranslation({
      detectedLanguage: "zh",
      onError: vi.fn(),
      onTranslated: vi.fn(),
      segment: oldSegment,
      segmentTranslator: translator
    });
    expect(resolveFirstOldChunk).toBeTypeOf("function");
    resolveFirstOldChunk!("旧段第一块。");
    await Promise.resolve();
    backfillChineseTranslation({
      detectedLanguage: "zh",
      onError: vi.fn(),
      onTranslated: vi.fn(),
      segment: staleMiddleSegment,
      segmentTranslator: translator
    });
    backfillChineseTranslation({
      detectedLanguage: "zh",
      onError: vi.fn(),
      onTranslated: vi.fn(),
      segment: newestSegment,
      segmentTranslator: translator
    });
    expect(resolveSecondOldChunk).toBeTypeOf("function");
    resolveSecondOldChunk!("旧段第二块。");
    await Promise.resolve();
    await Promise.resolve();
    expect(resolveNewestChunk).toBeTypeOf("function");
    resolveNewestChunk!("新段翻译。");
    await Promise.resolve();
    await Promise.resolve();

    expect(oldSegment.jaTranslation).toBe("旧段第一块。旧段第二块。");
    expect(staleMiddleSegment.jaTranslation).toBeNull();
    expect(newestSegment.jaTranslation).toBe("新段翻译。");
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
