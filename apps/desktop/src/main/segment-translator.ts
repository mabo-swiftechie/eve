export interface SegmentTranslator {
  translateChineseToJapanese(text: string): Promise<string | null>;
}

const JAPANESE_TRANSLATION_INSTRUCTIONS =
  "Translate the user's Chinese speech into natural Japanese. " +
  "Translate every clause and quoted speech fully into Japanese, " +
  "do not leave the original Chinese sentence unchanged, and return only the Japanese translation.";

const JAPANESE_TRANSLATION_RETRY_INSTRUCTIONS =
  "Translate the user's Chinese speech into idiomatic written Japanese. " +
  "Every sentence must be fully rendered in Japanese grammar with kana where natural. " +
  "Do not leave Chinese clauses unchanged except unavoidable proper nouns, and return only the Japanese translation.";

export class PassthroughSegmentTranslator implements SegmentTranslator {
  async translateChineseToJapanese(_text: string): Promise<null> {
    return null;
  }
}

interface OpenAISegmentTranslatorOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export class OpenAISegmentTranslator implements SegmentTranslator {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor({
    apiKey,
    baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    model = process.env.EVE_OPENAI_TRANSLATION_MODEL ?? "gpt-5-mini"
  }: OpenAISegmentTranslatorOptions) {
    this.apiKey = sanitizeApiKey(apiKey);
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
  }

  async translateChineseToJapanese(text: string): Promise<string | null> {
    const input = text.trim();
    if (!input) {
      return null;
    }
    const firstPass = await this.requestTranslation({
      input,
      instructions: JAPANESE_TRANSLATION_INSTRUCTIONS
    });
    if (isUsableJapaneseTranslation(input, firstPass)) {
      return firstPass;
    }
    const retryPass = await this.requestTranslation({
      input,
      instructions: JAPANESE_TRANSLATION_RETRY_INSTRUCTIONS
    });
    return isUsableJapaneseTranslation(input, retryPass) ? retryPass : null;
  }

  private async requestTranslation({
    input,
    instructions
  }: {
    input: string;
    instructions: string;
  }): Promise<string> {
    const response = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        instructions,
        input
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI translation failed with status ${response.status}`);
    }

    const payload = (await response.json()) as OpenAIResponsesPayload;
    return readOutputText(payload);
  }
}

export function createDefaultSegmentTranslator(): SegmentTranslator {
  const apiKey = sanitizeApiKey(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return new PassthroughSegmentTranslator();
  }
  return new OpenAISegmentTranslator({ apiKey });
}

interface OpenAIResponsesPayload {
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
  output_text?: string;
}

function readOutputText(payload: OpenAIResponsesPayload): string {
  const direct = payload.output_text?.trim();
  if (direct) {
    return direct;
  }
  const content = payload.output?.flatMap((item) => item.content ?? []) ?? [];
  return content
    .filter((item) => item.type === "output_text" || typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter((item) => item.length > 0)
    .join("\n");
}

function sanitizeApiKey(value: string | null | undefined): string {
  const token = value?.split(/\s+/).find((item) => item.length > 0);
  return token?.trim() ?? "";
}

function normalizeForComparison(text: string): string {
  return text.replace(/\s+/g, "").trim();
}

function isUsableJapaneseTranslation(input: string, output: string): boolean {
  const translated = output.trim();
  if (!translated) {
    return false;
  }
  if (normalizeForComparison(translated) === normalizeForComparison(input)) {
    return false;
  }
  const copiedChineseRuns = extractHanRuns(input).filter((run) => {
    return run.length >= 6 && translated.includes(run);
  });
  if (copiedChineseRuns.length > 0) {
    return false;
  }
  if (!containsKana(translated) && countHanCharacters(translated) >= 6) {
    return false;
  }
  return true;
}

function extractHanRuns(text: string): string[] {
  return text.match(/[\p{Script=Han}]{2,}/gu) ?? [];
}

function containsKana(text: string): boolean {
  return /[\u3040-\u309f\u30a0-\u30ff]/u.test(text);
}

function countHanCharacters(text: string): number {
  return (text.match(/\p{Script=Han}/gu) ?? []).length;
}
