/**
 * Fixed bar: fase atual, placar sintético de vitória coletiva, papéis (localhost debug).
 */
import type { RoleId } from "folclore-game-engine";
import type { PlayerDoc, RoomDoc } from "../types.js";
import type { SecretDoc } from "../hooks/useAllSecrets.js";
import { computeWinStatusUi, snapshotsFromPlayersAndSecrets } from "./computeWinStatus.js";
import { DEBUG_ROLE_LABELS } from "./roleOptions.js";

type Props = {
  room: RoomDoc;
  players: PlayerDoc[];
  secrets: Record<string, SecretDoc>;
};

export function DebugToolbar({ room, players, secrets }: Props) {
  const snaps = snapshotsFromPlayersAndSecrets(players.filter((p): p is PlayerDoc & { id: string } => !!p.id), secrets);
  const win = computeWinStatusUi(
    snaps,
    Number(room.round ?? 1),
    Number(room.maxRounds ?? 0),
    Number(room.gameTablePlayerCount ?? players.length),
  );

  const roleLabel = (id: string) => {
    const r = secrets[id]?.role as RoleId | undefined;
    return r ? (DEBUG_ROLE_LABELS[r] ?? r) : "…";
  };

  const phaseLabel =
    room.status === "night"
      ? "noite"
      : room.status === "day"
        ? "dia"
        : room.status === "ended"
          ? "fim"
          : String(room.status ?? "?");

  return (
    <header className="debug-toolbar">
      <div className="debug-toolbar-block">
        <strong>Debug</strong>
        <span className="muted">·</span>
        <span>
          {phaseLabel} · r{room.round ?? 1}
        </span>
        {room.currentActorRole && (
          <>
            <span className="muted">· noite:</span>
            <code>{room.currentActorRole}</code>
          </>
        )}
      </div>
      <div className="debug-toolbar-block debug-toolbar-score">
        Criaturas: {win.creatureCount} | Moradores: {win.moradorCount}
        <span className="muted"> — {win.detailLabel}</span>
        {room.debugForceMoonPhase && (
          <span className="muted"> · lua:{String(room.debugForceMoonPhase)}</span>
        )}
      </div>
      <div className="debug-toolbar-players">
        {players.map((p) => (
          <span key={p.id} className="debug-toolbar-pill">
            {p.name}
            <span className="debug-toolbar-role">{p.id ? roleLabel(p.id!) : "?"}</span>
          </span>
        ))}
      </div>
    </header>
  );
}
