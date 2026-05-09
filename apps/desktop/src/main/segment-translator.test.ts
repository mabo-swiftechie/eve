import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultSegmentTranslator,
  OpenAISegmentTranslator,
  PassthroughSegmentTranslator
} from "./segment-translator";

describe("createDefaultSegmentTranslator", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
      return;
    }
    delete process.env.OPENAI_API_KEY;
  });

  it("uses passthrough translation when no OpenAI API key is configured", () => {
    const translator = createDefaultSegmentTranslator();

    expect(translator).toBeInstanceOf(PassthroughSegmentTranslator);
  });

  it("uses the OpenAI translator when an API key is configured", () => {
    process.env.OPENAI_API_KEY = "test-key";

    const translator = createDefaultSegmentTranslator();

    expect(translator).toBeInstanceOf(OpenAISegmentTranslator);
  });
});

describe("OpenAISegmentTranslator", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns translated text from the Responses API", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: "これは日本語訳です。"
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    const translator = new OpenAISegmentTranslator({ apiKey: "test-key" });
    const translated = await translator.translateChineseToJapanese("这是中文。");

    expect(translated).toBe("これは日本語訳です。");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns null when OpenAI responds without translated text", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: ""
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    const translator = new OpenAISegmentTranslator({ apiKey: "test-key" });
    const translated = await translator.translateChineseToJapanese("这是中文。");

    expect(translated).toBeNull();
  });
});
