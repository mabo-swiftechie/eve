import log from "electron-log/main";
import { DEFAULT_SETTINGS, DEFAULT_STATUS, type AppSettings, type DeviceInfo, type LiveStageSnapshot, type RecorderStatusSnapshot } from "@eve/shared";
import {
  buildWaveformBins,
  createSenseVoiceRecognizer,
  createSherpaVad,
  decodeSegment,
  downsampleTo16k,
  rmsToDb
} from "./audio-utils";
import {
  buildEnrichedSegmentRecord,
  buildSentenceCues,
  createRecordingSegment,
  persistRecordingSegment,
  type RecordingSegment
} from "./desktop-engine-segment-output";
import { buildLiveStageSnapshot } from "./desktop-engine-live-stage";
import { transcribeAudioDirectory } from "./desktop-engine-transcribe";
import { inferDetectedLanguage } from "./language-routing";
import { ModelManager } from "./model-manager";
import { SpeakerIdentifier, getDefaultSpeakerRegistryPath } from "./speaker-identifier";
import { improveTranscript as defaultImproveTranscript } from "./segment-enhancer";
import {
  PassthroughSegmentTranslator,
  type SegmentTranslator
} from "./segment-translator";
import { SpeakerProfileStore } from "./speaker-profile-store";

interface AudioChunkPayload {
  deviceId: string;
  deviceLabel: string;
  rms: number;
  sampleRate: number;
  samples: Float32Array;
}

type StatusListener = (status: RecorderStatusSnapshot) => void;

interface DesktopEngineDependencies {
  improveTranscript?: typeof defaultImproveTranscript;
  segmentTranslator?: SegmentTranslator;
  speakerProfileStore?: Pick<SpeakerProfileStore, "findProfileByName" | "getProfile">;
}

const HISTORY_LIMIT = 5;
const AUDIO_QUEUE_ASR_BACKPRESSURE_THRESHOLD = 6;
const AUDIO_QUEUE_ASR_RESUME_THRESHOLD = 2;
const AUDIO_QUEUE_MAX_SIZE = 30;
const DIAGNOSTIC_LOG_INTERVAL_MS = 15_000;
const TRANSCRIBE_LIMIT = 0;

export class DesktopEngine {
  private readonly improveTranscript: typeof defaultImproveTranscript;
  private readonly modelManager = new ModelManager();
  private readonly onStatus: StatusListener;
  private readonly pendingAudioChunks: AudioChunkPayload[] = [];
  private readonly queueIdleWaiters = new Set<() => void>();
  private readonly segmentTranslator: SegmentTranslator;
  private readonly speakerProfileStore: Pick<SpeakerProfileStore, "findProfileByName" | "getProfile">;
  private devices: DeviceInfo[] = [];
  private settings: AppSettings = DEFAULT_SETTINGS;
  private status: RecorderStatusSnapshot = {
    ...DEFAULT_STATUS,
    ...this.modelManager.getStatus()
  };
  private processingAudioQueue = false;
  private recognizer: ReturnType<typeof createSenseVoiceRecognizer> | null = null;
  private segment: RecordingSegment | null = null;
  private recordingStartedAt = 0;
  private skippedAsrChunks = 0;
  private asrBackpressureActive = false;
  private lastDiagnosticLogAt = 0;
  private vad: ReturnType<typeof createSherpaVad> | null = null;
  private vadRemainder = new Float32Array(0);
  private speakerIdentifier: SpeakerIdentifier | null = null;

  constructor(onStatus: StatusListener, {
    improveTranscript = defaultImproveTranscript,
    segmentTranslator = new PassthroughSegmentTranslator(),
    speakerProfileStore = new SpeakerProfileStore()
  }: DesktopEngineDependencies = {}) {
    this.onStatus = onStatus;
    this.improveTranscript = improveTranscript;
    this.segmentTranslator = segmentTranslator;
    this.speakerProfileStore = speakerProfileStore;
    this.modelManager.onStatus((assetStatus) => this.patchStatus(assetStatus));
  }

  async applySettings(settings: AppSettings): Promise<void> {
    const previous = this.settings;
    const recognizerSettingsChanged =
      previous.recording.asrLanguage !== settings.recording.asrLanguage ||
      previous.recording.disableAsr !== settings.recording.disableAsr;
    const shouldRotateOpenSegment =
      this.status.recording &&
      this.segment &&
      (previous.recording.audioFormat !== settings.recording.audioFormat ||
        previous.recording.outputDir !== settings.recording.outputDir ||
        previous.recording.disableAsr !== settings.recording.disableAsr);

    if (shouldRotateOpenSegment) {
      if (settings.recording.audioFormat === "flac") {
        await this.modelManager.requireFfmpeg();
      }
      const deviceLabel = this.segment!.deviceLabel;
      await this.flushVad();
      await this.closeSegment();
      this.settings = settings;
      if (recognizerSettingsChanged) {
        this.recognizer = settings.recording.disableAsr
          ? null
          : createSenseVoiceRecognizer(
              this.modelManager.getSenseVoiceDirectory(),
              settings.recording.asrLanguage
            );
      }
      this.segment = await this.openSegment(deviceLabel);
      this.patchStatus({
        asrPreview: "",
        statusMessage: "Started a new recording segment."
      });
    } else {
      this.settings = settings;
      if (recognizerSettingsChanged) {
        this.recognizer = settings.recording.disableAsr
          ? null
          : createSenseVoiceRecognizer(
              this.modelManager.getSenseVoiceDirectory(),
              settings.recording.asrLanguage
            );
      }
    }
    this.patchStatus({
      asrEnabled: !settings.recording.disableAsr,
      asrHistory: settings.recording.disableAsr ? [] : this.status.asrHistory,
      asrPreview: settings.recording.disableAsr ? "" : this.status.asrPreview,
      autoSwitchEnabled: settings.recording.autoSwitchDevice
    });
  }

  getDevices(): DeviceInfo[] { return this.devices; }

  getReady(): boolean {
    if (this.settings.recording.disableAsr) {
      return !this.status.downloading;
    }
    return this.status.senseVoiceReady && this.status.vadReady && !this.status.downloading;
  }

  getStatus(): RecorderStatusSnapshot { return { ...this.status }; }

  getLiveStageSnapshot(): LiveStageSnapshot { return buildLiveStageSnapshot(this.segment); }

  updateDevices(devices: DeviceInfo[]): void { this.devices = devices; }

  reportCaptureError(error: string): void {
    this.patchStatus({
      error,
      recording: false,
      statusMessage: error
    });
  }

  async startRecording(): Promise<void> {
    if (this.status.recording) return;
    const liveTranscriptionEnabled = !this.settings.recording.disableAsr;
    if (liveTranscriptionEnabled) {
      await this.modelManager.ensureRuntimeAssets();
    }
    if (this.settings.recording.audioFormat === "flac") {
      await this.modelManager.requireFfmpeg();
    }
    if (liveTranscriptionEnabled) {
      this.recognizer ??= createSenseVoiceRecognizer(this.modelManager.getSenseVoiceDirectory(), this.settings.recording.asrLanguage);
    }
    this.vad = this.status.vadReady ? createSherpaVad(this.modelManager.getVadModelPath()) : null;
    this.vadRemainder = new Float32Array(0);
    this.pendingAudioChunks.length = 0;
    this.skippedAsrChunks = 0;
    this.asrBackpressureActive = false;
    this.lastDiagnosticLogAt = 0;
    this.recordingStartedAt = Date.now();

    if (this.status.speakerEmbeddingReady) {
      this.speakerIdentifier = new SpeakerIdentifier(this.modelManager.getSpeakerEmbeddingModelPath());
      const ok = this.speakerIdentifier.initialize();
      if (ok) {
        await this.speakerIdentifier.loadSpeakerRegistry(getDefaultSpeakerRegistryPath());
      } else {
        this.speakerIdentifier = null;
      }
    }

    this.segment = await this.openSegment();
    this.logDiagnostics("recording-started");
    this.patchStatus({
      asrEnabled: liveTranscriptionEnabled,
      asrHistory: [],
      asrPreview: "",
      error: null,
      inSpeech: false,
      recording: true,
      statusMessage: liveTranscriptionEnabled ? "Recording with Qwen3 ASR." : "Recording audio only.",
      waveformBins: DEFAULT_STATUS.waveformBins
    });
  }

  async stopRecording(): Promise<void> {
    if (!this.status.recording) return;
    await this.waitForPendingAudio();
    await this.flushVad();
    await this.closeSegment();
    this.vad = null;
    this.vadRemainder = new Float32Array(0);
    this.pendingAudioChunks.length = 0;
    this.speakerIdentifier = null;
    this.segment = null;
    this.recordingStartedAt = 0;
    this.logDiagnostics("recording-stopped", { force: true });
    this.patchStatus({
      elapsed: "00:00:00",
      inSpeech: false,
      recording: false,
      statusMessage: "Recording stopped."
    });
  }

  async pushAudioChunk(payload: AudioChunkPayload): Promise<void> {
    if (!this.status.recording || !this.segment) return;
    // Drop oldest chunks when the queue grows too large to prevent unbounded
    // memory growth when processing can't keep up with the input rate.
    if (this.pendingAudioChunks.length >= AUDIO_QUEUE_MAX_SIZE) {
      const dropped = this.pendingAudioChunks.length - AUDIO_QUEUE_ASR_RESUME_THRESHOLD;
      this.pendingAudioChunks.splice(0, dropped);
      log.warn(`[eve][engine] audio queue overflow – dropped ${dropped} chunks`);
    }
    this.pendingAudioChunks.push(payload);
    this.scheduleAudioQueueDrain();
  }

  private scheduleAudioQueueDrain(): void {
    if (this.processingAudioQueue) return;
    this.processingAudioQueue = true;
    void this.drainAudioQueue();
  }

  private async drainAudioQueue(): Promise<void> {
    try {
      while (this.pendingAudioChunks.length > 0) {
        const payload = this.pendingAudioChunks.shift();
        if (!payload) continue;
        try {
          await this.processAudioChunk(payload);
        } catch (error) {
          log.error("[eve][engine] failed to process audio chunk", error);
          this.reportCaptureError(error instanceof Error ? error.message : "Audio processing failed.");
          this.pendingAudioChunks.length = 0;
          break;
        }
      }
    } finally {
      this.processingAudioQueue = false;
      if (this.pendingAudioChunks.length > 0) {
        this.scheduleAudioQueueDrain();
        return;
      }
      for (const resolve of this.queueIdleWaiters) {
        resolve();
      }
      this.queueIdleWaiters.clear();
    }
  }

  private async processAudioChunk(payload: AudioChunkPayload): Promise<void> {
    if (!this.status.recording || !this.segment) return;
    if (this.shouldRotateSegment()) {
      await this.rotateSegment(payload.deviceLabel);
    }
    const samples = downsampleTo16k(payload.samples, payload.sampleRate);
    this.patchStatus({
      db: rmsToDb(payload.rms),
      deviceLabel: payload.deviceLabel || this.segment.deviceLabel,
      elapsed: this.elapsedLabel(),
      levelRatio: payload.rms,
      rms: payload.rms,
      waveformBins: buildWaveformBins(samples)
    });
    let decodeSegments = !this.settings.recording.disableAsr;
    if (decodeSegments && this.shouldThrottleAsr()) {
      this.skippedAsrChunks += 1;
      this.logDiagnostics("audio-backpressure");
      decodeSegments = false;
    }
    await this.consumeVadSamples(samples, { decodeSegments });
  }

  async runTranscribe(inputDirectory: string): Promise<void> {
    await this.modelManager.ensureRuntimeAssets();
    const recognizer =
      this.recognizer ??
      createSenseVoiceRecognizer(this.modelManager.getSenseVoiceDirectory(), this.settings.recording.asrLanguage);
    this.recognizer = recognizer;
    const processed = await transcribeAudioDirectory({
      improveTranscript: (raw, language) => this.improveTranscript(raw, language, null),
      inputDirectory,
      limit: TRANSCRIBE_LIMIT,
      recognizer,
      requireFfmpeg: () => this.modelManager.requireFfmpeg(),
      segmentTranslator: this.segmentTranslator
    });
    this.patchStatus({
      statusMessage: `Transcribed ${processed} recording${processed === 1 ? "" : "s"}.`
    });
  }

  private async consumeVadSamples(samples: Float32Array, { decodeSegments }: { decodeSegments: boolean }): Promise<void> {
    if (!this.vad) return;
    const windowSize = this.vad.config.sileroVad.windowSize;
    let data: Float32Array;
    if (this.vadRemainder.length === 0) {
      data = samples;
    } else {
      data = new Float32Array(this.vadRemainder.length + samples.length);
      data.set(this.vadRemainder);
      data.set(samples, this.vadRemainder.length);
    }

    let offset = 0;
    while (offset + windowSize <= data.length) {
      this.vad.acceptWaveform(data.subarray(offset, offset + windowSize));
      offset += windowSize;
      this.patchStatus({ inSpeech: this.vad.isDetected() });
      await this.drainVadSegments({ decodeSegments });
    }
    const remaining = data.length - offset;
    if (remaining > 0) {
      this.vadRemainder = data.slice(offset);
    } else {
      this.vadRemainder = new Float32Array(0);
    }
  }

  private async drainVadSegments({ decodeSegments }: { decodeSegments: boolean }): Promise<void> {
    if (!this.vad) return;
    while (!this.vad.isEmpty()) {
      const vadSegment = this.vad.front(false);
      this.vad.pop();
      if (!this.segment) continue;
      await this.segment.writer.append(vadSegment.samples);
      if (!decodeSegments || !this.recognizer) continue;
      const result = decodeSegment(this.recognizer, vadSegment.samples);
      const text = result.text.trim();
      if (!text) continue;
      let speaker: string | null = null;
      let confidence: number | null = null;
      if (this.speakerIdentifier?.isInitialized) {
        const match = this.speakerIdentifier.identify(vadSegment.samples, 0.5);
        if (match) {
          speaker = match.name;
          confidence = match.confidence;
        }
      }
      const speakerProfile = speaker
        ? await this.speakerProfileStore.findProfileByName(speaker)
        : null;
      const speakerId = speakerProfile?.speakerId ?? null;
      const speakerDisplayName = speakerProfile?.displayName ?? speaker ?? "Speaker A";
      const detectedLanguage = inferDetectedLanguage(result.lang, text);
      const improvedAutoTranscript = this.improveTranscript(text, detectedLanguage, speakerProfile);
      let jaTranslation: string | null = null;
      if (detectedLanguage === "zh") {
        try {
          jaTranslation = await this.segmentTranslator.translateChineseToJapanese(
            improvedAutoTranscript
          );
        } catch (error) {
          log.warn("[eve][engine] failed to translate zh segment", error);
        }
      }
      const enrichedSegment = buildEnrichedSegmentRecord({
        audioClipRef: this.segment.audioPath,
        confidence,
        detectedLanguage,
        improvedAutoTranscript,
        jaTranslation,
        rawDetectedLanguage: result.lang,
        rawTranscript: text,
        recordingId: this.segment.recordingId,
        sentenceCues: buildSentenceCues({
          result,
          startOffsetMs: vadSegment.start,
          vadSampleCount: vadSegment.samples.length
        }),
        speaker,
        speakerDisplayName,
        speakerId,
        startOffsetMs: vadSegment.start,
        startedAt: this.segment.startedAt,
        vadSampleCount: vadSegment.samples.length
      });
      const history = this.status.asrPreview
        ? [this.status.asrPreview, ...this.status.asrHistory]
        : [...this.status.asrHistory];
      this.segment.texts.push(text);
      this.segment.speechSegments.push(enrichedSegment);
      this.patchStatus({
        asrHistory: history.slice(0, HISTORY_LIMIT),
        asrPreview: text,
        statusMessage: enrichedSegment.speakerDisplayName
          ? `Speech recognized (${enrichedSegment.speakerDisplayName}).`
          : "Speech recognized."
      });
    }
  }

  private async flushVad(): Promise<void> {
    if (!this.vad) return;
    if (this.vadRemainder.length > 0) {
      const padded = new Float32Array(this.vad.config.sileroVad.windowSize);
      padded.set(this.vadRemainder);
      this.vad.acceptWaveform(padded);
      this.vadRemainder = new Float32Array(0);
    }
    this.vad.flush();
    await this.drainVadSegments({ decodeSegments: !this.settings.recording.disableAsr });
  }

  private shouldRotateSegment(): boolean {
    return !!this.segment &&
      Date.now() - this.segment.startedAt.getTime() >= this.settings.recording.segmentMinutes * 60_000;
  }

  private async rotateSegment(deviceLabel: string): Promise<void> {
    await this.flushVad();
    await this.closeSegment();
    this.segment = await this.openSegment(deviceLabel);
    this.patchStatus({
      asrPreview: "",
      statusMessage: "Started a new recording segment."
    });
  }

  private async openSegment(deviceLabel?: string): Promise<RecordingSegment> {
    return createRecordingSegment({ deviceLabel: deviceLabel || this.status.deviceLabel || "default", disableAsr: this.settings.recording.disableAsr, outputDir: this.settings.recording.outputDir });
  }

  private async closeSegment(): Promise<void> {
    if (!this.segment) return;
    const current = this.segment;
    this.segment = null;
    await persistRecordingSegment(current, this.settings.recording.audioFormat);
  }

  private shouldThrottleAsr(): boolean {
    const backlog = this.pendingAudioChunks.length;
    if (!this.asrBackpressureActive && backlog >= AUDIO_QUEUE_ASR_BACKPRESSURE_THRESHOLD) {
      this.asrBackpressureActive = true;
      this.logDiagnostics("asr-backpressure-enabled", { force: true });
    } else if (this.asrBackpressureActive && backlog <= AUDIO_QUEUE_ASR_RESUME_THRESHOLD) {
      this.asrBackpressureActive = false;
      this.logDiagnostics("asr-backpressure-cleared", { force: true });
    }
    return this.asrBackpressureActive;
  }

  private async waitForPendingAudio(): Promise<void> { if (!this.processingAudioQueue && this.pendingAudioChunks.length === 0) return; await new Promise<void>((resolve) => this.queueIdleWaiters.add(resolve)); }

  private elapsedLabel(): string {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - this.recordingStartedAt) / 1000));
    const hours = Math.floor(elapsedSeconds / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((elapsedSeconds % 3600) / 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${(elapsedSeconds % 60).toString().padStart(2, "0")}`;
  }

  private patchStatus(patch: Partial<RecorderStatusSnapshot>): void { this.status = { ...this.status, ...patch }; this.onStatus(this.getStatus()); }

  private logDiagnostics(reason: string, { force = false }: { force?: boolean } = {}): void {
    const now = Date.now();
    if (!force && now - this.lastDiagnosticLogAt < DIAGNOSTIC_LOG_INTERVAL_MS) return;
    this.lastDiagnosticLogAt = now;
    const memory = process.memoryUsage();
    log.info(
      [
        `[eve][engine] ${reason}`,
        `rss=${Math.round(memory.rss / 1024 / 1024)}MB`,
        `heapUsed=${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
        `external=${Math.round(memory.external / 1024 / 1024)}MB`,
        `queue=${this.pendingAudioChunks.length}`,
        `skippedAsr=${this.skippedAsrChunks}`,
        `recording=${this.status.recording}`
      ].join(" ")
    );
  }
}
