import { dialog, ipcMain, shell, type BrowserWindow, type OpenDialogOptions } from "electron";
import type {
  AppSettings,
  DesktopSnapshot,
  DeviceInfo,
  MicrophonePermissionStatus,
  SegmentRecord,
  SpeakerProfile
} from "@eve/shared";

interface SnapshotRequestOptions {
  refreshDevices?: boolean;
  refreshHistory?: boolean;
  refreshPermission?: boolean;
  reviewRecordingId?: string | null;
}

interface RegisterDesktopIpcOptions {
  applyWindowPinnedState: (pinned: boolean) => void;
  buildSnapshot: () => DesktopSnapshot;
  captureError: (message: string) => void;
  emitSnapshot: (snapshot?: DesktopSnapshot, options?: { force?: boolean }) => Promise<void>;
  getMainWindow: () => BrowserWindow | null;
  getSnapshot: (options?: SnapshotRequestOptions) => Promise<DesktopSnapshot>;
  openMicrophonePrivacySettings: () => Promise<boolean>;
  loadReviewAudio: (recordingId: string, segmentId: string) => Promise<string | null>;
  pickDefaultPath: () => string;
  pushAudioChunk: (payload: {
    deviceId: string;
    deviceLabel: string;
    rms: number;
    sampleRate: number;
    samples: Float32Array;
  }) => Promise<void>;
  requestMicrophonePermission: () => Promise<MicrophonePermissionStatus>;
  runTranscribe: (inputDir: string) => Promise<void>;
  saveManualCorrection: (
    recordingId: string,
    segmentId: string,
    transcript: string
  ) => Promise<SegmentRecord>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  updateDevices: (devices: DeviceInfo[]) => void;
  setPermission: (permission: MicrophonePermissionStatus) => void;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  updateSpeakerProfile: (profile: SpeakerProfile) => Promise<SpeakerProfile>;
}

export function registerDesktopIpcHandlers({
  applyWindowPinnedState,
  buildSnapshot,
  captureError,
  emitSnapshot,
  getMainWindow,
  getSnapshot,
  openMicrophonePrivacySettings,
  loadReviewAudio,
  pickDefaultPath,
  pushAudioChunk,
  requestMicrophonePermission,
  runTranscribe,
  saveManualCorrection,
  saveSettings,
  updateDevices,
  setPermission,
  startRecording,
  stopRecording,
  updateSpeakerProfile
}: RegisterDesktopIpcOptions): void {
  ipcMain.handle("desktop:get-snapshot", () =>
    getSnapshot({
      refreshDevices: true,
      refreshHistory: true,
      refreshPermission: true
    })
  );
  ipcMain.handle("desktop:pick-directory", async (_event, defaultPath?: string) => {
    const options: OpenDialogOptions = {
      defaultPath: defaultPath && defaultPath.trim().length > 0 ? defaultPath : pickDefaultPath(),
      properties: ["createDirectory", "openDirectory"]
    };
    const mainWindow = getMainWindow();
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("desktop:minimize-window", () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.minimize();
  });
  ipcMain.handle("desktop:close-window", () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.close();
  });
  ipcMain.handle("desktop:open-external", (_event, target: string) => shell.openExternal(target));
  ipcMain.handle("desktop:open-recording-folder", async (_event, target: string) => {
    await shell.openPath(target);
  });
  ipcMain.handle("desktop:request-permission", async () => {
    const permission = await requestMicrophonePermission();
    setPermission(permission);
    await emitSnapshot(buildSnapshot());
    return permission;
  });
  ipcMain.handle("desktop:save-settings", async (_event, settings: AppSettings) => {
    const saved = await saveSettings(settings);
    await emitSnapshot(
      await getSnapshot({
        refreshDevices: true,
        refreshHistory: true
      })
    );
    return saved;
  });
  ipcMain.handle("desktop:open-permission-settings", openMicrophonePrivacySettings);
  ipcMain.handle("desktop:start-recording", async () => {
    await startRecording();
    return getSnapshot({ refreshHistory: true });
  });
  ipcMain.handle("desktop:stop-recording", async () => {
    await stopRecording();
    return getSnapshot({ refreshHistory: true });
  });
  ipcMain.handle("desktop:run-transcribe", async (_event, inputDir: string) => {
    await runTranscribe(inputDir);
    return getSnapshot({ refreshHistory: true });
  });
  ipcMain.handle("desktop:open-review", async (_event, recordingId: string) => {
    return getSnapshot({ refreshHistory: true, reviewRecordingId: recordingId });
  });
  ipcMain.handle(
    "desktop:get-review-audio",
    async (_event, recordingId: string, segmentId: string) => {
      return loadReviewAudio(recordingId, segmentId);
    }
  );
  ipcMain.handle(
    "desktop:save-manual-correction",
    async (_event, recordingId: string, segmentId: string, transcript: string) => {
      await saveManualCorrection(recordingId, segmentId, transcript);
      return getSnapshot({ reviewRecordingId: recordingId });
    }
  );
  ipcMain.handle("desktop:update-speaker-profile", async (_event, profile: SpeakerProfile) => {
    await updateSpeakerProfile(profile);
    return getSnapshot();
  });
  ipcMain.handle("desktop:set-window-pinned", async (_event, pinned: boolean) => {
    applyWindowPinnedState(Boolean(pinned));
    const snapshot = buildSnapshot();
    await emitSnapshot(snapshot);
    return snapshot;
  });
  ipcMain.handle("desktop:update-devices", async (_event, devices: DeviceInfo[]) => {
    updateDevices(devices);
    const snapshot = buildSnapshot();
    await emitSnapshot(snapshot, { force: true });
    return snapshot;
  });
  ipcMain.handle("desktop:capture-error", async (_event, message: string) => {
    captureError(message);
    const snapshot = buildSnapshot();
    await emitSnapshot(snapshot, { force: true });
    return snapshot;
  });
  ipcMain.on(
    "desktop:audio-chunk",
    (_event, payload: {
      deviceId: string;
      deviceLabel: string;
      rms: number;
      sampleRate: number;
      samplesBuffer: ArrayBuffer;
      samplesLength: number;
    }) => {
      const { samplesBuffer, samplesLength, ...rest } = payload;
      const samples = new Float32Array(samplesBuffer, 0, samplesLength);
      void pushAudioChunk({ ...rest, samples });
    }
  );
}
