import { describe, expect, it } from "vitest";
import { inferDetectedLanguage } from "./language-routing";

describe("inferDetectedLanguage", () => {
  it("falls back to chinese for han-only text when the recognizer omits language", () => {
    expect(inferDetectedLanguage("unknown", "这个核心的运算芯片，就是NVIDIA。")).toBe("zh");
  });

  it("falls back to japanese when kana is present", () => {
    expect(inferDetectedLanguage("unknown", "これは日本語のテキストです。")).toBe("ja");
  });

  it("prefers normalized recognizer output when it is already available", () => {
    expect(inferDetectedLanguage("zh-CN", "これは日本語のテキストです。")).toBe("zh");
  });
});
