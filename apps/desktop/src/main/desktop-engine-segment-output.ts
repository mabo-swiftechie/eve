import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  type AudioFormat,
  type SegmentRecord
} from "@eve/shared";
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

function formatSegmentName(value: Date): string {
  const stamp = `${value.getFullYear()}${`${value.getMonth() + 1}`.padStart(2, "0")}${`${value.getDate()}`.padStart(2, "0")}_${`${value.getHours()}`.padStart(2, "0")}${`${value.getMinutes()}`.padStart(2, "0")}${`${value.getSeconds()}`.padStart(2, "0")}`;
  return `eve_${stamp}`;
}

function formatSegmentDirectoryName(value: Date): string {
  return `${value.getFullYear()}${`${value.getMonth() + 1}`.padStart(2, "0")}${`${value.getDate()}`.padStart(2, "0")}`;
}
