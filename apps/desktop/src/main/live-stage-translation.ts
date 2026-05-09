import type { SegmentRecord } from "@eve/shared";
import type { SegmentTranslator } from "./segment-translator";

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
      const jaTranslation = await segmentTranslator.translateChineseToJapanese(improvedText);
      if (!jaTranslation?.trim()) {
        return;
      }
      segment.jaTranslation = jaTranslation;
      segment.status = "translation_ready";
      onTranslated();
    } catch (error) {
      onError(error);
    }
  })();
}
