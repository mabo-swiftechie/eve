export interface SegmentTranslator {
  translateChineseToJapanese(text: string): Promise<string | null>;
}

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
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
  }

  async translateChineseToJapanese(text: string): Promise<string | null> {
    const input = text.trim();
    if (!input) {
      return null;
    }

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        instructions:
          "Translate the user's Chinese speech into natural Japanese. Return only the Japanese translation.",
        input
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI translation failed with status ${response.status}`);
    }

    const payload = (await response.json()) as OpenAIResponsesPayload;
    const translated = readOutputText(payload);
    return translated.length > 0 ? translated : null;
  }
}

export function createDefaultSegmentTranslator(): SegmentTranslator {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
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
