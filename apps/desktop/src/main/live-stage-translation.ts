import type { SegmentRecord } from "@eve/shared";
import type { SegmentTranslator } from "./segment-translator";

const TRANSLATION_CHUNK_LIMIT = 48;
const MAX_PENDING_TRANSLATION_TASKS = 3;

type TranslationTask = {
  onError: (error: unknown) => void;
  onTranslated: () => void;
  segment: SegmentRecord;
  segmentTranslator: SegmentTranslator;
};

let activeTaskPromise: Promise<void> | null = null;
let pendingTasks: TranslationTask[] = [];

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
  enqueueTranslationTask({
    onError,
    onTranslated,
    segment,
    segmentTranslator
  });
  activeTaskPromise ??= drainTranslationQueue();
}

export function resetLiveStageTranslationPriority(): void {
  activeTaskPromise = null;
  pendingTasks = [];
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
    while (pendingTasks.length > 0) {
      const task = pendingTasks.shift();
      if (!task) {
        continue;
      }
      await runTranslationTask(task);
    }
  } finally {
    activeTaskPromise = null;
    if (pendingTasks.length > 0) {
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
    segment.timings ??= {};
    segment.timings.translationStartedAt = new Date().toISOString();
    const chunks = splitTranslationChunks(improvedText);
    const translatedChunks: Array<string | null> = Array.from(
      { length: chunks.length },
      () => null
    );
    let translatedCount = 0;
    for (const [index, chunk] of chunks.entries()) {
      const jaTranslation = await translateChunkWithFallback(segmentTranslator, chunk);
      if (!jaTranslation?.trim()) {
        continue;
      }
      translatedChunks[index] = jaTranslation.trim();
      translatedCount += 1;
      segment.jaTranslation = buildProgressiveTranslation(chunks, translatedChunks);
      segment.translationError = null;
      segment.timings.translationFirstChunkAt ??= new Date().toISOString();
      segment.status = translatedCount === chunks.length ? "translation_ready" : "auto_improved";
      if (segment.status === "translation_ready") {
        segment.timings.translationCompletedAt = new Date().toISOString();
      }
      onTranslated();
    }
    if (translatedCount === 0) {
      segment.translationError = "untranslated_output";
      return;
    }
    if (translatedCount < chunks.length) {
      segment.translationError = "partial_untranslated_output";
    }
  } catch (error) {
    segment.translationError = summarizeTranslationError(error);
    onError(error);
  }
}

export function buildProgressiveTranslation(
  sourceChunks: string[],
  translatedChunks: Array<string | null>
): string {
  return sourceChunks
    .map((chunk, index) => translatedChunks[index] ?? chunk)
    .join("");
}

async function translateChunkWithFallback(
  segmentTranslator: SegmentTranslator,
  chunk: string
): Promise<string | null> {
  const directTranslation = await segmentTranslator.translateChineseToJapanese(chunk);
  if (directTranslation?.trim()) {
    return directTranslation.trim();
  }
  const retryChunks = splitRetryChunks(chunk);
  if (retryChunks.length <= 1) {
    return null;
  }
  const translatedRetryChunks = await Promise.all(
    retryChunks.map((item) => segmentTranslator.translateChineseToJapanese(item))
  );
  if (translatedRetryChunks.some((item) => !item?.trim())) {
    return null;
  }
  return translatedRetryChunks.map((item) => item!.trim()).join("");
}

function splitFallbackChunks(text: string): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += TRANSLATION_CHUNK_LIMIT) {
    chunks.push(text.slice(index, index + TRANSLATION_CHUNK_LIMIT));
  }
  return chunks;
}

function splitRetryChunks(text: string): string[] {
  const clauses = text
    .split(/(?<=[，,、；;：:。！？!?])/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (clauses.length > 1) {
    return clauses;
  }
  const midpoint = Math.ceil(text.length / 2);
  return [text.slice(0, midpoint).trim(), text.slice(midpoint).trim()].filter(
    (item) => item.length > 0
  );
}

function summarizeTranslationError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("status 401")) {
      return "invalid_api_key";
    }
    if (error.message.includes("fetch failed")) {
      return "network_error";
    }
    return error.message;
  }
  return "translation_failed";
}

function enqueueTranslationTask(task: TranslationTask): void {
  task.segment.timings ??= {};
  task.segment.timings.translationQueuedAt = new Date().toISOString();
  pendingTasks = pendingTasks.filter((item) => {
    return item.segment.segmentId !== task.segment.segmentId;
  });
  pendingTasks.unshift(task);
  if (pendingTasks.length > MAX_PENDING_TRANSLATION_TASKS) {
    pendingTasks = pendingTasks.slice(0, MAX_PENDING_TRANSLATION_TASKS);
  }
}
