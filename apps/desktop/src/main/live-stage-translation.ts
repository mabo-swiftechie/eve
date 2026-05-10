import type { SegmentRecord } from "@eve/shared";
import type { SegmentTranslator } from "./segment-translator";

const TRANSLATION_CHUNK_LIMIT = 48;

type TranslationTask = {
  onError: (error: unknown) => void;
  onTranslated: () => void;
  segment: SegmentRecord;
  segmentTranslator: SegmentTranslator;
};

let activeTaskPromise: Promise<void> | null = null;
let pendingTask: TranslationTask | null = null;

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
  pendingTask = {
    onError,
    onTranslated,
    segment,
    segmentTranslator
  };
  activeTaskPromise ??= drainTranslationQueue();
}

export function resetLiveStageTranslationPriority(): void {
  activeTaskPromise = null;
  pendingTask = null;
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

async function drainTranslationQueue(): Promise<void> {
  try {
    while (pendingTask) {
      const task = pendingTask;
      pendingTask = null;
      await runTranslationTask(task);
    }
  } finally {
    activeTaskPromise = null;
    if (pendingTask) {
      activeTaskPromise = drainTranslationQueue();
    }
  }
}

async function runTranslationTask({
  onError,
  onTranslated,
  segment,
  segmentTranslator
}: TranslationTask): Promise<void> {
  const improvedText = segment.improvedAutoTranscript;
  if (!improvedText) {
    return;
  }
  try {
    const chunks = splitTranslationChunks(improvedText);
    const translatedChunks: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const jaTranslation = await segmentTranslator.translateChineseToJapanese(chunk);
      if (!jaTranslation?.trim()) {
        continue;
      }
      translatedChunks.push(jaTranslation.trim());
      segment.jaTranslation = buildProgressiveTranslation(chunks, translatedChunks);
      segment.status = index === chunks.length - 1
        ? "translation_ready"
        : "auto_improved";
      onTranslated();
    }
  } catch (error) {
    onError(error);
  }
}

export function buildProgressiveTranslation(
  sourceChunks: string[],
  translatedChunks: string[]
): string {
  return sourceChunks
    .map((chunk, index) => translatedChunks[index] ?? chunk)
    .join("");
}

function splitFallbackChunks(text: string): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += TRANSLATION_CHUNK_LIMIT) {
    chunks.push(text.slice(index, index + TRANSLATION_CHUNK_LIMIT));
  }
  return chunks;
}
