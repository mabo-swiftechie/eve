import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  type AudioFormat,
  type SegmentRecord,
  type SentenceCue
} from "@eve/shared";
import type { RecognitionResult } from "./audio-utils";
import { WavWriter, transcodeWavToFlac, writeJsonAtomic } from "./audio-utils";

const SPEECH_SAMPLE_RATE = 16_000;

export interface EnrichedSegmentRecord extends SegmentRecord {
  confidence: number | null;
  speaker: string | null;
  text: string;
}

export interface RecordingSegment {
  audioPath: string;
  createdAt: string;
  deviceLabel: string;
  jsonPath: string | null;
  recordingId: string;
  speechSegments: EnrichedSegmentRecord[];
  startedAt: Date;
  texts: string[];
  wavPath: string;
  writer: WavWriter;
}

interface CreateRecordingSegmentOptions {
  deviceLabel: string;
  disableAsr: boolean;
  now?: Date;
  outputDir: string;
}

interface BuildEnrichedSegmentRecordOptions {
  audioClipRef: string;
  confidence: number | null;
  detectedLanguage: string;
  improvedAutoTranscript: string | null;
  jaTranslation: string | null;
  rawTranscript: string;
  recordingId: string;
  sentenceCues?: SentenceCue[];
  speaker: string | null;
  speakerDisplayName: string;
  speakerId: string | null;
  startOffsetMs: number;
  startedAt: Date;
  vadSampleCount: number;
}

export async function createRecordingSegment({
  deviceLabel,
  disableAsr,
  now = new Date(),
  outputDir
}: CreateRecordingSegmentOptions): Promise<RecordingSegment> {
  const outputDirectory = resolve(outputDir, formatSegmentDirectoryName(now));
  await mkdir(outputDirectory, { recursive: true });
  const baseName = formatSegmentName(now);
  const wavPath = join(outputDirectory, `${baseName}.wav`);
  return {
    audioPath: wavPath,
    createdAt: now.toISOString(),
    deviceLabel,
    jsonPath: disableAsr ? null : join(outputDirectory, `${baseName}.json`),
    recordingId: baseName,
    speechSegments: [],
    startedAt: now,
    texts: [],
    wavPath,
    writer: new WavWriter(wavPath)
  };
}

export function buildEnrichedSegmentRecord({
  audioClipRef,
  confidence,
  detectedLanguage,
  improvedAutoTranscript,
  jaTranslation,
  rawTranscript,
  recordingId,
  sentenceCues,
  speaker,
  speakerDisplayName,
  speakerId,
  startOffsetMs,
  startedAt,
  vadSampleCount
}: BuildEnrichedSegmentRecordOptions): EnrichedSegmentRecord {
  const startAtMs = startedAt.getTime() + startOffsetMs;
  return {
    audioClipRef,
    confidence,
    detectedLanguage,
    endAt: new Date(startAtMs + getSegmentDurationMs(vadSampleCount)).toISOString(),
    improvedAutoTranscript,
    jaTranslation,
    manualCorrectedTranscript: null,
    rawTranscript,
    recordingId,
    segmentId: randomUUID(),
    sentenceCues,
    speaker,
    speakerDisplayName,
    speakerId,
    startAt: new Date(startAtMs).toISOString(),
    status: jaTranslation ? "translation_ready" : "auto_improved",
    text: rawTranscript
  };
}

export async function persistRecordingSegment(
  segment: RecordingSegment,
  audioFormat: AudioFormat
): Promise<void> {
  await segment.writer.close();
  const finalAudioPath = await finalizeAudioPath(segment.wavPath, audioFormat);
  if (!segment.jsonPath) {
    return;
  }

  const payload: Record<string, unknown> = {
    audio_file: basename(finalAudioPath),
    audio_path: finalAudioPath,
    backend: "sherpa-onnx",
    created_at: segment.createdAt,
    input_device: segment.deviceLabel,
    model: "Qwen3 ASR",
    segment_start_time: segment.startedAt.toISOString(),
    status: "ok",
    text: segment.texts.join(" ").trim()
  };

  if (segment.speechSegments.length > 0) {
    payload.speech_segments = segment.speechSegments.map((speechSegment) =>
      serializeSegmentRecord(speechSegment, finalAudioPath)
    );
  }

  await writeJsonAtomic(segment.jsonPath, payload);
}

export function normalizeLanguage(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : "unknown";
}

async function finalizeAudioPath(
  wavPath: string,
  audioFormat: AudioFormat
): Promise<string> {
  if (audioFormat !== "flac") {
    return wavPath;
  }

  const finalAudioPath = wavPath.replace(/\.wav$/i, ".flac");
  await transcodeWavToFlac(wavPath, finalAudioPath);
  await rm(wavPath, { force: true });
  return finalAudioPath;
}

function serializeSegmentRecord(
  segment: EnrichedSegmentRecord,
  finalAudioPath: string
): Record<string, unknown> {
  return {
    audio_clip_ref: finalAudioPath,
    confidence: segment.confidence,
    detected_language: segment.detectedLanguage,
    end_at: segment.endAt,
    improved_auto_transcript: segment.improvedAutoTranscript,
    ja_translation: segment.jaTranslation,
    manual_corrected_transcript: segment.manualCorrectedTranscript,
    raw_transcript: segment.rawTranscript,
    recording_id: segment.recordingId,
    segment_id: segment.segmentId,
    sentence_cues: segment.sentenceCues ?? [],
    speaker: segment.speaker,
    speaker_display_name: segment.speakerDisplayName,
    speaker_id: segment.speakerId,
    start_at: segment.startAt,
    status: segment.status,
    text: segment.text
  };
}

function getSegmentDurationMs(vadSampleCount: number): number {
  return Math.round((vadSampleCount / SPEECH_SAMPLE_RATE) * 1000);
}

export function buildSentenceCues({
  result,
  startOffsetMs,
  vadSampleCount
}: {
  result: Pick<RecognitionResult, "text" | "timestamps" | "tokens">;
  startOffsetMs: number;
  vadSampleCount: number;
}): SentenceCue[] {
  const totalDurationMs = Math.max(
    getSegmentDurationMs(vadSampleCount),
    getTimestampCoverageMs(result.timestamps),
    1_000
  );
  const timed = buildTimedSentenceCues({ result, startOffsetMs, totalDurationMs });
  return timed.length > 0
    ? timed
    : buildFallbackSentenceCues({
        startOffsetMs,
        text: result.text.trim(),
        totalDurationMs
      });
}

function buildTimedSentenceCues({
  result,
  startOffsetMs,
  totalDurationMs
}: {
  result: Pick<RecognitionResult, "text" | "timestamps" | "tokens">;
  startOffsetMs: number;
  totalDurationMs: number;
}): SentenceCue[] {
  if (result.tokens.length === 0 || result.tokens.length !== result.timestamps.length) {
    return [];
  }

  const cues: SentenceCue[] = [];
  let sentenceStartIndex = 0;
  for (let index = 0; index < result.tokens.length; index += 1) {
    const token = result.tokens[index] ?? "";
    const shouldClose =
      index === result.tokens.length - 1 || /[。！？!?；;]/u.test(token);
    if (!shouldClose) {
      continue;
    }

    const text = normalizeCueText(result.tokens.slice(sentenceStartIndex, index + 1).join(""));
    if (text) {
      const startMs = startOffsetMs + toMilliseconds(result.timestamps[sentenceStartIndex] ?? 0);
      const endMs = Math.min(
        startOffsetMs + totalDurationMs,
        startOffsetMs +
          toMilliseconds(
            result.timestamps[index + 1] ??
              (result.timestamps[index] ?? totalDurationMs / 1000) + 0.4
          )
      );
      cues.push({
        endMs: Math.max(endMs, startMs + 400),
        startMs,
        text
      });
    }
    sentenceStartIndex = index + 1;
  }
  return cues.filter((cue) => cue.text.length > 0);
}

function buildFallbackSentenceCues({
  startOffsetMs,
  text,
  totalDurationMs
}: {
  startOffsetMs: number;
  text: string;
  totalDurationMs: number;
}): SentenceCue[] {
  const sentences = text
    .split(/(?<=[。！？!?；;])/u)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length <= 1) {
    return text
      ? [
          {
            endMs: startOffsetMs + totalDurationMs,
            startMs: startOffsetMs,
            text
          }
        ]
      : [];
  }
  const sliceMs = Math.max(Math.floor(totalDurationMs / sentences.length), 600);
  return sentences.map((sentence, index) => ({
    endMs:
      index === sentences.length - 1
        ? startOffsetMs + totalDurationMs
        : startOffsetMs + sliceMs * (index + 1),
    startMs: startOffsetMs + sliceMs * index,
    text: sentence
  }));
}

function normalizeCueText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toMilliseconds(value: number): number {
  return Math.max(0, Math.round(value * 1000));
}

function getTimestampCoverageMs(timestamps: number[]): number {
  const lastTimestamp = timestamps.at(-1);
  return typeof lastTimestamp === "number" ? toMilliseconds(lastTimestamp + 0.4) : 0;
}

function formatSegmentName(value: Date): string {
  const stamp = `${value.getFullYear()}${`${value.getMonth() + 1}`.padStart(2, "0")}${`${value.getDate()}`.padStart(2, "0")}_${`${value.getHours()}`.padStart(2, "0")}${`${value.getMinutes()}`.padStart(2, "0")}${`${value.getSeconds()}`.padStart(2, "0")}`;
  return `eve_${stamp}`;
}

function formatSegmentDirectoryName(value: Date): string {
  return `${value.getFullYear()}${`${value.getMonth() + 1}`.padStart(2, "0")}${`${value.getDate()}`.padStart(2, "0")}`;
}
