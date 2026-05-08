import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  EMPTY_LIVE_STAGE_SNAPSHOT,
  EMPTY_REVIEW_SNAPSHOT,
  type AppSettings,
  type DesktopSnapshot,
  type RuleCandidate,
  type SegmentRecord,
  type SpeakerProfile
} from "@eve/shared";

vi.mock("electron", () => ({
  default: {
    app: {
      getName: () => "eve",
      getPath: (name: string) => {
        if (name === "documents") {
          return join(tmpdir(), "eve-documents-test");
        }
        if (name === "userData") {
          return join(tmpdir(), "eve-user-data-test");
        }
        throw new Error(`unexpected path lookup: ${name}`);
      },
      getVersion: () => "0.0.0",
      isPackaged: false,
      on: vi.fn(),
      quit: vi.fn(),
      requestSingleInstanceLock: () => true,
      setAppUserModelId: vi.fn(),
      setLoginItemSettings: vi.fn(),
      setName: vi.fn(),
      show: vi.fn(),
      whenReady: vi.fn(() => new Promise<void>(() => {}))
    },
    nativeTheme: {
      themeSource: "system"
    },
    dialog: {
      showOpenDialog: vi.fn()
    },
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn()
    },
    shell: {
      openExternal: vi.fn(),
      openPath: vi.fn()
    }
  },
  app: {
    getName: () => "eve",
    getPath: (name: string) => {
      if (name === "documents") {
        return join(tmpdir(), "eve-documents-test");
      }
      if (name === "userData") {
        return join(tmpdir(), "eve-user-data-test");
      }
      throw new Error(`unexpected path lookup: ${name}`);
    },
    getVersion: () => "0.0.0",
    isPackaged: false,
    on: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: () => true,
    setAppUserModelId: vi.fn(),
    setLoginItemSettings: vi.fn(),
    setName: vi.fn(),
    show: vi.fn(),
    whenReady: vi.fn(() => new Promise<void>(() => {}))
  },
  dialog: {
    showOpenDialog: vi.fn()
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  nativeTheme: {
    themeSource: "system"
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn()
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

  it("supports review snapshots that link segments, speakers, and rule candidates", async () => {
    const { getIdleStatus, getSettings } = await import("./store");
    const snapshot = buildReviewSnapshot(getSettings(), getIdleStatus());

    expect(snapshot.liveStage).toMatchObject({
      activeSegment: snapshot.review.segments[0],
      recentSegments: [snapshot.review.segments[0]]
    });
    expect(summarizeReviewSnapshot(snapshot)).toEqual({
      displayTranscript: "长句短句都有，这设计吧。",
      pendingCandidates: ["长劲短劲->长句短句"],
      speakerName: "王晋"
    });
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

function buildReviewSnapshot(
  settings: AppSettings,
  status: DesktopSnapshot["status"]
): DesktopSnapshot {
  const segment: SegmentRecord = {
    audioClipRef: "/tmp/20260507_120000.wav",
    detectedLanguage: "zh",
    endAt: "2026-05-07T12:00:08.000Z",
    improvedAutoTranscript: "长句短句都有，这设计吧。",
    jaTranslation: "長文も短文もあります、この設計ですね。",
    manualCorrectedTranscript: null,
    rawTranscript: "长劲短劲都有，这设计吧。",
    recordingId: "rec-1",
    segmentId: "seg-1",
    speakerDisplayName: "王晋",
    speakerId: "speaker-wj",
    startAt: "2026-05-07T12:00:00.000Z",
    status: "translation_ready"
  };
  const candidate: RuleCandidate = {
    candidateId: "candidate-1",
    createdAt: "2026-05-07T12:10:00.000Z",
    fromText: "长劲短劲",
    language: "zh",
    segmentId: segment.segmentId,
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

  return {
    app: {
      name: "eve",
      repositoryUrl: "https://github.com/nexmoe/eve",
      version: "0.0.0"
    },
    devices: [],
    engineReady: false,
    history: [],
    liveStage: {
      ...EMPTY_LIVE_STAGE_SNAPSHOT,
      activeSegment: segment,
      recentSegments: [segment]
    },
    permission: {
      message: "Ready",
      state: "authorized",
      supported: true
    },
    review: {
      ...EMPTY_REVIEW_SNAPSHOT,
      selectedRecordingId: segment.recordingId,
      segments: [segment],
      speakers: [speaker]
    },
    settings,
    status,
    updater: {
      currentVersion: "0.0.0",
      downloadedVersion: null,
      downloadedVersionReady: false,
      errorMessage: null,
      installDeferredUntilIdle: false,
      latestVersion: null,
      phase: "idle",
      statusMessage: "Idle"
    },
    windowPinned: false
  };
}

function summarizeReviewSnapshot(snapshot: DesktopSnapshot) {
  const activeSegment = snapshot.review.segments[0];
  const speaker = snapshot.review.speakers.find((entry) => entry.speakerId === activeSegment.speakerId);
  return {
    displayTranscript:
      activeSegment.manualCorrectedTranscript ??
      activeSegment.improvedAutoTranscript ??
      activeSegment.rawTranscript,
    pendingCandidates:
      speaker?.ruleCandidates
        .filter((candidate) => {
          return candidate.segmentId === activeSegment.segmentId && candidate.status === "pending";
        })
        .map((candidate) => `${candidate.fromText}->${candidate.toText}`) ?? [],
    speakerName: speaker?.displayName ?? activeSegment.speakerDisplayName
  };
}
