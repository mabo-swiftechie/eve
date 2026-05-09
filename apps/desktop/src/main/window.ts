import { app, BrowserWindow, nativeImage, screen } from "electron";
import { join } from "node:path";
import { getPreferredWindowSize, WINDOW_SIZE_LIMITS } from "./window-layout";

const WINDOW_TITLE = "Eve Recorder";
const WINDOW_ICON_PATH = join(import.meta.dirname, "../../resources/icon.png");
const WINDOW_EDGE_MARGIN = 12;

export const createMainWindow = (showOnReady: boolean): BrowserWindow => {
  const isMac = process.platform === "darwin";
  const useGlassWindow = isMac;
  const { workAreaSize } = screen.getPrimaryDisplay();
  const preferredSize = getPreferredWindowSize(workAreaSize);

  const windowRef = new BrowserWindow({
    width: preferredSize.width,
    height: preferredSize.height,
    minWidth: WINDOW_SIZE_LIMITS.minWidth,
    minHeight: WINDOW_SIZE_LIMITS.minHeight,
    resizable: true,
    frame: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 14, y: 14 },
    transparent: useGlassWindow,
    show: false,
    skipTaskbar: false,
    title: WINDOW_TITLE,
    ...(isMac ? {} : { icon: nativeImage.createFromPath(WINDOW_ICON_PATH) }),
    // macOS: native vibrancy — "popover" matches system widget panels
    ...(useGlassWindow
      ? {
          vibrancy: "popover" as const,
          visualEffectState: "active"
        }
      : !isMac
        ? {
          // Windows 11: acrylic material for frosted glass
          backgroundMaterial: "acrylic" as const
        }
        : {}
    ),
    backgroundColor: useGlassWindow
      ? "#00000000"
      : isMac
        ? "#f6f7f9"
        : "#ffffff",
    hasShadow: true,
    roundedCorners: true,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      sandbox: false
    }
  });

  windowRef.on("ready-to-show", () => {
    if (showOnReady) {
      windowRef.show();
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void windowRef.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void windowRef.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
  return windowRef;
};

export const positionWindowForReveal = (
  windowRef: BrowserWindow,
  trayBounds: Electron.Rectangle | null
): void => {
  if (process.platform === "win32") {
    windowRef.center();
    return;
  }
  positionNearTray(windowRef, trayBounds);
};

/**
 * Position the window centered horizontally below the tray icon.
 * Falls back to top-right of primary display if tray bounds unavailable.
 */
export const positionNearTray = (
  windowRef: BrowserWindow,
  trayBounds: Electron.Rectangle | null
): void => {
  const [winWidth, winHeight] = windowRef.getSize();
  const trayCenter = trayBounds
    ? { x: trayBounds.x + Math.round(trayBounds.width / 2), y: trayBounds.y + trayBounds.height }
    : null;
  const display = trayCenter
    ? screen.getDisplayNearestPoint(trayCenter)
    : screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight, x: screenX, y: screenY } = display.workArea;

  if (trayBounds && trayBounds.width > 0) {
    const x = Math.round((trayCenter?.x ?? trayBounds.x) - winWidth / 2);
    const y = trayBounds.y + trayBounds.height + 4;
    const clampedX = Math.max(
      screenX + WINDOW_EDGE_MARGIN,
      Math.min(x, screenX + screenWidth - winWidth - WINDOW_EDGE_MARGIN)
    );
    const clampedY = Math.max(
      screenY + 4,
      Math.min(y, screenY + screenHeight - winHeight - WINDOW_EDGE_MARGIN)
    );
    windowRef.setPosition(clampedX, clampedY, false);
  } else {
    windowRef.setPosition(
      screenX + screenWidth - winWidth - WINDOW_EDGE_MARGIN,
      screenY + 4,
      false
    );
  }
};
