/**
 * Localhost debug landing chrome: FAB + full-screen setup overlay.
 * Only mount when `isLocalDebug()` is true upstream.
 */
import { DebugFab } from "./DebugFab.js";
import { DebugSetupPanel } from "./DebugSetupPanel.js";

export type DebugIntroChromeProps = {
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
  onEntered: (roomCode: string, playerId: string) => void;
  onApiError: (message: string) => void;
};

export default function DebugIntroChrome({
  panelOpen,
  onPanelOpenChange,
  onEntered,
  onApiError,
}: DebugIntroChromeProps) {
  return (
    <>
      <DebugFab onClick={() => onPanelOpenChange(true)} />
      {panelOpen && (
        <DebugSetupPanel
          onClose={() => onPanelOpenChange(false)}
          onEntered={onEntered}
          onError={onApiError}
        />
      )}
    </>
  );
}
