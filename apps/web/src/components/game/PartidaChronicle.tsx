import { describeNightAction } from "../../lib/describeNightAction.js";
import { individualWinChronicleLine } from "../../lib/individualWinLabels.js";
import { ROLE_DISPLAY } from "../../lib/roleStories.js";
import type { PlayerDoc, PublicLogEntry, RoomDoc } from "../../types.js";

/** Entradas `special` que pertencem à fase da noite / abertura (não ao cordel do dia). */
function isNightPublicSpecial(e: PublicLogEntry): boolean {
  const m = String(e.message ?? "");
  return m.startsWith("Alinhamento (1ª noite):") || m.includes("Mesa de cinco: por regra do cordel");
}

function dedupeChronicleEndEntries(entries: PublicLogEntry[]): PublicLogEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = String(e.message ?? "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type NightActionRow = Record<
  string,
  { role?: string; action?: string; targetId?: string | null; specialAction?: string | null }
>;

export type PartidaChronicleProps = {
  room: RoomDoc;
  players: PlayerDoc[];
  publicLog: PublicLogEntry[];
  allRoundVotes: Record<number, Record<string, string | null>>;
  allRoundBotVoteReasons: Record<number, Record<string, string>>;
  allNightActions: Record<number, NightActionRow>;
  historyLoaded: boolean;
  compact?: boolean;
};

const BOT_VOTE_REASON_PT: Record<string, string> = {
  confirmed: "alvo confirmado / forçado pelo debug",
  suspected: "lista de suspeitas",
  traitor: "reagir a quem votou no bot",
  random: "palpite / oposto provável",
  self_defense: "defesa",
  chaos: "caos (Sací)",
  bras_troll: "caos (Brás)",
};

/** Crônica completa da partida — todos os movimentos por rodada (preservada da tela antiga). */
export function PartidaChronicle({
  room,
  players,
  publicLog,
  allRoundVotes,
  allRoundBotVoteReasons,
  allNightActions,
  historyLoaded,
  compact = false,
}: PartidaChronicleProps) {
  const revealed = room.revealedRoles ?? {};
  const totalRounds = Number(room.round ?? 1);
  const playerNameById: Record<string, string> = {};
  for (const p of players) {
    if (p.id) playerNameById[p.id] = p.name ?? p.id;
  }

  const individualWins = Array.isArray(room.individualWins) ? [...room.individualWins] : [];
  individualWins.sort((a, b) => a.round - b.round || a.timestamp - b.timestamp);

  const lineClass = compact ? "fim-cronica-line" : "chronicle-line";
  const phaseClass = compact ? "fim-cronica-phase" : "chronicle-phase";
  const outcomeClass = compact ? "fim-cronica-outcome" : "chronicle-outcome";

  return (
    <div className={compact ? "fim-cronica-body" : undefined}>
      {!historyLoaded ? (
        <p className="muted">Carregando histórico…</p>
      ) : (
        Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => {
          const nightActions = allNightActions[r] ?? {};
          const roundVotes = allRoundVotes[r] ?? {};
          const botReasonsThisRound = room.debug === true ? allRoundBotVoteReasons[r] ?? {} : {};
          const nightPublicEntries = publicLog.filter((e) => {
            if (e.round !== r) return false;
            const t = e.type ?? "";
            if (["death", "bite", "terror", "invocation", "dawn"].includes(t)) return true;
            return t === "special" && isNightPublicSpecial(e);
          });
          const dayChronicleOutcomes = publicLog.filter((e) => {
            if (e.round !== r) return false;
            const t = e.type ?? "";
            if (t === "expulsion") return true;
            return t === "special" && !isNightPublicSpecial(e);
          });
          const roundChronicleEnd = dedupeChronicleEndEntries(
            publicLog.filter((e) => e.round === r && e.type === "chronicle_end"),
          );
          const neutralAlignExplain = players.filter((p) => {
            const role = revealed[p.id ?? ""];
            const al = p.alignment === "moradores" || p.alignment === "criaturas" ? p.alignment : null;
            return (role === "curupira" || role === "boitata") && al;
          });
          const hasVotes = Object.keys(roundVotes).length > 0;
          const votesVoidedThisRound = Number(room.voidedDayExpulsionRound ?? NaN) === r;
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
            const targetName = act.targetId ? (playerNameById[act.targetId] ?? act.targetId) : "";
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
            <div key={r} className={compact ? "fim-cronica-round" : "chronicle-round"}>
              <p className={phaseClass}>Noite {r}</p>
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
                      <p key={p.id} className={`${lineClass} chronicle-align-prologue`}>
                        <strong>{p.name}</strong> ({ROLE_DISPLAY[role] ?? role}, neutro) alinhou-se aos{" "}
                        <strong>{lado}</strong> na primeira noite. Na vitória coletiva, passa a contar nesse
                        time ao comparar quantos jogadores vivos restam de cada lado (criaturas + neutros do
                        folclore vs. moradores + neutros da comunidade).
                      </p>
                    );
                  })}
              {actionLines.length === 0 && nightPublicEntries.length === 0 && neutralAlignExplain.length === 0 && (
                <p className={`muted ${lineClass}`}>Sem registros.</p>
              )}
              {actionLines.map(({ pid, role, desc }) => (
                <p key={pid} className={lineClass}>
                  <span className="chronicle-role">{ROLE_DISPLAY[role] ?? role}</span>
                  {" · "}
                  {desc}
                </p>
              ))}
              {nightPublicEntries.map((e) => (
                <p key={e.id} className={outcomeClass}>
                  {e.message}
                </p>
              ))}
              {hasVotes && (
                <>
                  <p className={phaseClass}>Dia {r}</p>
                  {Object.entries(roundVotes).map(([voterId, targetId]) => {
                    const voterName = playerNameById[voterId] ?? voterId;
                    const targetName = targetId ? (playerNameById[targetId] ?? targetId) : "voto nulo";
                    return (
                      <p
                        key={voterId}
                        className={
                          votesVoidedThisRound
                            ? `${lineClass} chronicle-votes-voided`
                            : lineClass
                        }
                      >
                        {voterName} <span className="chronicle-arrow">→</span> {targetName}
                        {room.debug &&
                          players.find((p) => p.id === voterId)?.isBot &&
                          botReasonsThisRound[voterId] && (
                            <span className="muted" style={{ display: "block", fontSize: "0.85em" }}>
                              Bot {voterName} — razão do voto:{" "}
                              {BOT_VOTE_REASON_PT[botReasonsThisRound[voterId] ?? ""] ??
                                botReasonsThisRound[voterId]}
                            </span>
                          )}
                      </p>
                    );
                  })}
                  {dayChronicleOutcomes.map((e) => (
                    <p key={e.id} className={outcomeClass}>
                      {e.message}
                    </p>
                  ))}
                </>
              )}
              {roundChronicleEnd.map((e) => (
                <p key={e.id} className={`${outcomeClass} chronicle-end-rule`}>
                  {e.message}
                </p>
              ))}
            </div>
          );
        })
      )}

      <p className={phaseClass} style={{ marginTop: compact ? 12 : 16 }}>
        Objetivos individuais
      </p>
      {individualWins.length === 0 ? (
        <p className={`muted ${lineClass}`}>Nenhum objetivo individual foi registrado nesta partida.</p>
      ) : (
        individualWins.map((w, idx) => (
          <p
            key={`${w.playerId}-${w.type}-${w.round}-${idx}`}
            className={`${lineClass} chronicle-individual-win`}
          >
            {individualWinChronicleLine(w, playerNameById[w.playerId] ?? w.playerId)}
          </p>
        ))
      )}
    </div>
  );
}
