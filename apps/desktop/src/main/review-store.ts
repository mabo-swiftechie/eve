import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { RuleCandidate, SegmentRecord, SentenceCorrection, SentenceCue } from "@eve/shared";
import { writeJsonAtomic } from "./audio-utils";

interface SegmentPayload {
  audio_clip_ref?: unknown;
  detected_language?: unknown;
  end_at?: unknown;
  improved_auto_transcript?: unknown;
  ja_translation?: unknown;
  manual_corrected_transcript?: unknown;
  manual_sentence_corrections?: unknown;
  raw_transcript?: unknown;
  recording_id?: unknown;
  segment_id?: unknown;
  sentence_cues?: unknown;
  speaker_display_name?: unknown;
  speaker_id?: unknown;
  start_at?: unknown;
  status?: unknown;
}

interface ReviewFilePayload {
  speech_segments?: unknown;
}

type ReviewSegmentSource = SegmentRecord & {
  sourceJsonPath: string;
};

const toText = (value: unknown): string => {
  return typeof value === "string" ? value : "";
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

export class ReviewStore {
  async deriveCandidates(segment: SegmentRecord): Promise<RuleCandidate[]> {
    const sentenceCandidates = deriveSentenceCandidates(segment);
    if (sentenceCandidates.length > 0) {
      return sentenceCandidates;
    }

    const manual = segment.manualCorrectedTranscript?.trim() ?? "";
    const automatic = (segment.improvedAutoTranscript ?? segment.rawTranscript).trim();
    if (!manual || manual === automatic) {
      return [];
    }

    return [buildCandidate(segment, manual, automatic)];
  }

  async listSegments(recordingDirectory: string): Promise<SegmentRecord[]> {
    const sources = await this.listSegmentSources(recordingDirectory);
    return sources.map(({ sourceJsonPath: _ignored, ...segment }) => segment);
  }

  async loadSegmentAudioDataUrl(
    recordingDirectory: string,
    segmentId: string
  ): Promise<string | null> {
    const sources = await this.listSegmentSources(recordingDirectory);
    const target = sources.find((segment) => segment.segmentId === segmentId);
    if (!target?.audioClipRef) {
      return null;
    }

    const mimeType = getAudioMimeType(target.audioClipRef);
    if (!mimeType) {
      return null;
    }

    const audioBuffer = await readFile(target.audioClipRef).catch(() => null);
    if (!audioBuffer) {
      return null;
    }

    return `data:${mimeType};base64,${audioBuffer.toString("base64")}`;
  }

  async saveManualCorrection(
    recordingDirectory: string,
    segmentId: string,
    transcript: string,
    sentenceCorrections?: SentenceCorrection[]
  ): Promise<SegmentRecord> {
    const normalizedTranscript = transcript.trim();
    const sources = await this.listSegmentSources(recordingDirectory);
    const target = sources.find((segment) => segment.segmentId === segmentId);
    if (!target) {
      throw new Error(`Review segment not found for ${segmentId}`);
    }

    const payload = JSON.parse(await readFile(target.sourceJsonPath, "utf8")) as ReviewFilePayload;
    const serializedSegments = Array.isArray(payload.speech_segments)
      ? payload.speech_segments.map((item) => {
          if (!isObject(item) || toText(item.segment_id) !== segmentId) {
            return item;
          }
          return {
            ...item,
            manual_corrected_transcript: normalizedTranscript || null,
            manual_sentence_corrections: serializeSentenceCorrections(sentenceCorrections),
            status: normalizedTranscript ? "manually_corrected" : target.status
          };
        })
      : [];

    await writeJsonAtomic(target.sourceJsonPath, {
      ...payload,
      speech_segments: serializedSegments
    });

    return {
      ...target,
      manualCorrectedTranscript: normalizedTranscript || null,
      manualSentenceCorrections: sentenceCorrections,
      status: normalizedTranscript ? "manually_corrected" : target.status
    };
  }

  private async listSegmentSources(
    recordingDirectory: string
  ): Promise<ReviewSegmentSource[]> {
    const jsonPaths = await this.collectJsonPaths(resolve(recordingDirectory));
    const segments = await Promise.all(
      jsonPaths.map(async (jsonPath) => {
        const raw = JSON.parse(await readFile(jsonPath, "utf8")) as ReviewFilePayload;
        const serializedSegments = Array.isArray(raw.speech_segments) ? raw.speech_segments : [];
        return serializedSegments
          .map((item) => parseSegment(item, jsonPath))
          .filter((segment): segment is ReviewSegmentSource => segment !== null);
      })
    );
    return segments.flat().sort((left, right) => left.startAt.localeCompare(right.startAt));
  }

  private async collectJsonPaths(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) {
          return this.collectJsonPaths(fullPath);
        }
        return entry.isFile() && extname(fullPath).toLowerCase() === ".json"
          ? [fullPath]
          : [];
      })
    );
    return nested.flat().sort();
  }
}

function parseSegment(
  value: unknown,
  sourceJsonPath: string
): ReviewSegmentSource | null {
  if (!isObject(value)) {
    return null;
  }
  const segmentId = toText(value.segment_id).trim();
  const rawTranscript = toText(value.raw_transcript).trim();
  if (!segmentId || !rawTranscript) {
    return null;
  }
  return {
    audioClipRef: toText(value.audio_clip_ref),
    detectedLanguage: toText(value.detected_language) || "unknown",
    endAt: toText(value.end_at),
    improvedAutoTranscript: toNullableText(value.improved_auto_transcript),
    jaTranslation: toNullableText(value.ja_translation),
    manualCorrectedTranscript: toNullableText(value.manual_corrected_transcript),
    manualSentenceCorrections: parseSentenceCorrections(value.manual_sentence_corrections),
    rawTranscript,
    recordingId: toText(value.recording_id),
    segmentId,
    sentenceCues: parseSentenceCues(value.sentence_cues),
    speakerDisplayName: toText(value.speaker_display_name) || "Speaker A",
    speakerId: toNullableText(value.speaker_id),
    sourceJsonPath,
    startAt: toText(value.start_at),
    status: parseStatus(value.status)
  };
}

function parseStatus(value: unknown): SegmentRecord["status"] {
  if (
    value === "raw_only" ||
    value === "auto_improved" ||
    value === "manually_corrected" ||
    value === "translation_ready"
  ) {
    return value;
  }
  return "raw_only";
}

function toNullableText(value: unknown): string | null {
  const text = toText(value).trim();
  return text.length > 0 ? text : null;
}

function parseSentenceCues(value: unknown): SentenceCue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const cues = value
    .map((item) => {
      if (!isObject(item)) {
        return null;
      }
      const text = toText(item.text).trim();
      const startMs = toNumber(item.start_ms);
      const endMs = toNumber(item.end_ms);
      if (!text || startMs === null || endMs === null) {
        return null;
      }
      return {
        endMs,
        startMs,
        text
      };
    })
    .filter((cue): cue is SentenceCue => cue !== null);
  return cues.length > 0 ? cues : undefined;
}

function parseSentenceCorrections(value: unknown): SentenceCorrection[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const corrections = value
    .map((item) => {
      if (!isObject(item)) {
        return null;
      }
      const text = toText(item.text).trim();
      if (!text) {
        return null;
      }
      return {
        cue: parseSentenceCue(item.cue),
        text
      };
    })
    .filter((correction): correction is SentenceCorrection => correction !== null);
  return corrections.length > 0 ? corrections : undefined;
}

function parseSentenceCue(value: unknown): SentenceCue | null {
  if (!isObject(value)) {
    return null;
  }
  const text = toText(value.text).trim();
  const startMs = toNumber(value.start_ms);
  const endMs = toNumber(value.end_ms);
  if (!text || startMs === null || endMs === null) {
    return null;
  }
  return { endMs, startMs, text };
}

function serializeSentenceCorrections(
  corrections?: SentenceCorrection[]
): Array<Record<string, unknown>> | null {
  if (!corrections || corrections.length === 0) {
    return null;
  }
  return corrections.map((correction) => ({
    cue: correction.cue
      ? {
          end_ms: correction.cue.endMs,
          start_ms: correction.cue.startMs,
          text: correction.cue.text
        }
      : null,
    text: correction.text
  }));
}

function deriveSentenceCandidates(segment: SegmentRecord): RuleCandidate[] {
  const manualCorrections = segment.manualSentenceCorrections;
  if (!manualCorrections || manualCorrections.length === 0) {
    return [];
  }

  const baseSentences = getBaseSentenceTexts(segment);
  return manualCorrections.flatMap((correction, index) => {
    const manual = correction.text.trim();
    const automatic = (
      correction.cue?.text ??
      baseSentences[index] ??
      ""
    ).trim();
    if (!manual || !automatic || manual === automatic) {
      return [];
    }
    return [buildCandidate(segment, manual, automatic, index, correction.cue)];
  });
}

function getBaseSentenceTexts(segment: SegmentRecord): string[] {
  if (segment.sentenceCues && segment.sentenceCues.length > 0) {
    return segment.sentenceCues.map((cue) => cue.text.trim());
  }
  return splitSentences(segment.improvedAutoTranscript ?? segment.rawTranscript);
}

function splitSentences(transcript: string): string[] {
  const normalized = transcript.trim();
  if (!normalized) {
    return [];
  }
  const matches = normalized.match(/[^。！？!?]+[。！？!?]?/gu) ?? [];
  const sentences = matches.map((part) => part.trim()).filter(Boolean);
  return sentences.length > 0 ? sentences : [normalized];
}

function buildCandidate(
  segment: SegmentRecord,
  manual: string,
  automatic: string,
  sentenceIndex?: number,
  sentenceCue?: SentenceCue | null
): RuleCandidate {
  const timestamp = new Date().toISOString();
  return {
    candidateId:
      sentenceIndex === undefined
        ? `${segment.segmentId}:manual`
        : `${segment.segmentId}:manual:${sentenceIndex}`,
    createdAt: timestamp,
    fromText: automatic,
    language: segment.detectedLanguage,
    segmentId: segment.segmentId,
    sentenceCue,
    sentenceIndex,
    speakerId: segment.speakerId ?? "unassigned",
    status: "pending",
    toText: manual,
    updatedAt: timestamp
  };
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getAudioMimeType(audioPath: string): string | null {
  const extension = extname(audioPath).toLowerCase();
  if (extension === ".flac") {
    return "audio/flac";
  }
  if (extension === ".m4a") {
    return "audio/mp4";
  }
  if (extension === ".mp3") {
    return "audio/mpeg";
  }
  if (extension === ".wav") {
    return "audio/wav";
  }
  return null;
}
