import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const transcribeAudioFile = vi.fn(async () => ({
  lang: "zh",
  text: "长劲短劲都有，Qwen3 也有。"
}));
const writeJsonAtomic = vi.fn(async () => {});

vi.mock("./audio-utils", () => ({
  transcribeAudioFile,
  writeJsonAtomic
}));

const tempDirs: string[] = [];

describe("transcribeAudioDirectory", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
    vi.clearAllMocks();
  });

  it("writes enriched speech segments for post-hoc transcription", async () => {
    const inputDirectory = await createInputDirectory("sample.wav");
    const { transcribeAudioDirectory } = await import("./desktop-engine-transcribe");

    const processed = await transcribeAudioDirectory({
      improveTranscript: (text) => `improved:${text}`,
      inputDirectory,
      limit: 0,
      recognizer: {} as never,
      requireFfmpeg: async () => {},
      segmentTranslator: {
        translateChineseToJapanese: async (text) => `ja:${text}`
      }
    });

    const lastWrite = (writeJsonAtomic as unknown as {
      mock: { calls: unknown[][] };
    }).mock.calls.at(-1);
    const payload = lastWrite?.[1] as {
      speech_segments?: Array<Record<string, unknown>>;
      text?: string;
    };
    expect(processed).toBe(1);
    expect(payload.text).toBe("长劲短劲都有，Qwen3 也有。");
    expect(payload.speech_segments).toEqual([
      expect.objectContaining({
        audio_clip_ref: expect.stringContaining("sample.wav"),
        improved_auto_transcript: "improved:长劲短劲都有，Qwen3 也有。",
        ja_translation: "ja:improved:长劲短劲都有，Qwen3 也有。",
        raw_transcript: "长劲短劲都有，Qwen3 也有。",
        speaker_display_name: "Speaker A",
        speaker_id: null
      })
    ]);
  });
});

async function createInputDirectory(fileName: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "eve-transcribe-"));
  tempDirs.push(directory);
  await writeFile(join(directory, fileName), "stub");
  return directory;
}
