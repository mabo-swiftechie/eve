import { useEffect, useState } from "react";
import { useDesktopSnapshot, desktopActions } from "@/lib/desktop-store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusOverview } from "@/components/status-overview";
import { SettingsTabs } from "@/components/settings-tabs";
import { ToastViewport } from "@/components/ui/toast";
import { CaptureController } from "@/components/capture-controller";
import { HomeGithubStar } from "@/components/home-github-star";
import { WindowsWindowControls } from "@/components/windows-window-controls";
import { LiveStageView } from "@/components/live-stage-view";
import { ReviewLearn } from "@/components/review-learn";
import { createT } from "@/lib/i18n";

type AppMode = "home" | "live-stage" | "review";

export function App() {
  const snapshot = useDesktopSnapshot();
  const [sharedStream, setSharedStream] = useState<MediaStream | null>(null);
  const [mode, setMode] = useState<AppMode>("home");
  const t = createT(snapshot.settings.desktop.language);

  useEffect(() => {
    if (snapshot.review.selectedRecordingId) {
      setMode("review");
    }
  }, [snapshot.review.selectedRecordingId]);

  return (
    <main className="h-screen text-[color:var(--foreground)]">
      {/* Draggable title bar region for frameless window */}
      <div className="drag-region" />
      <ToastViewport />
      <CaptureController snapshot={snapshot} onStreamChange={setSharedStream} />
      <WindowsWindowControls snapshot={snapshot} />

      <ScrollArea className="h-screen w-full">
        <div className="tray-panel min-w-0 max-w-full overflow-x-hidden">
          <div className="panel-section space-y-4">
            <nav
              aria-label={t("viewModeLabel")}
              className="flex flex-wrap gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-2"
            >
              <ModeButton
                active={mode === "home"}
                label={t("viewModeHome")}
                onClick={() => setMode("home")}
              />
              <ModeButton
                active={mode === "live-stage"}
                label={t("stageModeTitle")}
                onClick={() => setMode("live-stage")}
              />
              <ModeButton
                active={mode === "review"}
                label={t("reviewModeTitle")}
                onClick={() => setMode("review")}
              />
            </nav>

            {mode === "home" ? (
              <>
                <div className="panel-section">
                  <StatusOverview
                    onTogglePinned={desktopActions.setWindowPinned}
                    onOpenPrivacy={desktopActions.openMicrophoneSettings}
                    onRequestPermission={desktopActions.requestPermission}
                    onStart={desktopActions.startRecording}
                    onStop={desktopActions.stopRecording}
                    sharedStream={sharedStream}
                    snapshot={snapshot}
                  />
                </div>
                <div className="panel-section">
                  <SettingsTabs snapshot={snapshot} />
                </div>
                <div className="panel-section">
                  <HomeGithubStar snapshot={snapshot} />
                </div>
              </>
            ) : null}

            {mode === "live-stage" ? (
              <LiveStageView snapshot={snapshot} />
            ) : null}

            {mode === "review" ? (
              <ReviewLearn
                actions={{
                  loadReviewAudio: desktopActions.loadReviewAudio,
                  saveManualCorrection: desktopActions.saveManualCorrection,
                  updateSpeakerProfile: desktopActions.updateSpeakerProfile
                }}
                snapshot={snapshot}
              />
            ) : null}
          </div>
        </div>
      </ScrollArea>
    </main>
  );
}

function ModeButton({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button size="sm" variant={active ? "subtle" : "ghost"} onClick={onClick}>
      {label}
    </Button>
  );
}
