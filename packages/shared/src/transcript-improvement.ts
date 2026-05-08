import type { SpeakerProfile } from "./index";

const CJK_CHAR = "[\\u3400-\\u9fff\\uf900-\\ufaff\\u3040-\\u30ff\\u31f0-\\u31ff\\u3005\\u30fc]";

export const improveTranscript = (
  raw: string,
  language: string,
  profile: SpeakerProfile | null
): string => {
  if (language !== "zh" && language !== "ja") {
    return raw;
  }

  const sharedTerms = profile?.sharedTerms ?? {};
  const lexicon =
    language === "ja"
      ? profile?.correctionLexiconJa ?? {}
      : profile?.correctionLexiconZh ?? {};
  const styleRules =
    language === "ja"
      ? profile?.styleRulesJa ?? []
      : profile?.styleRulesZh ?? [];

  return applyFluencyCleanup(
    applyStyleRules(applyReplacements(applyReplacements(raw, sharedTerms), lexicon), styleRules),
    language
  );
};

const applyReplacements = (
  input: string,
  replacements: Record<string, string>
): string => {
  let output = input;
  for (const [fromText, toText] of Object.entries(replacements).sort(
    ([left], [right]) => right.length - left.length
  )) {
    if (!fromText) {
      continue;
    }
    output = output.replaceAll(fromText, toText);
  }
  return output;
};

const applyStyleRules = (input: string, styleRules: string[]): string => {
  let output = input;
  for (const rule of styleRules) {
    const [fromText, toText] = rule.split("=>").map((value) => value?.trim() ?? "");
    if (!fromText || !toText) {
      continue;
    }
    output = output.replaceAll(fromText, toText);
  }
  return output;
};

const applyFluencyCleanup = (input: string, language: string): string => {
  let output = input.replace(/[ \t]+/g, " ").trim();
  output = output.replace(/\s+([,.;:!?])/g, "$1");
  output = output.replace(/\s*([，。！？；：、])\s*/gu, "$1");

  if (language === "zh" || language === "ja") {
    const betweenCjk = new RegExp(`(${CJK_CHAR})\\s+(${CJK_CHAR})`, "gu");
    output = output.replace(betweenCjk, "$1$2");
  }

  return output;
};
