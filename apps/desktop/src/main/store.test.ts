import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  type AppSettings
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
