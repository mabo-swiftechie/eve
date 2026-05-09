import log from "electron-log/main";
import { readdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import {
  buildEnrichedSegmentRecord,
  buildSentenceCues
} from "./desktop-engine-segment-output";
import { transcribeAudioFile, writeJsonAtomic } from "./audio-utils";
import { inferDetectedLanguage } from "./language-routing";
import type { SegmentTranslator } from "./segment-translator";

const AUDIO_EXTENSIONS = new Set([".flac", ".wav"]);

interface TranscribeAudioDirectoryOptions {
  improveTranscript: (raw: string, language: string, profile: null) => string;
  inputDirectory: string;
  limit: number;
  recognizer: Parameters<typeof transcribeAudioFile>[0];
  requireFfmpeg: () => Promise<void>;
  segmentTranslator: SegmentTranslator;
}

export async function transcribeAudioDirectory({
  improveTranscript,
  inputDirectory,
  limit,
  recognizer,
  requireFfmpeg,
  segmentTranslator
}: TranscribeAudioDirectoryOptions): Promise<number> {
  const files = await collectAudioFiles(resolve(inputDirectory));
  let processed = 0;

  for (const audioPath of files) {
    if (limit > 0 && processed >= limit) {
      break;
    }
    if (extname(audioPath).toLowerCase() !== ".wav") {
      await requireFfmpeg();
    }

    const jsonPath = `${audioPath.slice(0, -extname(audioPath).length)}.json`;
    const result = await transcribeAudioFile(recognizer, audioPath);
    const rawTranscript = result.text.trim();
    const detectedLanguage = inferDetectedLanguage(result.lang, rawTranscript);
    const improvedAutoTranscript = improveTranscript(rawTranscript, detectedLanguage, null);
    let jaTranslation: string | null = null;
    if (detectedLanguage === "zh") {
      try {
        jaTranslation = await segmentTranslator.translateChineseToJapanese(
          improvedAutoTranscript
        );
      } catch (error) {
        log.warn("[eve][engine] failed to translate zh recording", error);
      }
    }
    const createdAt = new Date();
    const recordingId = basename(audioPath, extname(audioPath));
    const speechSegment = buildEnrichedSegmentRecord({
      audioClipRef: audioPath,
      confidence: null,
      detectedLanguage,
      improvedAutoTranscript,
      jaTranslation,
      rawTranscript,
      recordingId,
      sentenceCues: buildSentenceCues({
        result,
        startOffsetMs: 0,
        vadSampleCount: 0
      }),
      speaker: null,
      speakerDisplayName: "Speaker A",
      speakerId: null,
      startOffsetMs: 0,
      startedAt: createdAt,
      vadSampleCount: 0
    });

    await writeJsonAtomic(jsonPath, {
      audio_file: basename(audioPath),
      audio_path: audioPath,
      backend: "sherpa-onnx",
      created_at: createdAt.toISOString(),
      language: result.lang || null,
      model: "Qwen3 ASR",
      speech_segments: [
        {
          audio_clip_ref: speechSegment.audioClipRef,
          confidence: speechSegment.confidence,
          detected_language: speechSegment.detectedLanguage,
          end_at: speechSegment.endAt,
          improved_auto_transcript: speechSegment.improvedAutoTranscript,
          ja_translation: speechSegment.jaTranslation,
          manual_corrected_transcript: speechSegment.manualCorrectedTranscript,
          raw_transcript: speechSegment.rawTranscript,
          recording_id: speechSegment.recordingId,
          segment_id: speechSegment.segmentId,
          sentence_cues: speechSegment.sentenceCues ?? [],
          speaker: speechSegment.speaker,
          speaker_display_name: speechSegment.speakerDisplayName,
          speaker_id: speechSegment.speakerId,
          start_at: speechSegment.startAt,
          status: speechSegment.status,
          text: speechSegment.text
        }
      ],
      status: "ok",
      text: rawTranscript
    });
    processed += 1;
  }

  return processed;
}

async function collectAudioFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectAudioFiles(fullPath);
      }
      if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(fullPath).toLowerCase())) {
        return [fullPath];
      }
      return [];
    })
  );
  return files.flat().sort();
}
