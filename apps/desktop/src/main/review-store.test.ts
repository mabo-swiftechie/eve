import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const writeJsonAtomic = vi.fn(async (path: string, payload: unknown) => {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
});

vi.mock("./audio-utils", () => ({
  writeJsonAtomic
}));

const { ReviewStore } = await import("./review-store");

const tempDirs: string[] = [];

describe("ReviewStore", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
    vi.clearAllMocks();
  });

  it("loads segment records from speech sidecars", async () => {
    const directory = await createReviewDirectory();
    const store = new ReviewStore();

    const segments = await store.listSegments(directory);

    expect(segments).toEqual([
      expect.objectContaining({
        improvedAutoTranscript: "长句短句都有，这设计吧。",
        manualCorrectedTranscript: null,
        rawTranscript: "长劲短劲都有，这设计吧。",
        sentenceCues: [
          {
            endMs: 3200,
            startMs: 0,
            text: "长劲短劲都有，这设计吧。"
          }
        ],
        speakerDisplayName: "王晋",
        status: "translation_ready",
        timings: expect.objectContaining({
          segmentDetectedAt: "2026-05-08T11:00:00.000Z",
          translationCompletedAt: "2026-05-08T11:00:01.900Z"
        })
      })
    ]);
  });

  it("persists manual corrections back into the source sidecar", async () => {
    const directory = await createReviewDirectory();
    const jsonPath = join(directory, "eve_20260508_110000.json");
    const store = new ReviewStore();

    const updated = await store.saveManualCorrection(
      directory,
      "segment-1",
      "长句短句都有，这设计吧。",
      [
        {
          cue: {
            endMs: 3200,
            startMs: 0,
            text: "长劲短劲都有，这设计吧。"
          },
          text: "长句短句都有，这设计吧。"
        }
      ]
    );

    const payload = JSON.parse(await readFile(jsonPath, "utf8")) as {
      speech_segments: Array<Record<string, unknown>>;
    };
    expect(updated.manualCorrectedTranscript).toBe("长句短句都有，这设计吧。");
    expect(updated.manualSentenceCorrections).toEqual([
      {
        cue: {
          endMs: 3200,
          startMs: 0,
          text: "长劲短劲都有，这设计吧。"
        },
        text: "长句短句都有，这设计吧。"
      }
    ]);
    expect(updated.status).toBe("manually_corrected");
    expect(payload.speech_segments[0]?.manual_corrected_transcript).toBe(
      "长句短句都有，这设计吧。"
    );
    expect(payload.speech_segments[0]?.manual_sentence_corrections).toEqual([
      {
        cue: {
          end_ms: 3200,
          start_ms: 0,
          text: "长劲短劲都有，这设计吧。"
        },
        text: "长句短句都有，这设计吧。"
      }
    ]);
    expect(payload.speech_segments[0]?.status).toBe("manually_corrected");
  });

  it("derives a candidate from manual corrections", async () => {
    const store = new ReviewStore();
    const [candidate] = await store.deriveCandidates({
      audioClipRef: "/tmp/segment.wav",
      detectedLanguage: "zh",
      endAt: "2026-05-08T11:00:05.000Z",
      improvedAutoTranscript: "长劲短劲都有，这设计吧。",
      jaTranslation: null,
      manualCorrectedTranscript: "长句短句都有，这设计吧。",
      rawTranscript: "长劲短劲都有，这设计吧。",
      recordingId: "recording-1",
      segmentId: "segment-1",
      speakerDisplayName: "王晋",
      speakerId: "speaker-wj",
      startAt: "2026-05-08T11:00:00.000Z",
      status: "manually_corrected"
    });

    expect(candidate).toEqual(
      expect.objectContaining({
        fromText: "长劲短劲都有，这设计吧。",
        speakerId: "speaker-wj",
        status: "pending",
        toText: "长句短句都有，这设计吧。"
      })
    );
  });

  it("derives sentence-level candidates from structured corrections", async () => {
    const store = new ReviewStore();
    const candidates = await store.deriveCandidates({
      audioClipRef: "/tmp/segment.wav",
      detectedLanguage: "zh",
      endAt: "2026-05-08T11:00:05.000Z",
      improvedAutoTranscript: "长劲短劲都有。这个设计吧。",
      jaTranslation: null,
      manualCorrectedTranscript: "长句短句都有。这个设计吧。",
      manualSentenceCorrections: [
        {
          cue: {
            endMs: 1200,
            startMs: 0,
            text: "长劲短劲都有。"
          },
          text: "长句短句都有。"
        },
        {
          cue: {
            endMs: 2400,
            startMs: 1201,
            text: "这个设计吧。"
          },
          text: "这个设计吧。"
        }
      ],
      rawTranscript: "长劲短劲都有。这个设计吧。",
      recordingId: "recording-1",
      segmentId: "segment-1",
      sentenceCues: [
        {
          endMs: 1200,
          startMs: 0,
          text: "长劲短劲都有。"
        },
        {
          endMs: 2400,
          startMs: 1201,
          text: "这个设计吧。"
        }
      ],
      speakerDisplayName: "王晋",
      speakerId: "speaker-wj",
      startAt: "2026-05-08T11:00:00.000Z",
      status: "manually_corrected"
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(
      expect.objectContaining({
        candidateId: "segment-1:manual:0",
        fromText: "长劲短劲都有。",
        sentenceCue: {
          endMs: 1200,
          startMs: 0,
          text: "长劲短劲都有。"
        },
        sentenceIndex: 0,
        toText: "长句短句都有。"
      })
    );
  });

  it("falls back to segment candidates without sentence corrections", async () => {
    const store = new ReviewStore();
    const candidates = await store.deriveCandidates({
      audioClipRef: "/tmp/segment.wav",
      detectedLanguage: "ja",
      endAt: "2026-05-08T11:00:05.000Z",
      improvedAutoTranscript: "これは設計ですね",
      jaTranslation: null,
      manualCorrectedTranscript: "これは設計ですね。",
      rawTranscript: "これは設計ですね",
      recordingId: "recording-1",
      segmentId: "segment-2",
      speakerDisplayName: "曲boss",
      speakerId: "speaker-q",
      startAt: "2026-05-08T11:00:00.000Z",
      status: "manually_corrected"
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(
      expect.objectContaining({
        candidateId: "segment-2:manual",
        fromText: "これは設計ですね",
        toText: "これは設計ですね。"
      })
    );
  });

  it("loads segment audio as a data url", async () => {
    const directory = await createReviewDirectory();
    const audioPath = join(directory, "eve_20260508_110000.wav");
    const store = new ReviewStore();

    await writeFile(audioPath, Buffer.from("RIFFtest-wave"), "utf8");

    const dataUrl = await store.loadSegmentAudioDataUrl(directory, "segment-1");

    expect(dataUrl).toMatch(/^data:audio\/wav;base64,/);
  });
});

async function createReviewDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "eve-review-"));
  tempDirs.push(directory);
  await writeFile(
    join(directory, "eve_20260508_110000.json"),
    `${JSON.stringify({
      speech_segments: [
        {
          audio_clip_ref: join(directory, "eve_20260508_110000.wav"),
          detected_language: "zh",
          end_at: "2026-05-08T11:00:05.000Z",
          improved_auto_transcript: "长句短句都有，这设计吧。",
          ja_translation: "長文も短文もあります、この設計ですね。",
          manual_corrected_transcript: null,
          raw_transcript: "长劲短劲都有，这设计吧。",
          recording_id: "recording-1",
          segment_id: "segment-1",
          sentence_cues: [
            {
              end_ms: 3200,
              start_ms: 0,
              text: "长劲短劲都有，这设计吧。"
            }
          ],
          speaker_display_name: "王晋",
          speaker_id: "speaker-wj",
          start_at: "2026-05-08T11:00:00.000Z",
          status: "translation_ready",
          timings: {
            liveStagePublishedAt: "2026-05-08T11:00:00.050Z",
            segmentDetectedAt: "2026-05-08T11:00:00.000Z",
            translationCompletedAt: "2026-05-08T11:00:01.900Z",
            translationFirstChunkAt: "2026-05-08T11:00:01.350Z",
            translationQueuedAt: "2026-05-08T11:00:00.080Z",
            translationStartedAt: "2026-05-08T11:00:00.400Z"
          }
        }
      ]
    }, null, 2)}\n`,
    "utf8"
  );
  return directory;
}
