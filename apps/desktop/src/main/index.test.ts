import { describe, expect, it, vi } from "vitest";

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("../../resources/icon.png?asset", () => ({
  default: "/tmp/icon.png"
}));

vi.mock("electron-log/main", () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock("electron", () => {
  const app = {
    dock: {
      hide: vi.fn()
    },
    exit: vi.fn(),
    getName: vi.fn(() => "eve"),
    getPath: vi.fn(() => "/tmp"),
    getVersion: vi.fn(() => "0.0.0"),
    isPackaged: false,
    on: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    setAppUserModelId: vi.fn(),
    setLoginItemSettings: vi.fn(),
    setName: vi.fn(),
    show: vi.fn(),
    whenReady: vi.fn(() => new Promise<void>(() => {}))
  };

  return {
    app,
    dialog: {
      showOpenDialog: vi.fn()
    },
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandlers.set(channel, handler);
      }),
      on: vi.fn()
    },
    shell: {
      openExternal: vi.fn(),
      openPath: vi.fn()
    }
  };
});

vi.mock("./permissions", () => ({
  getMicrophonePermissionStatus: vi.fn(() => ({
    message: "Ready",
    state: "authorized",
    supported: true
  })),
  openMicrophonePrivacySettings: vi.fn(),
  requestMicrophonePermission: vi.fn()
}));

vi.mock("./desktop-engine", () => ({
  DesktopEngine: vi.fn()
}));

vi.mock("./test-engine", () => ({
  TestDesktopEngine: vi.fn()
}));

vi.mock("./store", () => ({
  applyTheme: vi.fn(),
  getSettings: vi.fn(() => ({
    desktop: {
      hideWindowOnClose: true,
      language: "system",
      launchAtLogin: false,
      startRecordingOnLaunch: false,
      theme: "system"
    },
    recording: {
      audioFormat: "wav",
      asrLanguage: "auto",
      autoSwitchConfirmations: 2,
      autoSwitchDevice: true,
      device: "default",
      disableAsr: false,
      excludeDeviceKeywords: "iphone,continuity",
      outputDir: "recordings",
      segmentMinutes: 60
    },
    transcribe: {
      watch: false
    }
  })),
  setSettings: vi.fn()
}));

vi.mock("./recording-history", () => ({
  listRecentRecordings: vi.fn(async () => [])
}));

vi.mock("./tray", () => ({
  destroyTray: vi.fn(),
  getTrayBounds: vi.fn(),
  initializeTray: vi.fn(),
  setTrayLaunchAtLogin: vi.fn(),
  setTrayStatus: vi.fn(),
  setTrayUpdaterState: vi.fn()
}));

vi.mock("./logging", () => ({
  initializeMainLogger: vi.fn()
}));

vi.mock("./window", () => ({
  createMainWindow: vi.fn(),
  positionWindowForReveal: vi.fn()
}));

vi.mock("./updater", () => ({
  checkForUpdates: vi.fn(),
  getAutoUpdateSnapshot: vi.fn(() => ({
    currentVersion: "0.0.0",
    downloadedVersion: null,
    downloadedVersionReady: false,
    errorMessage: null,
    installDeferredUntilIdle: false,
    latestVersion: null,
    phase: "idle",
    statusMessage: "Idle"
  })),
  initializeAutoUpdates: vi.fn(),
  installDownloadedUpdateIfReady: vi.fn(),
  isAutoUpdateInstalling: vi.fn(() => false),
  quitAndInstallUpdate: vi.fn(),
  shutdownAutoUpdates: vi.fn()
}));

describe("desktop:get-snapshot IPC handler", () => {
  it("returns required stage snapshots and review audio IPC", async () => {
    ipcHandlers.clear();
    await import("./index");

    const getSnapshotHandler = ipcHandlers.get("desktop:get-snapshot");
    expect(getSnapshotHandler).toBeTypeOf("function");
    expect(ipcHandlers.get("desktop:get-review-audio")).toBeTypeOf("function");

    const snapshot = await getSnapshotHandler?.();
    expect(snapshot).toMatchObject({
      liveStage: {
        activeSegment: null,
        recentSegments: []
      },
      review: {
        selectedRecordingId: null,
        segments: [],
        speakers: []
      }
    });
  });
});
