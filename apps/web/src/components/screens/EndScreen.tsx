import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { BtnSpinner } from "../BtnSpinner.js";
import { FolhetimEdition } from "../FolhetimEdition.js";
import { PartidaChronicle } from "../game/PartidaChronicle.js";
import { buildEndManchete } from "../../lib/endGameManchete.js";
import { stablePlayerGlyph } from "../../lib/playerGlyph.js";
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
  playerId: string;
  selfGlyph: string;
  publicLog: PublicLogEntry[];
  myRole: string | null;
  loreOpen: boolean;
  setLoreOpen: Dispatch<SetStateAction<boolean>>;
  allRoundVotes: Record<number, Record<string, string | null>>;
  allRoundBotVoteReasons: Record<number, Record<string, string>>;
  allNightActions: Record<number, NightActionRow>;
  historyLoaded: boolean;
  isHost: boolean;
  anyPending: boolean;
  busy: (key: string) => boolean;
  run: (fnName: string, data: Record<string, unknown>, pendingKey?: string) => Promise<Record<string, unknown>>;
  roomCode: string;
};

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

const ROMAN = ["I", "II", "III"] as const;

function EndPagesNav({
  page,
  onPrev,
  onNext,
}: {
  page: 0 | 1 | 2;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <footer className="fim-pages-footer">
      <nav className="pages-nav" aria-label="Navegação da edição final">
        <button type="button" className="pages-nav__btn" disabled={page === 0} onClick={onPrev}>
          ← anterior
        </button>
        <div className="pages-dots" aria-hidden>
          {([0, 1, 2] as const).map((i) => (
            <span key={i} className={`pages-dot${page === i ? " pages-dot--on" : ""}`} />
          ))}
        </div>
        <button type="button" className="pages-nav__btn" disabled={page === 2} onClick={onNext}>
          próxima →
        </button>
      </nav>
    </footer>
  );
}

export function EndScreen({
  room,
  players,
  playerId,
  selfGlyph,
  publicLog,
  myRole,
  loreOpen,
  setLoreOpen,
  allRoundVotes,
  allRoundBotVoteReasons,
  allNightActions,
  historyLoaded,
  isHost,
  anyPending,
  busy,
  run,
  roomCode,
}: EndScreenProps) {
  const [endPage, setEndPage] = useState<0 | 1 | 2>(0);
  const gameId = typeof room.lastGameHistoryId === "string" ? room.lastGameHistoryId : undefined;
  const { summary, loaded: summaryLoaded, error: summaryError } = useGameSummary(gameId);

  const manchete = buildEndManchete(room, players);
  const revealed = room.revealedRoles ?? {};
  const roundNum = Number(room.round ?? 1);
  const editionNum = (roundNum - 1) * 2 + 1;

  const goPrev = () => setEndPage((p) => (p > 0 ? ((p - 1) as 0 | 1 | 2) : p));
  const goNext = () => setEndPage((p) => (p < 2 ? ((p + 1) as 0 | 1 | 2) : p));

  const podiumRows = summary?.players
    ? [...summary.players].sort((a, b) => a.rank - b.rank).slice(0, 3)
    : [];

  return (
    <div className="screen screen--fim">
      <p className="fim-edition-label">Edição final · {endPage + 1}/3</p>

      {myRole && ROLE_LORE[myRole] && (
        <button
          type="button"
          className="fim-lore-toggle"
          onClick={() => setLoreOpen((v) => !v)}
        >
          História — {ROLE_DISPLAY[myRole] ?? myRole} {loreOpen ? "▲" : "▼"}
        </button>
      )}
      {loreOpen && myRole && ROLE_LORE[myRole] && (
        <div className="fim-lore-body">
          <RoleLoreContent lore={ROLE_LORE[myRole]} />
        </div>
      )}

      {endPage === 0 && (
        <section className="fim-page fim-page--manchete pageflip-enter" aria-label="Manchete final">
          <FolhetimEdition
            round={roundNum}
            folhetim={{
              manchete: manchete.manchete,
              paragraphs: [manchete.body],
              silentNight: false,
            }}
            lead="— a última edição —"
            editionLabel="Edição final"
            className="folhetim--fim-manchete papel-cai"
            ariaLabel="Folhetim de Bucaré — última edição"
          />
          <EndPagesNav page={0} onPrev={goPrev} onNext={goNext} />
        </section>
      )}

      {endPage === 1 && (
        <section className="fim-page fim-page--revelacao pageflip-enter" aria-label="Revelação final">
          <p className="fim-section-eyebrow">II · a revelação</p>
          <p className="fim-section-tagline">agora a vila sabe quem era cada um.</p>

          <ul className="fim-revelacao-list">
            {players.map((p) => {
              const id = p.id ?? "";
              const role = revealed[id];
              const roleName = role ? (ROLE_DISPLAY[role] ?? role) : "?";
              const side = role ? SIDE_OF_ROLE[role] : null;
              const out =
                p.alive === false || Boolean(p.eliminated) || Boolean(p.expelled);
              const isYou = id === playerId;
              const glyph = stablePlayerGlyph(id, playerId, selfGlyph);
              const subClass =
                side === "criatura"
                  ? " jogador-row__sub--criatura"
                  : side === "neutro"
                    ? " jogador-row__sub--neutro"
                    : " jogador-row__sub--morador";

              return (
                <li key={id}>
                  <div
                    className={`jogador-row fim-revelacao-row${out ? " jogador-row--eliminado" : ""}${side === "criatura" ? " jogador-row--criatura" : ""}`}
                  >
                    <span className="jogador-row__sim" aria-hidden>
                      {glyph}
                    </span>
                    <div className="fim-revelacao-info">
                      <span className="jogador-row__nome">{p.name}</span>
                      <span className={`jogador-row__sub${subClass}`}>
                        {roleName}
                        {side ? ` · ${SIDE_LABEL[side] ?? side}` : ""}
                      </span>
                    </div>
                    {isYou && <span className="jogador-row__tag jogador-row__tag--voce">você</span>}
                  </div>
                </li>
              );
            })}
          </ul>

          <EndPagesNav page={1} onPrev={goPrev} onNext={goNext} />
        </section>
      )}

      {endPage === 2 && (
        <section className="fim-page fim-page--cronica pageflip-enter" aria-label="Crônica e pódio">
          <p className="fim-section-eyebrow">III · a crônica &amp; o pódio</p>

          <div className="podio fim-podio" aria-label="Pódio da partida">
            {[1, 0, 2].map((slot) => {
              const row = podiumRows[slot];
              const place = slot === 0 ? 2 : slot === 1 ? 1 : 3;
              if (!row) {
                return <div key={slot} className={`podio__lugar podio__lugar--${place}`} aria-hidden />;
              }
              return (
                <div key={row.playerId} className={`podio__lugar podio__lugar--${place}`}>
                  <span className="podio__nome">{row.displayName}</span>
                  <div className="podio__base">
                    <span>{ROMAN[place - 1]}</span>
                    <span className="podio__pts">{row.points} pts</span>
                  </div>
                </div>
              );
            })}
          </div>
          {!summaryLoaded && (
            <p className="muted fim-podio-loading">Carregando pontuação…</p>
          )}
          {summaryError && <p className="muted fim-podio-loading">{summaryError}</p>}
          {summaryLoaded && podiumRows.length === 0 && (
            <p className="muted fim-podio-loading">Resumo de pontos ainda não disponível.</p>
          )}

          <article className="folhetim folhetim--edition folhetim--fim-cronica folhetim-card">
            <header className="fim-cronica-header">
              <h2 className="fim-cronica-title">A crônica</h2>
              <span className="fim-cronica-num">
                N.º {String(editionNum).padStart(2, "0")}
              </span>
            </header>
            <PartidaChronicle
              room={room}
              players={players}
              publicLog={publicLog}
              allRoundVotes={allRoundVotes}
              allRoundBotVoteReasons={allRoundBotVoteReasons}
              allNightActions={allNightActions}
              historyLoaded={historyLoaded}
              compact
            />
          </article>

          {isHost && (
            <button
              type="button"
              className="btn-dia fim-restart-btn"
              disabled={anyPending}
              onClick={() => void run("restartGame", { roomCode }, "restartGame").catch(() => {})}
            >
              <span className="btn-with-spinner">
                {busy("restartGame") ? "reiniciando…" : "Jogar outra edição"}
                <BtnSpinner show={busy("restartGame")} />
              </span>
            </button>
          )}

          <EndPagesNav page={2} onPrev={goPrev} onNext={goNext} />
        </section>
      )}
    </div>
  );
}
