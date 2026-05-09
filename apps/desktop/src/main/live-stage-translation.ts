import type { SegmentRecord } from "@eve/shared";
import type { SegmentTranslator } from "./segment-translator";

const TRANSLATION_CHUNK_LIMIT = 48;

export function backfillChineseTranslation({
  detectedLanguage,
  onError,
  onTranslated,
  segment,
  segmentTranslator
}: {
  detectedLanguage: string;
  onError: (error: unknown) => void;
  onTranslated: () => void;
  segment: SegmentRecord;
  segmentTranslator: SegmentTranslator;
}): void {
  const improvedText = segment.improvedAutoTranscript;
  if (detectedLanguage !== "zh" || !improvedText) {
    return;
  }
  void (async () => {
    try {
      const chunks = splitTranslationChunks(improvedText);
      const translatedChunks: string[] = [];
      for (const chunk of chunks) {
        const jaTranslation = await segmentTranslator.translateChineseToJapanese(chunk);
        if (!jaTranslation?.trim()) {
          continue;
        }
        translatedChunks.push(jaTranslation.trim());
        segment.jaTranslation = translatedChunks.join("");
        segment.status = "translation_ready";
        onTranslated();
      }
    } catch (error) {
      onError(error);
    }
  })();
}

export function splitTranslationChunks(text: string): string[] {
  const input = text.trim();
  if (!input) {
    return [];
  }
  if (input.length <= TRANSLATION_CHUNK_LIMIT) {
    return [input];
  }
  const sentences = input
    .split(/(?<=[。！？!?；;：:，,、])/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (sentences.length <= 1) {
    return splitFallbackChunks(input);
  }
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }
    if ((current + sentence).length <= TRANSLATION_CHUNK_LIMIT) {
      current += sentence;
      continue;
    }
    chunks.push(current);
    current = sentence;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks.flatMap((chunk) => {
    return chunk.length <= TRANSLATION_CHUNK_LIMIT
      ? [chunk]
      : splitFallbackChunks(chunk);
  });
}

function splitFallbackChunks(text: string): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += TRANSLATION_CHUNK_LIMIT) {
    chunks.push(text.slice(index, index + TRANSLATION_CHUNK_LIMIT));
  }
  return chunks;
}
