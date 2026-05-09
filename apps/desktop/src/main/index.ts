import icon from "../../resources/icon.png?asset";
import log from "electron-log/main";
import { app, type BrowserWindow } from "electron";
import { DEFAULT_SETTINGS, DEFAULT_STATUS, EMPTY_LIVE_STAGE_SNAPSHOT, EMPTY_REVIEW_SNAPSHOT, type AppSettings, type DesktopSnapshot, type DeviceInfo, type RecorderStatusSnapshot } from "@eve/shared";
import { getMicrophonePermissionStatus, openMicrophonePrivacySettings, requestMicrophonePermission } from "./permissions";
import { DesktopEngine } from "./desktop-engine";
import { TestDesktopEngine } from "./test-engine";
import { applyTheme, getSettings, setSettings } from "./store";
import { listRecentRecordings } from "./recording-history";
import { destroyTray, getTrayBounds, initializeTray, setTrayLaunchAtLogin, setTrayStatus, setTrayUpdaterState } from "./tray";
import { initializeMainLogger } from "./logging";
import { createMainWindow, positionWindowForReveal } from "./window";
import { checkForUpdates, getAutoUpdateSnapshot, initializeAutoUpdates, installDownloadedUpdateIfReady, isAutoUpdateInstalling, quitAndInstallUpdate, shutdownAutoUpdates } from "./updater";
import { registerDesktopIpcHandlers } from "./desktop-ipc";
import { ReviewStore } from "./review-store";
import { SpeakerProfileStore } from "./speaker-profile-store";
import { activateAppForPermissionPrompt, applyLoginItemSettings, applyWindowPinnedState, captureStartRecordingError, ensureMicrophonePermission, finalizeRecordingBeforeQuit, openRendererDevTools, startEngineRecording, toggleMainWindow } from "./desktop-runtime-utils";

const isE2E = process.env.EVE_E2E_TEST === "1";
const REPOSITORY_URL = "https://github.com/nexmoe/eve";

type DesktopEngineLike = Pick<
  DesktopEngine,
  | "applySettings"
  | "getDevices"
  | "getLiveStageSnapshot"
  | "getReady"
  | "getStatus"
  | "updateDevices"
  | "reportCaptureError"
  | "startRecording"
  | "stopRecording"
  | "runTranscribe"
  | "pushAudioChunk"
>;

let mainWindow: BrowserWindow | null = null;
let engine: DesktopEngineLike | null = null;
let lastStatus: RecorderStatusSnapshot = DEFAULT_STATUS;
let isQuitting = false;
let isWindowPinned = false;
let isRevealing = false;
let quitAfterRecordingFinalize = false;
let cachedDevices: DesktopSnapshot["devices"] = [];
let cachedHistory: DesktopSnapshot["history"] = [];
let cachedReview: DesktopSnapshot["review"] = EMPTY_REVIEW_SNAPSHOT;
let cachedPermission = isE2E
  ? { message: "E2E microphone permission granted.", state: "authorized" as const, supported: true }
  : getMicrophonePermissionStatus();

// Audio-chunk status updates arrive many times per second, so renderer
// snapshot emission is throttled to at most once per 100 ms during recording.
const SNAPSHOT_THROTTLE_MS = 100;
let snapshotThrottleTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotPending = false;
const reviewStore = new ReviewStore();
const speakerProfileStore = new SpeakerProfileStore();

const scheduleSnapshotEmit = (): void => {
  snapshotPending = true;
  if (snapshotThrottleTimer) {
    return;
  }
  snapshotThrottleTimer = setTimeout(() => {
    snapshotThrottleTimer = null;
    if (snapshotPending) {
      snapshotPending = false;
      void emitSnapshot(buildSnapshot(), { force: true });
    }
  }, SNAPSHOT_THROTTLE_MS);
};

const hideDockIcon = (): void => {
  if (process.platform === "darwin" && !isE2E) {
    app.dock?.hide();
  }
};

const buildSnapshot = (): DesktopSnapshot => {
  const settings = getSettings();
  return {
    app: {
      name: app.getName(),
      repositoryUrl: REPOSITORY_URL,
      version: app.getVersion()
    },
    devices: cachedDevices,
    engineReady: engine?.getReady() ?? false,
    history: cachedHistory,
    liveStage: engine?.getLiveStageSnapshot() ?? EMPTY_LIVE_STAGE_SNAPSHOT,
    permission: cachedPermission,
    review: cachedReview,
    settings,
    status: lastStatus,
    updater: getAutoUpdateSnapshot(),
    windowPinned: isWindowPinned
  };
};

const getSnapshot = async ({
  refreshDevices = false,
  refreshHistory = false,
  refreshPermission = false,
  reviewRecordingId
}: {
  refreshDevices?: boolean;
  refreshHistory?: boolean;
  refreshPermission?: boolean;
  reviewRecordingId?: string | null;
} = {}): Promise<DesktopSnapshot> => {
  const settings = getSettings();
  const activeReviewRecordingId =
    reviewRecordingId === undefined
      ? cachedReview.selectedRecordingId
      : reviewRecordingId;
  const [devices, history, reviewSegments, reviewSpeakers] = await Promise.all([
    refreshDevices
      ? Promise.resolve(engine?.getDevices() ?? cachedDevices)
      : Promise.resolve(cachedDevices),
    refreshHistory
      ? listRecentRecordings([
          settings.recording.outputDir,
          DEFAULT_SETTINGS.recording.outputDir
        ]).catch(() => cachedHistory)
      : Promise.resolve(cachedHistory),
    activeReviewRecordingId
      ? reviewStore.listSegments(activeReviewRecordingId).catch(() => cachedReview.segments)
      : Promise.resolve([]),
    activeReviewRecordingId
      ? speakerProfileStore.listProfiles().catch(() => cachedReview.speakers)
      : Promise.resolve([])
  ]);
  if (refreshDevices) {
    cachedDevices = devices;
  }
  if (refreshHistory) {
    cachedHistory = history;
  }
  if (refreshPermission) {
    cachedPermission = getMicrophonePermissionStatus();
  }
  cachedReview = activeReviewRecordingId
    ? {
        selectedRecordingId: activeReviewRecordingId,
        segments: reviewSegments,
        speakers: reviewSpeakers
      }
    : EMPTY_REVIEW_SNAPSHOT;
  return buildSnapshot();
};

const emitSnapshot = async (
  snapshot = buildSnapshot(),
  { force = false }: { force?: boolean } = {}
): Promise<void> => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (!force && !mainWindow.isVisible()) {
    return;
  }
  mainWindow.webContents.send("desktop:snapshot", snapshot);
};

const revealMainWindow = (): BrowserWindow => {
  mainWindow ??= createMainWindow(true);
  const windowRef = mainWindow;
  if (windowRef.isMinimized()) {
    windowRef.restore();
  }
  positionWindowForReveal(windowRef, getTrayBounds());
  if (process.platform === "darwin") {
    // Activate the app first so macOS brings it to the foreground.
    // Without this, the window may show but not receive focus when
    // the dock icon is hidden.
    isRevealing = true;
    app.show();
    windowRef.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    windowRef.show();
    windowRef.focus();
    windowRef.setVisibleOnAllWorkspaces(false);
    hideDockIcon();
    // Defer clearing the flag so the blur event triggered by
    // app.dock?.hide() is suppressed and the window stays visible.
    setTimeout(() => {
      isRevealing = false;
    }, 200);
  } else {
    windowRef.setVisibleOnAllWorkspaces(false);
    windowRef.show();
    windowRef.focus();
  }
  return windowRef;
};

const startRecording = async (): Promise<void> => {
  await startEngineRecording(engine);
};

const bootstrapDesktop = async (): Promise<void> => {
  if (app.isPackaged) {
    initializeMainLogger();
  }
  hideDockIcon();
  const settings = getSettings() ?? DEFAULT_SETTINGS;
  engine = new (isE2E ? TestDesktopEngine : DesktopEngine)((status) => {
    lastStatus = status;
    setTrayStatus(lastStatus);
    // During recording, audio-chunk status updates arrive very frequently.
    // Throttle renderer emissions to avoid IPC and React re-render overhead.
    if (lastStatus.recording) {
      scheduleSnapshotEmit();
    } else {
      void emitSnapshot(buildSnapshot(), { force: true });
    }
  });
  await engine.applySettings(settings);
  lastStatus = engine.getStatus();
  const shouldShow = isE2E;
  mainWindow = createMainWindow(shouldShow);
  cachedPermission = await ensureMicrophonePermission({
    activate: activateAppForPermissionPrompt,
    app,
    cachedPermission,
    hideDockIcon,
    isE2E,
    requestMicrophonePermission,
    revealMainWindow
  });
  await getSnapshot({
    refreshDevices: true,
    refreshHistory: true,
    refreshPermission: true
  });
  applyLoginItemSettings({
    app,
    enabled: settings.desktop.launchAtLogin,
    isE2E,
    setTrayLaunchAtLogin
  });
  applyTheme(settings.desktop.theme);
  if (process.env.EVE_SMOKE_TEST === "1") {
    mainWindow.webContents.once("did-finish-load", () => {
      void mainWindow?.webContents
        .executeJavaScript(
          "JSON.stringify({ eve: typeof window.eve, bootstrap: typeof window.eve?.bootstrap })"
        )
        .then((result) => {
          console.log(`[eve-smoke] bridge=${String(result)}`);
          app.quit();
        })
        .catch((error: unknown) => {
          console.error("[eve-smoke] renderer bridge check failed", error);
          app.exit(1);
        });
    });
  }
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    log.error("[eve] renderer failed to load", {
      errorCode,
      errorDescription,
      validatedURL
    });
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log.error("[eve] renderer process gone", details);
  });
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "F12") {
      mainWindow?.webContents.openDevTools({ mode: "detach" });
    }
  });
  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    mainWindow?.hide();
  });
  mainWindow.on("blur", () => {
    if (!isE2E && !isQuitting && !isWindowPinned && !isRevealing) {
      mainWindow?.hide();
    }
  });
  if (!isE2E) {
    initializeTray({
      iconPath: icon,
      onCheckForUpdates: checkForUpdates,
      onInstallUpdate: quitAndInstallUpdate,
      onOpen: () =>
        toggleMainWindow({
          emitSnapshot,
          getSnapshot,
          hideMainWindow: () => {
            mainWindow?.hide();
          },
          isMainWindowFocused: () => mainWindow?.isFocused() ?? false,
          isMainWindowVisible: () => mainWindow?.isVisible() ?? false,
          revealMainWindow
        }),
      onOpenDevTools: () => openRendererDevTools(revealMainWindow),
      onQuit: () => app.quit(),
      onStartRecording: () => {
        void startRecording()
          .catch((error) => {
            captureStartRecordingError({ engine, error });
          })
          .then(() => getSnapshot({ refreshHistory: true }).then(emitSnapshot));
      },
      onStopRecording: () => {
        void engine?.stopRecording().then(() => {
          installDownloadedUpdateIfReady();
          return getSnapshot({ refreshHistory: true }).then(emitSnapshot);
        });
      },
      onToggleLaunchAtLogin: () => {
        const nextSettings: AppSettings = {
          ...getSettings(),
          desktop: {
            ...getSettings().desktop,
            launchAtLogin: !getSettings().desktop.launchAtLogin
          }
        };
        setSettings(nextSettings);
        applyLoginItemSettings({
          app,
          enabled: nextSettings.desktop.launchAtLogin,
          isE2E,
          setTrayLaunchAtLogin
        });
        void emitSnapshot();
      }
    });
  }
  if (settings.desktop.startRecordingOnLaunch) {
    try {
      await startRecording();
    } catch (error) {
      captureStartRecordingError({ engine, error });
    }
  }
  if (!isE2E) {
    initializeAutoUpdates({
      deferInstallWhen: () => lastStatus.recording,
      onSnapshot: (snapshot) => {
        setTrayUpdaterState(snapshot);
        void emitSnapshot(buildSnapshot(), { force: true });
      }
    });
  }
};

registerDesktopIpcHandlers({
  applyWindowPinnedState: (pinned) => {
    applyWindowPinnedState({
      mainWindow,
      pinned,
      setPinned: (nextPinned) => {
        isWindowPinned = nextPinned;
      }
    });
  },
  buildSnapshot,
  captureError: (message) => {
    engine?.reportCaptureError(message);
  },
  emitSnapshot,
  getMainWindow: () => mainWindow,
  getSnapshot,
  openMicrophonePrivacySettings,
  loadReviewAudio: async (recordingId, segmentId) => {
    return reviewStore.loadSegmentAudioDataUrl(recordingId, segmentId);
  },
  pickDefaultPath: () => process.cwd(),
  pushAudioChunk: async (payload) => {
    await engine?.pushAudioChunk(payload);
  },
  requestMicrophonePermission: async () => {
    activateAppForPermissionPrompt({ app, revealMainWindow });
    const permission = isE2E
      ? cachedPermission
      : await requestMicrophonePermission().finally(() => {
          hideDockIcon();
        });
    cachedPermission = permission;
    return permission;
  },
  runTranscribe: async (inputDir) => {
    await engine?.runTranscribe(inputDir);
  },
  saveManualCorrection: async (recordingId, segmentId, transcript, sentenceCorrections) => {
    const updated = await reviewStore.saveManualCorrection(
      recordingId,
      segmentId,
      transcript,
      sentenceCorrections
    );
    const candidates = await reviewStore.deriveCandidates(updated);
    if (updated.speakerId) {
      for (const candidate of candidates) {
        await speakerProfileStore.upsertCandidate(updated.speakerId, candidate);
      }
    }
    return updated;
  },
  saveSettings: async (settings) => {
    const saved = setSettings(settings);
    applyLoginItemSettings({
      app,
      enabled: saved.desktop.launchAtLogin,
      isE2E,
      setTrayLaunchAtLogin
    });
    applyTheme(saved.desktop.theme);
    await engine?.applySettings(saved);
    return saved;
  },
  setPermission: (permission) => {
    cachedPermission = permission;
  },
  startRecording,
  stopRecording: async () => {
    await engine?.stopRecording();
    installDownloadedUpdateIfReady();
  },
  updateDevices: (devices) => {
    cachedDevices = devices;
    engine?.updateDevices(devices);
  },
  updateSpeakerProfile: async (profile) => {
    return speakerProfileStore.saveProfile(profile);
  }
});

if (!isE2E && !app.requestSingleInstanceLock()) {
  app.quit();
}

app.whenReady().then(async () => {
  try {
    app.setName("Eve Recorder");
    if (process.platform === "win32") {
      app.setAppUserModelId("build.nexmoe.everecorder.desktop");
    }
    await bootstrapDesktop();
  } catch (error) {
    console.error("[eve] failed to bootstrap desktop", error);
    app.exit(1);
  }
});

app.on("second-instance", () => {
  revealMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  isQuitting = true;
  if (!isE2E) {
    destroyTray();
    shutdownAutoUpdates();
  }
  if (isAutoUpdateInstalling()) {
    return;
  }
  if (quitAfterRecordingFinalize || !lastStatus.recording) {
    return;
  }
  event.preventDefault();
  quitAfterRecordingFinalize = true;
  void finalizeRecordingBeforeQuit({ engine, lastStatus })
    .catch((error) => {
      log.error("[eve] failed to finalize recording before quit", error);
    })
    .finally(() => {
      app.quit();
    });
});
