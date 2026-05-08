import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type RuleCandidate,
  type SpeakerProfile
} from "@eve/shared";

vi.mock("electron", () => ({
  default: {
    app: {
      getPath: (name: string) => {
        if (name !== "documents") {
          throw new Error(`unexpected path lookup: ${name}`);
        }
        return join(tmpdir(), "eve-documents-test");
      }
    },
    nativeTheme: {
      themeSource: "system"
    }
  },
  app: {
    getPath: (name: string) => {
      if (name !== "documents") {
        throw new Error(`unexpected path lookup: ${name}`);
      }
      return join(tmpdir(), "eve-documents-test");
    }
  },
  nativeTheme: {
    themeSource: "system"
  }
}));

describe("desktop store settings", () => {
  let storeDir = "";

  beforeEach(() => {
    storeDir = mkdtempSync(join(tmpdir(), "eve-store-test-"));
    process.env.EVE_STORE_DIR = storeDir;
  });

  afterEach(() => {
    delete process.env.EVE_STORE_DIR;
    rmSync(storeDir, { force: true, recursive: true });
  });

  it("persists every settings field and updates derived state", async () => {
    const { nativeTheme } = await import("electron");
    const { applyTheme, getIdleStatus, getSettings, setSettings } = await import("./store");
    const expectedSettings = buildExpectedSettings(storeDir);
    const expectedDefaultSettings: AppSettings = {
      ...DEFAULT_SETTINGS,
      recording: {
        ...DEFAULT_SETTINGS.recording,
        outputDir: join(tmpdir(), "eve-documents-test", "Eve Recorder")
      }
    };

    expect(getSettings()).toEqual(expectedDefaultSettings);

    const savedSettings = setSettings(expectedSettings);
    expect(savedSettings).toEqual(expectedSettings);
    expect(getSettings()).toEqual(expectedSettings);

    applyTheme("light");
    expect(nativeTheme.themeSource).toBe("light");

    expect(getIdleStatus()).toMatchObject({
      asrEnabled: false,
      autoSwitchEnabled: false,
      deviceLabel: expectedSettings.recording.device
    });
  });

  it("supports speaker profiles with candidate review contracts", () => {
    const candidate: RuleCandidate = {
      candidateId: "candidate-1",
      createdAt: "2026-05-07T12:10:00.000Z",
      fromText: "长劲短劲",
      language: "zh",
      segmentId: "seg-1",
      speakerId: "speaker-wj",
      status: "pending",
      toText: "长句短句",
      updatedAt: "2026-05-07T12:10:00.000Z"
    };
    const speaker: SpeakerProfile = {
      aliases: ["晋哥"],
      correctionLexiconJa: {},
      correctionLexiconZh: {
        "长劲短劲": "长句短句"
      },
      displayName: "王晋",
      languagesSeen: ["zh", "ja"],
      notes: "Prefers product terms kept in English.",
      ruleCandidates: [candidate],
      sharedTerms: {
        Qwen3: "Qwen3"
      },
      speakerId: "speaker-wj",
      styleRulesJa: [],
      styleRulesZh: ["Prefer short clauses where possible."],
      updatedAt: "2026-05-07T12:11:00.000Z"
    };

    expect(speaker.ruleCandidates[0]?.toText).toBe("长句短句");
    expect(speaker.languagesSeen).toContain("ja");
  });
});

function buildExpectedSettings(storeDir: string): AppSettings {
  return {
    desktop: {
      hideWindowOnClose: true,
      language: "en-US",
      launchAtLogin: false,
      startRecordingOnLaunch: false,
      theme: "light"
    },
    recording: {
      audioFormat: "wav",
      asrLanguage: "ja",
      autoSwitchConfirmations: 3,
      autoSwitchDevice: false,
      device: "usb-mic",
      disableAsr: true,
      excludeDeviceKeywords: "bluetooth,continuity",
      outputDir: join(storeDir, "recordings-out"),
      segmentMinutes: 90
    },
    transcribe: {
      watch: true
    }
  };
}
