import log from "electron-log/main";
import type { App, BrowserWindow } from "electron";
import type {
  DesktopSnapshot,
  MicrophonePermissionStatus,
  RecorderStatusSnapshot
} from "@eve/shared";

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Failed to start recording.";

export const applyLoginItemSettings = ({
  app,
  enabled,
  isE2E,
  setTrayLaunchAtLogin
}: {
  app: App;
  enabled: boolean;
  isE2E: boolean;
  setTrayLaunchAtLogin: (enabled: boolean) => void;
}): void => {
  if (isE2E) {
    return;
  }
  if (!app.isPackaged) {
    log.info("[eve] skipped login item update in development");
    setTrayLaunchAtLogin(enabled);
    return;
  }
  try {
    app.setLoginItemSettings({
      enabled,
      openAsHidden: true
    });
  } catch (error) {
    log.warn("[eve] failed to update login item settings", error);
  }
  setTrayLaunchAtLogin(enabled);
};

export const captureStartRecordingError = ({
  engine,
  error
}: {
  engine: { reportCaptureError: (message: string) => void } | null;
  error: unknown;
}): void => {
  engine?.reportCaptureError(errorMessage(error));
};

export const finalizeRecordingBeforeQuit = async ({
  engine,
  lastStatus
}: {
  engine: { stopRecording: () => Promise<void> } | null;
  lastStatus: RecorderStatusSnapshot;
}): Promise<void> => {
  if (!engine || !lastStatus.recording) {
    return;
  }
  await engine.stopRecording();
};

export const ensureMicrophonePermission = async ({
  activate,
  app,
  cachedPermission,
  hideDockIcon,
  isE2E,
  requestMicrophonePermission,
  revealMainWindow
}: {
  activate: (options: { app: App; revealMainWindow: () => BrowserWindow }) => void;
  app: App;
  cachedPermission: MicrophonePermissionStatus;
  hideDockIcon: () => void;
  isE2E: boolean;
  requestMicrophonePermission: () => Promise<MicrophonePermissionStatus>;
  revealMainWindow: () => BrowserWindow;
}): Promise<MicrophonePermissionStatus> => {
  if (isE2E || process.platform !== "darwin") {
    return cachedPermission;
  }
  if (cachedPermission.state !== "not-determined") {
    return cachedPermission;
  }
  activate({ app, revealMainWindow });
  const nextPermission = await requestMicrophonePermission();
  hideDockIcon();
  return nextPermission;
};

export const openRendererDevTools = (
  revealMainWindow: () => BrowserWindow
): void => {
  revealMainWindow().webContents.openDevTools({ mode: "detach" });
};

export const activateAppForPermissionPrompt = ({
  app,
  revealMainWindow
}: {
  app: App;
  revealMainWindow: () => BrowserWindow;
}): void => {
  revealMainWindow();
  if (process.platform === "darwin") {
    app.focus({ steal: true });
  }
};

export const toggleMainWindow = ({
  emitSnapshot,
  getSnapshot,
  isMainWindowFocused,
  isMainWindowVisible,
  hideMainWindow,
  revealMainWindow
}: {
  emitSnapshot: (
    snapshot: DesktopSnapshot,
    options?: { force?: boolean }
  ) => Promise<void>;
  getSnapshot: (options: {
    refreshDevices: boolean;
    refreshHistory: boolean;
    refreshPermission: boolean;
  }) => Promise<DesktopSnapshot>;
  hideMainWindow: () => void;
  isMainWindowFocused: () => boolean;
  isMainWindowVisible: () => boolean;
  revealMainWindow: () => BrowserWindow;
}): void => {
  if (isMainWindowVisible() && isMainWindowFocused()) {
    hideMainWindow();
    return;
  }
  revealMainWindow();
  void getSnapshot({
    refreshDevices: true,
    refreshHistory: true,
    refreshPermission: true
  }).then((snapshot) => emitSnapshot(snapshot, { force: true }));
};

export const applyWindowPinnedState = ({
  mainWindow,
  pinned,
  setPinned
}: {
  mainWindow: BrowserWindow | null;
  pinned: boolean;
  setPinned: (pinned: boolean) => void;
}): void => {
  setPinned(pinned);
  mainWindow?.setAlwaysOnTop(pinned, pinned ? "floating" : "normal");
};

export const startEngineRecording = async (
  engine: { startRecording: () => Promise<void> } | null
): Promise<void> => {
  if (!engine) {
    throw new Error("Recorder engine is unavailable.");
  }
  await engine.startRecording();
};
