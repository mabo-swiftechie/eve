import { normalizeLanguage } from "./desktop-engine-segment-output";

const KANA_PATTERN = /[\u3040-\u30ff]/u;
const HAN_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

export function inferDetectedLanguage(
  rawLanguage: string | null | undefined,
  text: string
): string {
  const normalized = normalizeLanguage(rawLanguage);
  if (normalized !== "unknown") {
    return normalized;
  }
  if (KANA_PATTERN.test(text)) {
    return "ja";
  }
  if (HAN_PATTERN.test(text)) {
    return "zh";
  }
  return "unknown";
}
