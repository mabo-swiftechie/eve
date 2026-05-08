import { describe, expect, it } from "vitest";
import type { SpeakerProfile } from "@eve/shared";
import { improveTranscript } from "./segment-enhancer";

describe("improveTranscript", () => {
  it("applies shared terms before speaker lexicon rules", () => {
    const profile = createProfile({
      correctionLexiconZh: { "长劲短劲": "长句短句" },
      sharedTerms: { Qwen3: "Qwen3" }
    });

    expect(improveTranscript("长劲短劲都有，Qwen3 也有。", "zh", profile)).toBe(
      "长句短句都有，Qwen3 也有。"
    );
  });

  it("uses japanese lexicon only for japanese segments", () => {
    const profile = createProfile({
      correctionLexiconJa: { "てすと": "テスト" },
      correctionLexiconZh: { "てすと": "不会用到" }
    });

    expect(improveTranscript("てすと です。", "ja", profile)).toBe("テストです。");
  });

  it("leaves unsupported languages unchanged", () => {
    const profile = createProfile({
      correctionLexiconZh: { hello: "你好" }
    });

    expect(improveTranscript("hello world", "en", profile)).toBe("hello world");
  });

  it("applies conservative style rules after lexicon replacements", () => {
    const profile = createProfile({
      correctionLexiconZh: { "长劲短劲": "长句短句" },
      styleRulesZh: ["长句短句 都有=>长句短句都有"]
    });

    expect(improveTranscript("长劲短劲 都有。", "zh", profile)).toBe("长句短句都有。");
  });
});

function createProfile(
  overrides: Partial<SpeakerProfile> = {}
): SpeakerProfile {
  return {
    aliases: [],
    correctionLexiconJa: {},
    correctionLexiconZh: {},
    displayName: "王晋",
    languagesSeen: ["zh"],
    notes: "",
    ruleCandidates: [],
    sharedTerms: {},
    speakerId: "speaker-wj",
    styleRulesJa: [],
    styleRulesZh: [],
    updatedAt: "2026-05-07T12:00:00.000Z",
    ...overrides
  };
}
