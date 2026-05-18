import { useEffect, useMemo, useState } from "react";
import type { AmanhecerFolhetim } from "../../lib/amanhecerContent.js";
import {
  canShowCangaceiroTiro,
  canShowCoronelAccuse,
  hasPendingSaciGorro,
} from "../../dayActions.js";
import { canBeExpulsionVoteTarget, canSubmitExpulsionVote } from "../../lib/playerVote.js";
import { stablePlayerGlyph } from "../../lib/playerGlyph.js";
import { ROLE_DISPLAY, ROLE_LORE, ROLE_XILO, RoleLoreContent } from "../../lib/roleStories.js";
import type { ChatMessage, PlayerDoc, RoomDoc } from "../../types.js";
import { BtnSpinner } from "../BtnSpinner.js";
import { FolhetimOverlay } from "../FolhetimOverlay.js";

export type DayScreenProps = {
  room: RoomDoc;
  roomCode: string;
  players: PlayerDoc[];
  playerId: string;
  myRole: string | null;
  chat: ChatMessage[];
  dayRoundVotes: Record<string, string | null>;
  roundFolhetim: AmanhecerFolhetim;
  folhetimEdition: number;
  currentRound: number;
  isHost: boolean;
  voteTarget: string;
  setVoteTarget: (v: string) => void;
  chatText: string;
  setChatText: (v: string) => void;
  coronelAccusationArmed: boolean;
  setCoronelAccusationArmed: (v: boolean) => void;
  dayActionSent: string | null;
  setDayActionSent: (v: string | null) => void;
  tiroCertoTarget: string;
  setTiroCertoTarget: (v: string) => void;
  tiroPreview: { consulted: boolean; hint?: string } | null;
  setTiroPreview: (v: { consulted: boolean; hint?: string } | null) => void;
  loreOpen: boolean;
  setLoreOpen: (v: boolean) => void;
  loreSheetFolhetoOpen: boolean;
  setLoreSheetFolhetoOpen: (v: boolean) => void;
  formatPlayerName: (p: PlayerDoc) => string;
  run: (
    fnName: string,
    data: Record<string, unknown>,
    pendingKey?: string,
  ) => Promise<Record<string, unknown>>;
  busy: (key: string) => boolean;
  anyPending: boolean;
};

function formatVoteChatLine(name: string | undefined, text: string | undefined): string {
  const trimmed = String(text ?? "").trim();
  const who = String(name ?? "?").trim() || "?";
  if (!trimmed || trimmed === "votou." || trimmed === "votou") return `${who} votou.`;
  return trimmed;
}

function VoteTargetRow({
  player,
  glyph,
  selected,
  disabled,
  onSelect,
}: {
  player: PlayerDoc;
  glyph: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`jogador-row jogador-row--selectable jogador-row--voto${selected ? " jogador-row--escolhido" : ""}`}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="jogador-row__sim" aria-hidden>
        {glyph}
      </span>
      <span className="jogador-row__nome">{player.name ?? "?"}</span>
    </button>
  );
}

function DayStages({
  stage,
  onStage,
  votePending,
}: {
  stage: 1 | 2;
  onStage: (s: 1 | 2) => void;
  votePending?: boolean;
}) {
  return (
    <nav className="stages day-stages" aria-label="Fase do dia">
      <div className="stages__step stages__step--done">
        <span className="stages__dot stages__dot--done" aria-hidden />
        <span className="stages__label">Folhetim</span>
      </div>
      <span className="stages__line" aria-hidden />
      <button
        type="button"
        className={`stages__step${stage === 1 ? " stages__step--on" : " stages__step--done"}`}
        onClick={() => onStage(1)}
      >
        <span
          className={`stages__dot${stage === 1 ? " stages__dot--on" : " stages__dot--done"}`}
          aria-hidden
        />
        <span className="stages__label">Conversa</span>
      </button>
      <span className="stages__line" aria-hidden />
      <button
        type="button"
        className={`stages__step${stage === 2 ? " stages__step--on" : ""}${votePending ? " stages__step--attention" : ""}`}
        onClick={() => onStage(2)}
      >
        <span
          className={`stages__dot${stage === 2 ? " stages__dot--on" : ""}${votePending ? " stages__dot--attention" : ""}`}
          aria-hidden
        />
        <span className="stages__label">Voto</span>
      </button>
    </nav>
  );
}

export function DayScreen({
  room,
  roomCode,
  players,
  playerId,
  myRole,
  chat,
  dayRoundVotes,
  roundFolhetim,
  folhetimEdition,
  currentRound,
  isHost,
  voteTarget,
  setVoteTarget,
  chatText,
  setChatText,
  coronelAccusationArmed,
  setCoronelAccusationArmed,
  dayActionSent,
  setDayActionSent,
  tiroCertoTarget,
  setTiroCertoTarget,
  tiroPreview,
  setTiroPreview,
  loreOpen,
  setLoreOpen,
  loreSheetFolhetoOpen,
  setLoreSheetFolhetoOpen,
  formatPlayerName,
  run,
  busy,
  anyPending,
}: DayScreenProps) {
  const [dayStage, setDayStage] = useState<1 | 2>(1);
  const [voteSheetOpen, setVoteSheetOpen] = useState(false);
  const [refolhetimOpen, setRefolhetimOpen] = useState(false);
  const [tiroOpen, setTiroOpen] = useState(false);

  useEffect(() => {
    setDayStage(1);
    setVoteSheetOpen(false);
    setRefolhetimOpen(false);
    setTiroOpen(false);
  }, [currentRound]);

  const myPlayer = players.find((p) => p.id === playerId);
  const canVote = !!(myPlayer && canSubmitExpulsionVote(myPlayer));
  const hasVoted = Boolean(playerId) && Object.hasOwn(dayRoundVotes, playerId);
  const eligibleVoters = players.filter((p) => canSubmitExpulsionVote(p));
  const votesCastCount = eligibleVoters.filter((p) =>
    Object.hasOwn(dayRoundVotes, p.id ?? ""),
  ).length;
  const allVotesIn =
    eligibleVoters.length === 0 ||
    eligibleVoters.every((p) => Object.hasOwn(dayRoundVotes, p.id ?? ""));
  const validExpulsionTargetIds = new Set(
    players.filter(canBeExpulsionVoteTarget).map((p) => p.id ?? ""),
  );
  const rawResolved = canVote && hasVoted ? (dayRoundVotes[playerId] ?? "") : voteTarget;
  const resolvedVoteTarget =
    rawResolved && validExpulsionTargetIds.has(rawResolved) ? rawResolved : "";
  const voteTargetPlayer = resolvedVoteTarget
    ? players.find((p) => p.id === resolvedVoteTarget)
    : null;

  const voteTargets = useMemo(
    () => players.filter((p) => p.id !== playerId && canBeExpulsionVoteTarget(p)),
    [players, playerId],
  );

  const meCard = myPlayer;
  const lado = meCard?.side ?? null;
  const ladoLabel =
    lado === "criatura" ? "Criatura" : lado === "morador" ? "Morador" : lado === "neutro" ? "Neutro" : null;
  const displayName = myRole ? (ROLE_DISPLAY[myRole]?.replace(/^\S+\s+/, "") ?? myRole) : "";
  const xiloSrc = myRole ? (ROLE_XILO[myRole] ?? null) : null;
  const lore = myRole ? ROLE_LORE[myRole] : null;

  const canChat =
    myPlayer &&
    !(myPlayer.alive === false || myPlayer.eliminated || myPlayer.expelled) &&
    !myPlayer.silenced;

  const votePending = canVote && room.votingOpen === true && !hasVoted;

  const goToVote = () => {
    setDayStage(2);
    if (!hasVoted) setVoteSheetOpen(true);
  };

  const pickVote = (targetId: string) => {
    setVoteTarget(targetId);
    setVoteSheetOpen(false);
    if (coronelAccusationArmed) return;
    void run("submitVote", { roomCode, targetId: targetId || null }, "vote").catch(() => {});
  };

  return (
    <div className="screen screen--dia">
      {myRole && lore && (
        <button
          type="button"
          className={`etiqueta${lado === "criatura" ? " etiqueta--criatura" : ""}`}
          onClick={() => {
            setLoreSheetFolhetoOpen(true);
            setLoreOpen(true);
          }}
        >
          <div
            className={`etiqueta__pic${lado === "criatura" ? " etiqueta__pic--criatura" : lado === "neutro" ? " etiqueta__pic--neutro" : ""}`}
          >
            {xiloSrc ? (
              <img src={xiloSrc} alt={displayName} />
            ) : (
              <span style={{ fontFamily: "var(--ff-display)", fontSize: 13, color: "var(--ouro-claro)" }}>
                {displayName.charAt(0)}
              </span>
            )}
          </div>
          <div className="etiqueta__info">
            <span className="etiqueta__name">{displayName.toUpperCase()}</span>
            {ladoLabel && <span className="etiqueta__sub">{ladoLabel}</span>}
          </div>
          <span className="etiqueta__arrow">▸ reler</span>
        </button>
      )}

      <button
        type="button"
        className="mini-folhetim"
        onClick={() => setRefolhetimOpen(true)}
        aria-label="Reler folhetim da madrugada"
      >
        <div className="mini-folhetim__body">
          <div className="mini-folhetim__num">
            Folhetim · N.º {String(folhetimEdition).padStart(2, "0")}
          </div>
          <div className="mini-folhetim__manchete">{roundFolhetim.manchete}</div>
        </div>
        <div className="mini-folhetim__reler">▸ reler</div>
      </button>

      <DayStages stage={dayStage} onStage={setDayStage} votePending={votePending} />

      <div className="dia-chat" role="log" aria-live="polite">
        {chat.length === 0 ? (
          <p className="dia-chat__empty muted">A praça está em silêncio… por enquanto.</p>
        ) : (
          chat.map((m) => {
            const isVote = (m as { type?: string }).type === "vote";
            if (isVote) {
              return (
                <p key={m.id} className="dia-chat__vote-line muted">
                  {formatVoteChatLine(m.name, m.text)}
                </p>
              );
            }
            return (
              <article key={m.id} className="dia-chat__bubble">
                <p className="dia-chat__author">{(m.name ?? "?").toUpperCase()}</p>
                <p className="dia-chat__text">{m.text}</p>
              </article>
            );
          })
        )}
      </div>

      {dayStage === 1 && canChat && (
        <form
          className="dia-composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (!chatText.trim() || anyPending) return;
            void run("sendChatMessage", { roomCode, text: chatText }, "chatSend")
              .then(() => setChatText(""))
              .catch(() => {});
          }}
        >
          <input
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="Mensagem…"
            aria-label="Mensagem no chat"
          />
          <button
            type="submit"
            className="dia-composer__send"
            disabled={!chatText.trim() || anyPending}
            aria-label="Enviar"
          >
            {busy("chatSend") ? "…" : "▸"}
          </button>
        </form>
      )}

      {dayStage === 1 && !canChat && myPlayer && (
        <p className="dia-status muted">
          {myPlayer.silenced
            ? "Você está em silêncio e não pode falar agora."
            : "Você não pode enviar mensagens."}
        </p>
      )}

      {dayStage === 2 && canVote && room.votingOpen === true && (
        <p className="dia-hint">A praça está agitada. Hora de votar.</p>
      )}

      {dayStage === 2 && room.votingOpen === true && !canVote && (
        <p className="dia-status muted">Você não tem direito a voto nesta rodada.</p>
      )}

      {canShowCangaceiroTiro(myRole, myPlayer) && (
        <div className="dia-extra">
          <button
            type="button"
            className="dia-extra__toggle"
            onClick={() => setTiroOpen((o) => !o)}
            aria-expanded={tiroOpen}
          >
            Tiro Certo {tiroOpen ? "▾" : "▸"}
          </button>
          {tiroOpen && (
            <div className="dia-extra__body">
              <label className="field-label">Alvo do disparo</label>
              <select
                className="vote-select"
                value={tiroCertoTarget}
                onChange={(e) => {
                  setTiroCertoTarget(e.target.value);
                  setTiroPreview(null);
                }}
              >
                <option value="">—</option>
                {players
                  .filter((p) => p.id !== playerId && p.alive !== false && !p.eliminated && !p.expelled)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatPlayerName(p)}
                    </option>
                  ))}
              </select>
              {tiroPreview && (
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  {tiroPreview.consulted
                    ? `Geni já conversou com essa pessoa: parece ser ${tiroPreview.hint}.`
                    : "Geni ainda não conversou com essa pessoa — se disparar, será às cegas."}
                </p>
              )}
              <div className="dia-extra__actions">
                <button
                  type="button"
                  className="chip-btn chip-btn--with-spinner"
                  disabled={!tiroCertoTarget || anyPending || busy("tiroPrev")}
                  onClick={async () => {
                    try {
                      const r = await run(
                        "cangaceiroTiroCerto",
                        { roomCode, targetId: tiroCertoTarget, stage: "preview" },
                        "tiroPrev",
                      );
                      setTiroPreview({
                        consulted: Boolean(r.consulted),
                        hint: (r.hint as string | undefined) ?? undefined,
                      });
                    } catch {
                      /* run sets err */
                    }
                  }}
                >
                  <span className="btn-with-spinner">
                    {busy("tiroPrev") ? "…" : "Checar com Geni"}
                    <BtnSpinner show={busy("tiroPrev")} />
                  </span>
                </button>
                <button
                  type="button"
                  className="chip-btn chip-btn--with-spinner"
                  disabled={!tiroCertoTarget || anyPending || dayActionSent === "tiro" || busy("tiroCommit")}
                  onClick={async () => {
                    try {
                      await run(
                        "cangaceiroTiroCerto",
                        { roomCode, targetId: tiroCertoTarget, stage: "commit" },
                        "tiroCommit",
                      );
                      setDayActionSent("tiro");
                      setTiroCertoTarget("");
                      setTiroPreview(null);
                    } catch {
                      /* run sets err */
                    }
                  }}
                >
                  <span className="btn-with-spinner">
                    {busy("tiroCommit")
                      ? "…"
                      : dayActionSent === "tiro"
                        ? "✓ Tiro disparado"
                        : "Confirmar disparo"}
                    <BtnSpinner show={busy("tiroCommit")} />
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <footer className="dia-footer">
        {dayStage === 1 && votePending && (
          <button
            type="button"
            className="btn-dia dia-footer__votar"
            disabled={anyPending}
            onClick={goToVote}
          >
            Votar
          </button>
        )}

        {dayStage === 1 && canVote && room.votingOpen === true && hasVoted && !isHost && (
          <p className="dia-footer__voted muted">Seu voto foi enviado.</p>
        )}

        {room.votingOpen === true && canVote && dayStage === 2 && (
          <>
            <button
              type="button"
              className={`vote-bar${resolvedVoteTarget ? " vote-bar--escolhido" : ""}`}
              disabled={hasVoted || anyPending || (myRole === "coronel" && coronelAccusationArmed)}
              onClick={goToVote}
            >
              <div>
                <p className="vote-bar__label">seu voto</p>
                <p className="vote-bar__nome">
                  {hasVoted
                    ? voteTargetPlayer?.name ?? "— em branco —"
                    : voteTargetPlayer?.name ?? "tocar para escolher"}
                </p>
              </div>
              <span className="vote-bar__acao">
                {hasVoted ? "enviado" : resolvedVoteTarget ? "trocar ▸" : "escolher ▸"}
              </span>
            </button>

            {canShowCoronelAccuse(myRole, room, myPlayer) && (
              <div className="dia-coronel">
                <button
                  type="button"
                  disabled={
                    anyPending ||
                    dayActionSent === "coronel" ||
                    (coronelAccusationArmed && !resolvedVoteTarget)
                  }
                  className={
                    dayActionSent === "coronel"
                      ? "chip-btn vote-sent"
                      : coronelAccusationArmed
                        ? "btn-dia"
                        : "chip-btn"
                  }
                  onClick={() => {
                    if (dayActionSent === "coronel") return;
                    if (!coronelAccusationArmed) {
                      setCoronelAccusationArmed(true);
                      goToVote();
                      return;
                    }
                    void run(
                      "coronelStartAccusation",
                      { roomCode, targetId: resolvedVoteTarget },
                      "coronelAccuse",
                    )
                      .then(() => {
                        setDayActionSent("coronel");
                        setCoronelAccusationArmed(false);
                      })
                      .catch(() => {});
                  }}
                >
                  <span className="btn-with-spinner">
                    {busy("coronelAccuse")
                      ? "enviando…"
                      : dayActionSent === "coronel"
                        ? "✓ Acusação enviada"
                        : coronelAccusationArmed
                          ? "Confirmar acusação formal"
                          : "Acusação formal"}
                    <BtnSpinner show={busy("coronelAccuse")} />
                  </span>
                </button>
                {coronelAccusationArmed && dayActionSent !== "coronel" && (
                  <button
                    type="button"
                    className="chip-btn"
                    disabled={anyPending}
                    onClick={() => setCoronelAccusationArmed(false)}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {dayStage === 1 && allVotesIn && !isHost && room.votingOpen && (
          <p className="dia-footer__waiting muted">
            Todos votaram. Aguardando o anfitrião encerrar o dia.
          </p>
        )}

        {isHost && room.votingOpen && (
          <>
            <p className="dia-footer__host-hint">
              {allVotesIn
                ? "Todos os votos estão registrados."
                : `${votesCastCount} de ${eligibleVoters.length} votaram`}
              {!canVote && !allVotesIn ? " · você não vota nesta rodada" : ""}
            </p>
            <button
              type="button"
              className={allVotesIn ? "btn-dia dia-footer__apurar-btn" : "dia-footer__apurar"}
              disabled={anyPending}
              onClick={() => void run("advanceDay", { roomCode }, "advanceDay").catch(() => {})}
            >
              <span className="btn-with-spinner">
                {busy("advanceDay")
                  ? "aguarda…"
                  : allVotesIn
                    ? "Apurar votos"
                    : "Encerrar dia"}
                <BtnSpinner show={busy("advanceDay")} />
              </span>
            </button>
          </>
        )}

        {isHost && room.pendingNightStart && !hasPendingSaciGorro(room) && !room.pendingBrasChoice && (
          <button
            type="button"
            className="btn-dia"
            disabled={anyPending}
            onClick={() => void run("startNight", { roomCode }, "startNight").catch(() => {})}
          >
            <span className="btn-with-spinner">
              {busy("startNight") ? "recolhendo…" : "Toque de recolher"}
              <BtnSpinner show={busy("startNight")} />
            </span>
          </button>
        )}
      </footer>

      <FolhetimOverlay
        open={refolhetimOpen}
        onClose={() => setRefolhetimOpen(false)}
        round={currentRound}
        folhetim={roundFolhetim}
      />

      {loreOpen && lore && (
        <div
          className="dia-lore-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Carta do personagem"
          onClick={() => {
            setLoreOpen(false);
            setLoreSheetFolhetoOpen(false);
          }}
        >
          <div className="dia-lore-panel" onClick={(e) => e.stopPropagation()}>
            <div className={`folheto-int folheto-int--${lado ?? "morador"} ${loreSheetFolhetoOpen ? "is-open" : ""}`}>
              <button
                type="button"
                className="folheto-int__capa"
                onClick={() => setLoreSheetFolhetoOpen(true)}
                aria-expanded={loreSheetFolhetoOpen}
              >
                <div className="folheto-int__xilo">
                  {xiloSrc ? (
                    <img src={xiloSrc} alt={displayName} />
                  ) : (
                    <div className="folheto-int__placeholder">{displayName.toUpperCase()}</div>
                  )}
                </div>
                <div className="folheto-int__name">{displayName.toUpperCase()}</div>
                <div className="folheto-int__lado">— {ladoLabel ?? "Morador"} —</div>
                <div className="folheto-int__hint">
                  {loreSheetFolhetoOpen ? "pronto?" : "toque o folheto"}
                </div>
              </button>
              <div className="folheto-int__corpo">
                <RoleLoreContent lore={lore} />
              </div>
            </div>
            <button
              type="button"
              className="btn-link dia-lore-close"
              onClick={() => {
                setLoreOpen(false);
                setLoreSheetFolhetoOpen(false);
              }}
            >
              ← fechar ficha
            </button>
          </div>
        </div>
      )}

      {voteSheetOpen && (
        <div
          className="vote-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Escolher voto"
          onClick={() => setVoteSheetOpen(false)}
        >
          <div className="vote-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="vote-sheet__handle" aria-hidden />
            <p className="vote-sheet__title">Quem você acusa?</p>
            {voteTargets.map((p) => (
              <VoteTargetRow
                key={p.id}
                player={p}
                glyph={stablePlayerGlyph(p.id ?? "", p.name ?? "")}
                selected={resolvedVoteTarget === (p.id ?? "")}
                disabled={hasVoted || anyPending}
                onSelect={() => pickVote(p.id ?? "")}
              />
            ))}
            <VoteTargetRow
              player={{ id: "", name: "— em branco —" }}
              glyph="○"
              selected={!resolvedVoteTarget}
              disabled={hasVoted || anyPending}
              onSelect={() => pickVote("")}
            />
            {canShowCoronelAccuse(myRole, room, myPlayer) && coronelAccusationArmed && (
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
                Escolha o alvo da acusação formal e confirme abaixo.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
