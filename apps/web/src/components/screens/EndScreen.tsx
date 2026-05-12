import type { Dispatch, SetStateAction } from "react";
import { BtnSpinner } from "../BtnSpinner.js";
import { describeNightAction } from "../../lib/describeNightAction.js";
import { ROLE_DISPLAY, ROLE_LORE, RoleLoreContent } from "../../lib/roleStories.js";
import type { PlayerDoc, PublicLogEntry, RoomDoc } from "../../types.js";

type NightActionRow = Record<
  string,
  { role?: string; action?: string; targetId?: string | null; specialAction?: string | null }
>;

export type EndScreenProps = {
  room: RoomDoc;
  players: PlayerDoc[];
  publicLog: PublicLogEntry[];
  myRole: string | null;
  loreOpen: boolean;
  setLoreOpen: Dispatch<SetStateAction<boolean>>;
  allRoundVotes: Record<number, Record<string, string | null>>;
  allNightActions: Record<number, NightActionRow>;
  historyLoaded: boolean;
  isHost: boolean;
  anyPending: boolean;
  busy: (key: string) => boolean;
  run: (fnName: string, data: Record<string, unknown>, pendingKey?: string) => Promise<Record<string, unknown>>;
  roomCode: string;
};

export function EndScreen({
  room,
  players,
  publicLog,
  myRole,
  loreOpen,
  setLoreOpen,
  allRoundVotes,
  allNightActions,
  historyLoaded,
  isHost,
  anyPending,
  busy,
  run,
  roomCode,
}: EndScreenProps) {
  const winnerLabel =
    room.winner === "moradores"
      ? "Os moradores controlaram as criaturas"
      : room.winner === "criaturas"
        ? "As criaturas dominaram a cidade dos humanos"
        : room.winner === "bots"
          ? "Apocalipse Robô"
          : (() => {
              const wp = players.find((p) => p.id === room.winner);
              return wp ? `${wp.name} venceu` : "Fim de jogo";
            })();

  const revealed = room.revealedRoles ?? {};
  const SIDE_LABEL: Record<string, string> = {
    criatura: "criatura",
    morador: "morador",
    neutro: "neutro",
  };
  const SIDE_OF_ROLE: Record<string, string> = {
    lobisomem: "criatura",
    saci: "criatura",
    mula: "criatura",
    boto: "criatura",
    iara: "criatura",
    curupira: "neutro",
    doutor: "morador",
    mae_de_santo: "morador",
    geni: "morador",
    boitata: "neutro",
    cartomante: "morador",
    delegado: "morador",
    cangaceiro: "morador",
    padre: "morador",
    coronel: "morador",
    aldeao: "morador",
    bras_cubas: "neutro",
  };

  const totalRounds = Number(room.round ?? 1);
  const playerNameById: Record<string, string> = {};
  for (const p of players) {
    if (p.id) playerNameById[p.id] = p.name ?? p.id;
  }

  return (
    <div className="stack stack--dense">
      {myRole && ROLE_LORE[myRole] && (
        <div className="role-story-card">
          <button
            type="button"
            className="role-story-toggle"
            onClick={() => setLoreOpen((v) => !v)}
          >
            <span>História — {ROLE_DISPLAY[myRole] ?? myRole}</span>
            <span className="role-story-chevron">{loreOpen ? "▲" : "▼"}</span>
          </button>
          {loreOpen && (
            <div className="role-story-body">
              <p className="role-story-location">Bucaré do Sertão, 1922.</p>
              <RoleLoreContent lore={ROLE_LORE[myRole]} />
            </div>
          )}
        </div>
      )}
      <div className="game-card ended-card">
        <p className="ended-label">Fim de jogo</p>
        <p className="ended-winner">{winnerLabel}</p>
        {isHost && (
          <button
            type="button"
            className="primary-btn"
            disabled={anyPending}
            style={{ marginTop: "1rem" }}
            onClick={() => run("restartGame", { roomCode }, "restartGame")}
          >
            <div className="btn-stack">
              <span className="btn-title btn-title-row">
                {busy("restartGame") ? "reiniciando…" : "Recomeçar"}
                <BtnSpinner show={busy("restartGame")} />
              </span>
              <span className="btn-sub">volta ao lobby com os mesmos jogadores</span>
            </div>
            <span className="btn-arrow" aria-hidden>
              →
            </span>
          </button>
        )}
      </div>

      <div className="game-card log-card">
        <strong>Revelação final</strong>
        {players.map((p) => {
          const role = revealed[p.id ?? ""];
          const roleName = role ? (ROLE_DISPLAY[role] ?? role) : "?";
          const side = role ? SIDE_OF_ROLE[role] : null;
          const align =
            p.alignment === "moradores" || p.alignment === "criaturas" ? p.alignment : null;
          const showAlign = side === "neutro" && role !== "bras_cubas" && align;
          return (
            <p key={p.id}>
              <strong>{p.name}</strong>
              {" — "}
              {roleName}
              {side && <span className="muted"> ({SIDE_LABEL[side] ?? side})</span>}
              {showAlign && (
                <span className="muted"> · alinhamento na crônica: {align}</span>
              )}
              {(p.alive === false || p.eliminated || p.expelled) && <span className="muted"> · eliminado</span>}
            </p>
          );
        })}
      </div>

      <div className="game-card log-card chronicle-card">
        <strong className="chronicle-title">Crônica da partida</strong>
        {!historyLoaded ? (
          <p className="muted">Carregando histórico…</p>
        ) : (
          Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => {
            const nightActions = allNightActions[r] ?? {};
            const roundVotes = allRoundVotes[r] ?? {};
            const nightPublicEntries = publicLog.filter(
              (e) => e.round === r && ["death", "bite", "terror", "invocation", "special"].includes(e.type ?? ""),
            );
            const dayPublicEntries = publicLog.filter((e) => e.round === r && e.type === "expulsion");
            const hasVotes = Object.keys(roundVotes).length > 0;
            const actionLines = Object.entries(nightActions).flatMap(([pid, act]) => {
              if (
                !act?.targetId &&
                !(act.role === "cangaceiro" && act.action === "pass")
              ) {
                return [];
              }
              const actorName = playerNameById[pid] ?? pid;
              const targetName = act.targetId
                ? (playerNameById[act.targetId] ?? act.targetId)
                : "";
              const desc = describeNightAction(
                actorName,
                act.role ?? "",
                act.action ?? "",
                targetName,
                act.specialAction,
              );
              if (!desc) return [];
              return [{ pid, role: act.role ?? "", desc }];
            });

            return (
              <div key={r} className="chronicle-round">
                <p className="chronicle-phase">Noite {r}</p>
                {actionLines.length === 0 && nightPublicEntries.length === 0 && (
                  <p className="muted chronicle-line">Sem registros.</p>
                )}
                {actionLines.map(({ pid, role, desc }) => (
                  <p key={pid} className="chronicle-line">
                    <span className="chronicle-role">{ROLE_DISPLAY[role] ?? role}</span>
                    {" · "}
                    {desc}
                  </p>
                ))}
                {nightPublicEntries.map((e) => (
                  <p key={e.id} className="chronicle-outcome">
                    {e.message}
                  </p>
                ))}
                {hasVotes && (
                  <>
                    <p className="chronicle-phase">Dia {r}</p>
                    {Object.entries(roundVotes).map(([voterId, targetId]) => {
                      const voterName = playerNameById[voterId] ?? voterId;
                      const targetName = targetId ? (playerNameById[targetId] ?? targetId) : "voto nulo";
                      return (
                        <p key={voterId} className="chronicle-line">
                          {voterName} <span className="chronicle-arrow">→</span> {targetName}
                        </p>
                      );
                    })}
                    {dayPublicEntries.map((e) => (
                      <p key={e.id} className="chronicle-outcome">
                        {e.message}
                      </p>
                    ))}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
