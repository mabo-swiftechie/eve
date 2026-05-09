import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_STATUS, type AppSettings } from "@eve/shared";

type MockRecognitionResult = {
  lang: string;
  text: string;
  timestamps: number[];
  tokens: string[];
};

const modelManagerState = {
  requireFfmpeg: vi.fn(async () => {}),
  ensureRuntimeAssets: vi.fn(async () => {}),
  onStatus: vi.fn<(listener: (status: Partial<typeof DEFAULT_STATUS>) => void) => void>(),
  getSenseVoiceDirectory: vi.fn(() => "/models/sense-voice"),
  getSpeakerEmbeddingModelPath: vi.fn(() => "/models/speaker.onnx"),
  getStatus: vi.fn(() => ({
    downloading: false,
    ffmpegAvailable: true,
    senseVoiceReady: true,
    speakerEmbeddingReady: false,
    vadReady: true
  })),
  getVadModelPath: vi.fn(() => "/models/vad.onnx")
};

const writerClose = vi.fn<() => Promise<void>>(async () => {});
const writerAppend = vi.fn<(samples: Float32Array) => Promise<void>>(async () => {});
const transcodeWavToFlac = vi.fn<
  (inputPath: string, outputPath: string) => Promise<void>
>(async () => {});
const writeJsonAtomic = vi.fn<(path: string, payload: unknown) => Promise<void>>(
  async () => {}
);
const vadSegments: Array<{ samples: Float32Array; start: number }> = [];
const decodeSegmentMock = vi.fn(
  (): MockRecognitionResult => ({ lang: "zh", text: "", timestamps: [], tokens: [] })
);
const speakerIdentifierState = {
  identify: vi.fn(() => ({ confidence: 0.98, name: "王晋" })),
  initialize: vi.fn(() => true),
  isInitialized: true,
  loadSpeakerRegistry: vi.fn(async () => {})
};

vi.mock("electron-log/main", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp")
  }
}));

vi.mock("./audio-utils", () => ({
  WavWriter: class {
    constructor(private readonly path: string) {}
    append = writerAppend;
    close = writerClose;
    getPath() {
      return this.path;
    }
  },
  buildWaveformBins: vi.fn(() => DEFAULT_STATUS.waveformBins),
  createSenseVoiceRecognizer: vi.fn(() => ({
    decode: vi.fn(),
    createStream: vi.fn(),
    getResult: vi.fn()
  })),
  createSherpaVad: vi.fn(() => ({
    acceptWaveform: vi.fn(),
    config: { sileroVad: { windowSize: 512 } },
    flush: vi.fn(),
    front: vi.fn(() => vadSegments[0]!),
    isDetected: vi.fn(() => false),
    isEmpty: vi.fn(() => vadSegments.length === 0),
    pop: vi.fn(() => {
      vadSegments.shift();
    })
  })),
  decodeSegment: decodeSegmentMock,
  downsampleTo16k: vi.fn((samples: Float32Array) => samples),
  ensureWavInput: vi.fn(async (inputPath: string) => inputPath),
  rms: vi.fn(() => 0),
  rmsToDb: vi.fn(() => -80),
  transcodeWavToFlac,
  transcribeAudioFile: vi.fn(async () => ({ lang: "zh", text: "hello", timestamps: [], tokens: [] })),
  writeJsonAtomic
}));

vi.mock("./model-manager", () => ({
  ModelManager: class {
    ensureRuntimeAssets = modelManagerState.ensureRuntimeAssets;
    getSenseVoiceDirectory = modelManagerState.getSenseVoiceDirectory;
    getSpeakerEmbeddingModelPath = modelManagerState.getSpeakerEmbeddingModelPath;
    getStatus = modelManagerState.getStatus;
    getVadModelPath = modelManagerState.getVadModelPath;
    onStatus = modelManagerState.onStatus;
    requireFfmpeg = modelManagerState.requireFfmpeg;
  }
}));

vi.mock("./speaker-identifier", () => ({
  SpeakerIdentifier: class {
    identify = speakerIdentifierState.identify;
    initialize = speakerIdentifierState.initialize;
    isInitialized = speakerIdentifierState.isInitialized;
    loadSpeakerRegistry = speakerIdentifierState.loadSpeakerRegistry;
  },
  getDefaultSpeakerRegistryPath: vi.fn(() => "/tmp/speakers")
}));

describe("DesktopEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelManagerState.onStatus.mockImplementation(() => {});
    modelManagerState.getStatus.mockReturnValue({
      downloading: false,
      ffmpegAvailable: true,
      senseVoiceReady: true,
      speakerEmbeddingReady: false,
      vadReady: true
    });
    vadSegments.length = 0;
    decodeSegmentMock.mockReturnValue({ lang: "zh", text: "", timestamps: [], tokens: [] });
    speakerIdentifierState.identify.mockReturnValue({
      confidence: 0.98,
      name: "王晋"
    });
    speakerIdentifierState.initialize.mockReturnValue(true);
  });

  it("skips sidecar JSON creation when realtime transcription is disabled", async () => {
    const { DesktopEngine } = await import("./desktop-engine");
    const engine = new DesktopEngine(() => {});

    await engine.applySettings({
      ...DEFAULT_SETTINGS,
      recording: { ...DEFAULT_SETTINGS.recording, disableAsr: true }
    });

    await engine.startRecording();
    await engine.stopRecording();

    expect(writeJsonAtomic).not.toHaveBeenCalled();
    expect(transcodeWavToFlac).toHaveBeenCalledTimes(1);
  });

  it("starts recording without downloading models when realtime transcription is disabled", async () => {
    const { DesktopEngine } = await import("./desktop-engine");
    const engine = new DesktopEngine(() => {});

    await engine.applySettings({
      ...DEFAULT_SETTINGS,
      recording: { ...DEFAULT_SETTINGS.recording, audioFormat: "wav", disableAsr: true }
    });

    await engine.startRecording();

    expect(modelManagerState.ensureRuntimeAssets).not.toHaveBeenCalled();
    expect(modelManagerState.requireFfmpeg).not.toHaveBeenCalled();
    expect(engine.getStatus()).toMatchObject({
      asrEnabled: false,
      recording: true,
      statusMessage: "Recording audio only."
    });
  });

  it("rotates the active segment immediately when recording output settings change", async () => {
    const { DesktopEngine } = await import("./desktop-engine");
    const engine = new DesktopEngine(() => {});
    const initial = buildSettings({
      audioFormat: "wav",
      disableAsr: false,
      outputDir: "/tmp/recordings-a"
    });
    const next = buildSettings({
      audioFormat: "flac",
      disableAsr: true,
      outputDir: "/tmp/recordings-b"
    });

    await engine.applySettings(initial);
    await engine.startRecording();
    await engine.applySettings(next);
    await engine.stopRecording();

    expect(modelManagerState.requireFfmpeg).toHaveBeenCalledTimes(1);
    expect(transcodeWavToFlac).toHaveBeenCalledTimes(1);
    expect(writeJsonAtomic).toHaveBeenCalledTimes(1);
    const firstCall = writeJsonAtomic.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    expect(String(firstCall?.[0])).toContain("/tmp/recordings-a/");
  });

  it("creates a recognizer when ASR is enabled during an active recording", async () => {
    const { DesktopEngine } = await import("./desktop-engine");
    const engine = new DesktopEngine(() => {});

    await engine.applySettings(
      buildSettings({ audioFormat: "wav", disableAsr: true, outputDir: "/tmp/no-asr" })
    );
    await engine.startRecording();
    await engine.applySettings(
      buildSettings({ audioFormat: "wav", disableAsr: false, outputDir: "/tmp/with-asr" })
    );

    vadSegments.push({ samples: new Float32Array([0.1, -0.1]), start: 0 });
    decodeSegmentMock.mockReturnValue({
      lang: "zh",
      text: "启用之后开始转写。",
      timestamps: [0, 0.5],
      tokens: ["启用之后开始转写。"]
    });

    await engine.pushAudioChunk({
      deviceId: "default",
      deviceLabel: "Built-in Mic",
      rms: 0.2,
      sampleRate: 16_000,
      samples: new Float32Array(512)
    });
    await engine.stopRecording();

    expect(writeJsonAtomic).toHaveBeenCalledTimes(1);
    expect(engine.getStatus()).toMatchObject({
      asrEnabled: true,
      recording: false
    });
  });

  it("persists only VAD speech segments into the saved audio file", async () => {
    const { DesktopEngine } = await import("./desktop-engine");
    const engine = new DesktopEngine(() => {});
    const speechOnly = new Float32Array([0.2, -0.2, 0.4]);

    vadSegments.push({ samples: speechOnly, start: 0 });

    await engine.startRecording();
    await engine.pushAudioChunk({
      deviceId: "default",
      deviceLabel: "Built-in Mic",
      rms: 0.3,
      sampleRate: 16_000,
      samples: new Float32Array(512)
    });
    await engine.stopRecording();

    expect(writerAppend).toHaveBeenCalledTimes(1);
    expect(writerAppend).toHaveBeenCalledWith(speechOnly);
  });

  it("persists enriched speech segments with enhancement and zh-ja translation", async () => {
    const improveTranscript = vi.fn((text: string) => `improved:${text}`);
    const translateChineseToJapanese = vi.fn(async (text: string) => `ja:${text}`);
    const findProfileByName = vi.fn(async () => ({
      aliases: [],
      correctionLexiconJa: {},
      correctionLexiconZh: { "长劲短劲": "长句短句" },
      displayName: "王晋",
      languagesSeen: ["zh"],
      notes: "",
      ruleCandidates: [],
      sharedTerms: { Qwen3: "Qwen3" },
      speakerId: "speaker-wj",
      styleRulesJa: [],
      styleRulesZh: [],
      updatedAt: "2026-05-07T12:00:00.000Z"
    }));
    modelManagerState.getStatus.mockReturnValue({
      downloading: false,
      ffmpegAvailable: true,
      senseVoiceReady: true,
      speakerEmbeddingReady: true,
      vadReady: true
    });
    const { DesktopEngine } = await import("./desktop-engine");
    const engine = new DesktopEngine(() => {}, {
      improveTranscript,
      segmentTranslator: { translateChineseToJapanese },
      speakerProfileStore: {
        findProfileByName,
        getProfile: vi.fn(async () => null)
      }
    });

    vadSegments.push({ samples: new Float32Array([0.1, -0.1]), start: 0 });
    decodeSegmentMock.mockReturnValue({
      lang: "zh",
      text: "长劲短劲都有，Qwen3 也有。",
      timestamps: [0, 0.7, 1.4, 2.1],
      tokens: ["长劲短劲", "都有。", "Qwen3", "也有。"]
    });

    await engine.startRecording();
    await engine.pushAudioChunk({
      deviceId: "default",
      deviceLabel: "Built-in Mic",
      rms: 0.3,
      sampleRate: 16_000,
      samples: new Float32Array(512)
    });
    await engine.stopRecording();

    const payload = writeJsonAtomic.mock.calls.at(-1)?.[1] as {
      speech_segments?: Array<Record<string, unknown>>;
    };
    expect(improveTranscript).toHaveBeenCalledWith(
      "长劲短劲都有，Qwen3 也有。",
      "zh",
      null
    );
    expect(findProfileByName).toHaveBeenCalledWith("王晋");
    expect(translateChineseToJapanese).toHaveBeenCalledWith(
      "improved:长劲短劲都有，Qwen3 也有。"
    );
    expect(payload.speech_segments).toEqual([
      expect.objectContaining({
        audio_clip_ref: expect.stringContaining(".flac"),
        detected_language: "zh",
        end_at: expect.any(String),
        raw_transcript: "长劲短劲都有，Qwen3 也有。",
        recording_id: expect.stringMatching(/^eve_\d{8}_\d{6}$/),
        improved_auto_transcript: "improved:长劲短劲都有，Qwen3 也有。",
        ja_translation: "ja:improved:长劲短劲都有，Qwen3 也有。",
        speaker: "王晋",
        speaker_display_name: "王晋",
        speaker_id: "speaker-wj",
        sentence_cues: [
          { endMs: 1400, startMs: 0, text: "长劲短劲都有。" },
          { endMs: 2500, startMs: 1400, text: "Qwen3也有。" }
        ],
        start_at: expect.any(String),
        status: "translation_ready"
      })
    ]);
  });

  it("continues recording when zh-ja translation fails", async () => {
    const improveTranscript = vi.fn((text: string) => `improved:${text}`);
    const translateChineseToJapanese = vi.fn(async () => {
      throw new Error("translator failed");
    });
    const findProfileByName = vi.fn(async () => null);
    modelManagerState.getStatus.mockReturnValue({
      downloading: false,
      ffmpegAvailable: true,
      senseVoiceReady: true,
      speakerEmbeddingReady: false,
      vadReady: true
    });
    const { DesktopEngine } = await import("./desktop-engine");
    const engine = new DesktopEngine(() => {}, {
      improveTranscript,
      segmentTranslator: { translateChineseToJapanese },
      speakerProfileStore: {
        findProfileByName,
        getProfile: vi.fn(async () => null)
      }
    });

    vadSegments.push({ samples: new Float32Array([0.1, -0.1]), start: 0 });
    decodeSegmentMock.mockReturnValue({
      lang: "zh",
      text: "翻译失败也不能中断。",
      timestamps: [0],
      tokens: ["翻译失败也不能中断。"]
    });

    await engine.startRecording();
    await engine.pushAudioChunk({
      deviceId: "default",
      deviceLabel: "Built-in Mic",
      rms: 0.3,
      sampleRate: 16_000,
      samples: new Float32Array(512)
    });
    await engine.stopRecording();

    const payload = writeJsonAtomic.mock.calls.at(-1)?.[1] as {
      speech_segments?: Array<Record<string, unknown>>;
    };
    expect(translateChineseToJapanese).toHaveBeenCalledTimes(1);
    expect(payload.speech_segments?.[0]).toEqual(
      expect.objectContaining({
        improved_auto_transcript: "improved:翻译失败也不能中断。",
        ja_translation: null,
        raw_transcript: "翻译失败也不能中断。"
      })
    );
    expect(engine.getStatus().error).toBeNull();
  });

  it("publishes the live stage segment before zh-ja translation resolves", async () => {
    const improveTranscript = vi.fn((text: string) => `improved:${text}`);
    let translationResolver: (value: string) => void = () => {
      throw new Error("Expected translation resolver to be captured.");
    };
    const translateChineseToJapanese = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          translationResolver = resolve;
        })
    );
    const { DesktopEngine } = await import("./desktop-engine");
    const engine = new DesktopEngine(() => {}, {
      improveTranscript,
      segmentTranslator: { translateChineseToJapanese },
      speakerProfileStore: {
        findProfileByName: vi.fn(async () => null),
        getProfile: vi.fn(async () => null)
      }
    });

    vadSegments.push({ samples: new Float32Array([0.1, -0.1]), start: 0 });
    decodeSegmentMock.mockReturnValue({
      lang: "zh",
      text: "先显示原文。",
      timestamps: [0],
      tokens: ["先显示原文。"]
    });

    await engine.startRecording();
    await engine.pushAudioChunk({
      deviceId: "default",
      deviceLabel: "Built-in Mic",
      rms: 0.3,
      sampleRate: 16_000,
      samples: new Float32Array(512)
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(engine.getLiveStageSnapshot().activeSegment).toEqual(
      expect.objectContaining({
        improvedAutoTranscript: "improved:先显示原文。",
        jaTranslation: null,
        rawTranscript: "先显示原文。"
      })
    );

    translationResolver("ja:improved:先显示原文。");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(engine.getLiveStageSnapshot().activeSegment).toEqual(
      expect.objectContaining({
        jaTranslation: "ja:improved:先显示原文。",
        status: "translation_ready"
      })
    );

    await engine.stopRecording();
  });

  it("publishes the live stage segment before speaker profile lookup resolves", async () => {
    const improveTranscript = vi.fn((text: string) => `improved:${text}`);
    modelManagerState.getStatus.mockReturnValue({
      downloading: false,
      ffmpegAvailable: true,
      senseVoiceReady: true,
      speakerEmbeddingReady: true,
      vadReady: true
    });
    let resolveProfile: ((value: {
      aliases: string[];
      correctionLexiconJa: Record<string, string>;
      correctionLexiconZh: Record<string, string>;
      displayName: string;
      languagesSeen: string[];
      notes: string;
      ruleCandidates: never[];
      sharedTerms: Record<string, string>;
      speakerId: string;
      styleRulesJa: string[];
      styleRulesZh: string[];
      updatedAt: string;
    } | null) => void) = () => {
      throw new Error("Expected profile resolver to be captured.");
    };
    const findProfileByName = vi.fn(
      () =>
        new Promise<{
          aliases: string[];
          correctionLexiconJa: Record<string, string>;
          correctionLexiconZh: Record<string, string>;
          displayName: string;
          languagesSeen: string[];
          notes: string;
          ruleCandidates: never[];
          sharedTerms: Record<string, string>;
          speakerId: string;
          styleRulesJa: string[];
          styleRulesZh: string[];
          updatedAt: string;
        } | null>((resolve) => {
          resolveProfile = resolve;
        })
    );
    const { DesktopEngine } = await import("./desktop-engine");
    const engine = new DesktopEngine(() => {}, {
      improveTranscript,
      segmentTranslator: { translateChineseToJapanese: vi.fn(async () => null) },
      speakerProfileStore: {
        findProfileByName,
        getProfile: vi.fn(async () => null)
      }
    });

    vadSegments.push({ samples: new Float32Array([0.1, -0.1]), start: 0 });
    decodeSegmentMock.mockReturnValue({
      lang: "zh",
      text: "先显示名字。",
      timestamps: [0],
      tokens: ["先显示名字。"]
    });
    speakerIdentifierState.identify.mockReturnValue({
      confidence: 0.91,
      name: "王晋"
    });

    await engine.startRecording();
    await engine.pushAudioChunk({
      deviceId: "default",
      deviceLabel: "Built-in Mic",
      rms: 0.3,
      sampleRate: 16_000,
      samples: new Float32Array(512)
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(engine.getLiveStageSnapshot().activeSegment).toEqual(
      expect.objectContaining({
        speakerDisplayName: "王晋",
        speakerId: null
      })
    );

    resolveProfile({
      aliases: [],
      correctionLexiconJa: {},
      correctionLexiconZh: {},
      displayName: "王晋",
      languagesSeen: ["zh"],
      notes: "",
      ruleCandidates: [],
      sharedTerms: {},
      speakerId: "speaker-wj",
      styleRulesJa: [],
      styleRulesZh: [],
      updatedAt: "2026-05-10T00:00:00.000Z"
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(engine.getLiveStageSnapshot().activeSegment).toEqual(
      expect.objectContaining({
        speakerDisplayName: "王晋",
        speakerId: "speaker-wj"
      })
    );

    await engine.stopRecording();
  });
});

function buildSettings(recording: Partial<AppSettings["recording"]>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    recording: {
      ...DEFAULT_SETTINGS.recording,
      ...recording
    }
  };
}
