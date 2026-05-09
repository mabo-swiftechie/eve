import { describe, expect, it } from "vitest";
import { normalizeLanguage } from "./desktop-engine-segment-output";

describe("normalizeLanguage", () => {
  it("maps common chinese and japanese language tags to stage-friendly values", () => {
    expect(normalizeLanguage("zh-CN")).toBe("zh");
    expect(normalizeLanguage("cmn")).toBe("zh");
    expect(normalizeLanguage("mandarin")).toBe("zh");
    expect(normalizeLanguage("ja-JP")).toBe("ja");
    expect(normalizeLanguage("japanese")).toBe("ja");
  });
});
