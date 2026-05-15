/**
 * In-game localhost debug overlay: toolbar + collapsible sidebar.
 */
import type { PlayerDoc, RoomDoc } from "../types.js";
import type { SecretDoc } from "../hooks/useAllSecrets.js";
import { DebugActionsPanel } from "./DebugActionsPanel.js";
import { DebugToolbar } from "./DebugToolbar.js";

export type DebugGameChromeProps = {
  roomCode: string;
  room: RoomDoc;
  players: PlayerDoc[];
  secrets: Record<string, SecretDoc>;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  onCallableError: (m: string) => void;
};

export default function DebugGameChrome({
  roomCode,
  room,
  players,
  secrets,
  sidebarOpen,
  onSidebarToggle,
  onCallableError,
}: DebugGameChromeProps) {
  return (
    <>
      <DebugToolbar room={room} players={players} secrets={secrets} />
      <DebugActionsPanel
        roomCode={roomCode}
        players={players}
        open={sidebarOpen}
        onToggle={onSidebarToggle}
        onError={onCallableError}
      />
    </>
  );
}
