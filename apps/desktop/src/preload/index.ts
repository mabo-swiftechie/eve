import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  DesktopSnapshot,
  DeviceInfo,
  MicrophonePermissionStatus,
  SpeakerProfile
} from "@eve/shared";

export interface DesktopBridgeApi {
  bootstrap: () => Promise<DesktopSnapshot>;
  captureError: (message: string) => Promise<DesktopSnapshot>;
  closeWindow: () => Promise<void>;
  getReviewAudio: (recordingId: string, segmentId: string) => Promise<string | null>;
  minimizeWindow: () => Promise<void>;
  openReview: (recordingId: string) => Promise<DesktopSnapshot>;
  pushAudioChunk: (payload: {
    deviceId: string;
    deviceLabel: string;
    rms: number;
    sampleRate: number;
    samples: Float32Array;
  }) => void;
  openRecordingFolder: (target: string) => Promise<void>;
  pickDirectory: (defaultPath?: string) => Promise<string | null>;
  onSnapshot: (listener: (snapshot: DesktopSnapshot) => void) => () => void;
  openExternal: (target: string) => Promise<void>;
  openMicrophoneSettings: () => Promise<boolean>;
  requestMicrophonePermission: () => Promise<MicrophonePermissionStatus>;
  runTranscribe: (inputDir: string) => Promise<DesktopSnapshot>;
  saveManualCorrection: (
    recordingId: string,
    segmentId: string,
    transcript: string
  ) => Promise<DesktopSnapshot>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  setWindowPinned: (pinned: boolean) => Promise<DesktopSnapshot>;
  startRecording: () => Promise<DesktopSnapshot>;
  stopRecording: () => Promise<DesktopSnapshot>;
  updateSpeakerProfile: (profile: SpeakerProfile) => Promise<DesktopSnapshot>;
  updateDevices: (devices: DeviceInfo[]) => Promise<DesktopSnapshot>;
}

const api: DesktopBridgeApi = {
  bootstrap: () => ipcRenderer.invoke("desktop:get-snapshot"),
  captureError: (message) => ipcRenderer.invoke("desktop:capture-error", message),
  closeWindow: () => ipcRenderer.invoke("desktop:close-window"),
  getReviewAudio: (recordingId, segmentId) =>
    ipcRenderer.invoke("desktop:get-review-audio", recordingId, segmentId),
  minimizeWindow: () => ipcRenderer.invoke("desktop:minimize-window"),
  openReview: (recordingId) => ipcRenderer.invoke("desktop:open-review", recordingId),
  pushAudioChunk: ({ samples, ...payload }) => {
    // Pass the underlying ArrayBuffer + byteOffset/length so Electron's
    // structured-clone transfers binary data instead of serialising to a
    // plain number[].  This cuts per-chunk IPC memory roughly in half and
    // avoids creating a temporary Array of boxed Numbers.
    ipcRenderer.send("desktop:audio-chunk", {
      ...payload,
      samplesBuffer: samples.buffer.slice(
        samples.byteOffset,
        samples.byteOffset + samples.byteLength
      ),
      samplesLength: samples.length
    });
  },
  openRecordingFolder: (target) => ipcRenderer.invoke("desktop:open-recording-folder", target),
  pickDirectory: (defaultPath) => ipcRenderer.invoke("desktop:pick-directory", defaultPath),
  onSnapshot: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, snapshot: DesktopSnapshot) => {
      listener(snapshot);
    };
    ipcRenderer.on("desktop:snapshot", wrappedListener);
    return () => {
      ipcRenderer.removeListener("desktop:snapshot", wrappedListener);
    };
  },
  openExternal: (target) => ipcRenderer.invoke("desktop:open-external", target),
  openMicrophoneSettings: () => ipcRenderer.invoke("desktop:open-permission-settings"),
  requestMicrophonePermission: () => ipcRenderer.invoke("desktop:request-permission"),
  runTranscribe: (inputDir) => ipcRenderer.invoke("desktop:run-transcribe", inputDir),
  saveManualCorrection: (recordingId, segmentId, transcript) =>
    ipcRenderer.invoke("desktop:save-manual-correction", recordingId, segmentId, transcript),
  saveSettings: (settings) => ipcRenderer.invoke("desktop:save-settings", settings),
  setWindowPinned: (pinned) => ipcRenderer.invoke("desktop:set-window-pinned", pinned),
  startRecording: () => ipcRenderer.invoke("desktop:start-recording"),
  stopRecording: () => ipcRenderer.invoke("desktop:stop-recording"),
  updateSpeakerProfile: (profile) => ipcRenderer.invoke("desktop:update-speaker-profile", profile),
  updateDevices: (devices) => ipcRenderer.invoke("desktop:update-devices", devices)
};

contextBridge.exposeInMainWorld("eve", api);
