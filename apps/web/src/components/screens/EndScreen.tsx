import type { Dispatch, SetStateAction } from "react";
import { BtnSpinner } from "../BtnSpinner.js";
import { describeNightAction } from "../../lib/describeNightAction.js";
import { individualWinChronicleLine } from "../../lib/individualWinLabels.js";
import { ROLE_DISPLAY, ROLE_LORE, RoleLoreContent } from "../../lib/roleStories.js";
import { useGameSummary } from "../../hooks/useGameSummary.js";
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
  const gameId = typeof room.lastGameHistoryId === "string" ? room.lastGameHistoryId : undefined;
  const { summary, loaded: summaryLoaded } = useGameSummary(gameId);

  const moradoresPlazaTie =
    room.winner === "moradores" && room.collectiveEndKind === "moradores_plaza_tie";
  const MORADORES_PLAZA_TIE_COPY =
    "A cidade segurou o fôlego. O folclore e os moradores ficaram frente a frente na praça da Bucaré — iguais em número, iguais em determinação. No empate, a cidade resiste. Os moradores venceram.";

  const winnerLabel =
    moradoresPlazaTie
      ? "Os moradores venceram"
      : room.winner === "moradores"
      ? "Os moradores controlaram as criaturas"
      : room.winner === "criaturas"
        ? "As criaturas dominaram a cidade dos humanos"
        : room.winner === "bots"
          ? "🤖 Apocalipse Robô 🤖"
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

  const individualWins = Array.isArray(room.individualWins) ? [...room.individualWins] : [];
  individualWins.sort((a, b) => a.round - b.round || a.timestamp - b.timestamp);

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
        {moradoresPlazaTie && (
          <p className="muted" style={{ marginTop: 10, whiteSpace: "pre-line", lineHeight: 1.45 }}>
            {MORADORES_PLAZA_TIE_COPY}
          </p>
        )}
        {isHost && (
          <button
            type="button"
            className="primary-btn"
            disabled={anyPending}
            style={{ marginTop: "1rem" }}
            onClick={() => void run("restartGame", { roomCode }, "restartGame").catch(() => {})}
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
            const roundChronicleEnd = publicLog.filter((e) => e.round === r && e.type === "chronicle_end");
            const neutralAlignExplain = players.filter((p) => {
              const role = revealed[p.id ?? ""];
              const al = p.alignment === "moradores" || p.alignment === "criaturas" ? p.alignment : null;
              return (role === "curupira" || role === "boitata") && al;
            });
            const hasVotes = Object.keys(roundVotes).length > 0;
            const actionLines = Object.entries(nightActions).flatMap(([pid, act]) => {
              if (
                !act?.targetId &&
                !(act.role === "cangaceiro" && act.action === "pass") &&
                !(act.role === "delegado" && act.action === "pass") &&
                !(
                  ["cartomante", "boitata", "geni", "doutor", "mae_de_santo"].includes(String(act.role)) &&
                  act.action === "pass"
                )
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
                {r === 1 &&
                  neutralAlignExplain
                    .filter((p) => {
                      if (Number(room.gameTablePlayerCount ?? 0) !== 5) return true;
                      const role = revealed[p.id ?? ""];
                      return role !== "curupira" && role !== "boitata";
                    })
                    .map((p) => {
                    const role = revealed[p.id ?? ""];
                    const al =
                      p.alignment === "moradores" || p.alignment === "criaturas" ? p.alignment : null;
                    if (!role || !al) return null;
                    const lado =
                      al === "moradores"
                        ? "moradores (comunidade da cidade)"
                        : "criaturas (folclore)";
                    return (
                      <p key={p.id} className="chronicle-line chronicle-align-prologue">
                        <strong>{p.name}</strong> ({ROLE_DISPLAY[role] ?? role}, neutro) alinhou-se aos{" "}
                        <strong>{lado}</strong> na primeira noite. Na vitória coletiva, passa a contar nesse
                        time ao comparar quantos jogadores vivos restam de cada lado (criaturas + neutros do
                        folclore vs. moradores + neutros da comunidade).
                      </p>
                    );
                  })}
                {actionLines.length === 0 && nightPublicEntries.length === 0 && neutralAlignExplain.length === 0 && (
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
                {roundChronicleEnd.map((e) => (
                  <p key={e.id} className="chronicle-outcome chronicle-end-rule">
                    {e.message}
                  </p>
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="game-card log-card chronicle-card">
        <strong className="chronicle-title">Objetivos individuais</strong>
        {individualWins.length === 0 ? (
          <p className="muted chronicle-line">Nenhum objetivo individual foi registrado nesta partida.</p>
        ) : (
          individualWins.map((w, idx) => (
            <p key={`${w.playerId}-${w.type}-${w.round}-${idx}`} className="chronicle-line chronicle-individual-win">
              {individualWinChronicleLine(w, playerNameById[w.playerId] ?? w.playerId)}
            </p>
          ))
        )}
      </div>

      <div className="game-card log-card chronicle-card mvp-podium-card">
        <strong className="chronicle-title">Pódio da noite</strong>
        {!summaryLoaded ? (
          <p className="muted chronicle-line">Carregando pontuação…</p>
        ) : !summary?.players?.length ? (
          <p className="muted chronicle-line">Resumo de pontos ainda não disponível.</p>
        ) : (
          <>
            <div className="podium-visual">
              {[1, 0, 2].map((slot) => {
                const ordered = [...summary.players!].sort((a, b) => a.rank - b.rank);
                const row = ordered[slot];
                if (!row) return <div key={slot} className="podium-slot podium-slot--empty" />;
                const h = slot === 0 ? "1º" : slot === 1 ? "2º" : "3º";
                return (
                  <div key={row.playerId} className={`podium-slot podium-slot--${slot}`}>
                    <span className="podium-rank">{h}</span>
                    <span className="podium-name">{row.displayName}</span>
                    <span className="podium-role muted">{ROLE_DISPLAY[row.role] ?? row.role}</span>
                    <span className="podium-pts">{row.points} pts</span>
                  </div>
                );
              })}
            </div>
            <table className="mvp-table" style={{ marginTop: "1rem" }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Jogador</th>
                  <th>Papel</th>
                  <th>Pts</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {[...summary.players].sort((a, b) => a.rank - b.rank).map((row) => (
                  <tr key={row.playerId}>
                    <td>{row.rank}</td>
                    <td>{row.displayName}</td>
                    <td>{ROLE_DISPLAY[row.role] ?? row.role}</td>
                    <td>{row.points}</td>
                    <td>
                      <details>
                        <summary className="mvp-details-summary">ver</summary>
                        <div className="mvp-breakdown muted">
                          Suspeitas corretas: {row.breakdown.suspicion} pts · Votos no inimigo:{" "}
                          {row.breakdown.voteEnemy} pts · Bônus expulsão: {row.breakdown.voteExpelledBonus} pts ·
                          Investigação: {row.breakdown.investigation} pts · Objetivo cumprido:{" "}
                          {row.breakdown.objective} pts · Sobrevivência: {row.breakdown.survival} pts · Brás (rodada):{" "}
                          {row.breakdown.brasRoundTease} pts
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted chronicle-line" style={{ marginTop: "0.75rem" }}>
              Estes pontos foram adicionados ao seu perfil (ranking global).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
