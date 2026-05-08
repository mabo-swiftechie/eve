import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type DesktopSnapshot
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

  it("keeps legacy snapshot producers compatible with optional review data", async () => {
    const { getIdleStatus, getSettings } = await import("./store");
    const snapshot = buildLegacySnapshot(getSettings(), getIdleStatus());

    expect(snapshot.review?.segments ?? []).toEqual([]);
    expect(snapshot.liveStage?.recentSegments ?? []).toEqual([]);
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

function buildLegacySnapshot(
  settings: AppSettings,
  status: DesktopSnapshot["status"]
): DesktopSnapshot {
  return {
    app: {
      name: "eve",
      repositoryUrl: "https://github.com/nexmoe/eve",
      version: "0.0.0"
    },
    devices: [],
    engineReady: false,
    history: [],
    permission: {
      message: "Ready",
      state: "authorized",
      supported: true
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
