import {
  geniConversedPlayerIds,
  normalizeGeniInvestigatedTargets,
} from "folclore-game-engine";
import type { PlayerDoc, RoomDoc } from "../../types.js";
import { BtnSpinner } from "../BtnSpinner.js";
import { NIGHT_ROLE_ACTION_SECONDS } from "../../lib/nightTurnConstants.js";
import {
  nightConfirmLabel,
  nightPrompt,
  nightSelectionTone,
  suspicionConfirmLabel,
} from "../../lib/nightPrompts.js";
import { stablePlayerGlyph } from "../../lib/playerGlyph.js";
import { ROLE_DISPLAY, ROLE_LORE, ROLE_XILO, RoleLoreContent } from "../../lib/roleStories.js";
import type { PlayerPrivateDoc } from "../../hooks/useMyPlayerPrivate.js";

type ActionOpt = { value: string; label: string };

export type NightScreenProps = {
  room: RoomDoc;
  roomCode: string;
  players: PlayerDoc[];
  playerId: string;
  myRole: string | null;
  selfGlyph: string;
  roleActionOptions: ActionOpt[];
  myPrivate: PlayerPrivateDoc | null | undefined;
  nightTarget: string;
  setNightTarget: (v: string) => void;
  nightAction: string;
  setNightAction: (v: string) => void;
  nightSpecialAction: string | null;
  setNightSpecialAction: (v: string | null) => void;
  nightActionSent: boolean;
  setNightActionSent: (v: boolean) => void;
  suspicionTarget: string;
  setSuspicionTarget: (v: string) => void;
  suspicionSent: boolean;
  setSuspicionSent: (v: boolean) => void;
  cangConsultTarget: string;
  setCangConsultTarget: (v: string) => void;
  nightToast: string | null;
  delegadoIntroDismissed: boolean;
  setDelegadoIntroDismissed: (v: boolean) => void;
  delegadoJustifyInlineError: boolean;
  setDelegadoJustifyInlineError: (v: boolean) => void;
  loreOpen: boolean;
  setLoreOpen: (v: boolean) => void;
  loreSheetFolhetoOpen: boolean;
  setLoreSheetFolhetoOpen: (v: boolean) => void;
  run: (
    fnName: string,
    data: Record<string, unknown>,
    pendingKey?: string,
  ) => Promise<Record<string, unknown>>;
  busy: (key: string) => boolean;
  anyPending: boolean;
};

function TargetRow({
  player,
  glyph,
  selected,
  onSelect,
  disabled,
  selectionTone = "benigno",
}: {
  player: PlayerDoc;
  glyph: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  selectionTone?: "criatura" | "benigno";
}) {
  const selectedClass =
    selected && selectionTone === "criatura"
      ? " jogador-row--alvo"
      : selected
        ? " jogador-row--escolhido"
        : "";
  return (
    <button
      type="button"
      className={`jogador-row jogador-row--selectable${selectedClass}`}
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="jogador-row__sim" aria-hidden>
        {glyph}
      </span>
      <span className="jogador-row__nome">{(player.name ?? "?").toUpperCase()}</span>
    </button>
  );
}

export function NightScreen({
  room,
  roomCode,
  players,
  playerId,
  myRole,
  selfGlyph,
  roleActionOptions,
  myPrivate,
  nightTarget,
  setNightTarget,
  nightAction,
  setNightAction,
  nightSpecialAction,
  setNightSpecialAction,
  nightActionSent,
  setNightActionSent,
  suspicionTarget,
  setSuspicionTarget,
  suspicionSent,
  setSuspicionSent,
  cangConsultTarget,
  setCangConsultTarget,
  nightToast,
  delegadoIntroDismissed,
  setDelegadoIntroDismissed,
  delegadoJustifyInlineError,
  setDelegadoJustifyInlineError,
  loreOpen,
  setLoreOpen,
  loreSheetFolhetoOpen,
  setLoreSheetFolhetoOpen,
  run,
  busy,
  anyPending,
}: NightScreenProps) {
  const meNight = players.find((p) => p.id === playerId);
  const myRoleIsPending = !!(myRole && room.nightPendingRoles?.includes(myRole));
  const needsAlignment =
    (myRole === "curupira" || myRole === "boitata") &&
    room.round === 1 &&
    Number(room.gameTablePlayerCount) !== 5;
  const targetPool =
    myRole === "mae_de_santo"
      ? players.filter((p) => p.eliminated && !p.expelled)
      : players.filter((p) => p.id !== playerId && p.alive !== false && !p.eliminated && !p.expelled);
  const delegadoPass = myRole === "delegado" && nightAction === "pass";
  const nightRolePass =
    nightAction === "pass" &&
    (myRole === "geni" ||
      myRole === "doutor" ||
      myRole === "mae_de_santo" ||
      myRole === "cartomante" ||
      myRole === "boitata");
  const hideNightTarget = delegadoPass || nightRolePass;
  const needsJailReason = myRole === "delegado" && !delegadoPass;
  let canSubmit = false;
  if (!anyPending) {
    if (delegadoPass || nightRolePass) canSubmit = true;
    else if (myRole === "delegado" && nightAction === "jail") {
      canSubmit = !!nightTarget && (nightSpecialAction?.trim().length ?? 0) >= 10;
    } else {
      canSubmit = !!nightTarget && (!needsAlignment || !!nightSpecialAction);
    }
  }
  const canMarkNightReady =
    !myRoleIsPending &&
    roleActionOptions.length === 0 &&
    meNight?.alive !== false &&
    !meNight?.eliminated &&
    !meNight?.expelled;
  const showCangConsult =
    myRole === "cangaceiro" &&
    meNight?.alive !== false &&
    !meNight?.eliminated &&
    !meNight?.expelled;
  const usedTargets = new Set(myPrivate?.investigationTargetsUsed ?? []);
  const geniKnown = new Set(
    geniConversedPlayerIds(normalizeGeniInvestigatedTargets(room.geniInvestigatedTargets)),
  );
  const blockInvestigation =
    myRole === "geni"
      ? geniKnown
      : myRole === "cartomante" || myRole === "boitata"
        ? usedTargets
        : new Set<string>();
  const lastJailedId = (meNight?.delegadoLastJailedId as string | undefined) ?? "";
  const filteredTargetPool = targetPool
    .filter((p) => !blockInvestigation.has(p.id ?? ""))
    .filter((p) => !(myRole === "delegado" && lastJailedId && p.id === lastJailedId));
  const showSuspicion =
    !!meNight &&
    meNight.alive !== false &&
    !meNight.eliminated &&
    !meNight.expelled &&
    (!myRoleIsPending || nightActionSent);
  const suspicionPrimary = canMarkNightReady;
  const delegadoIntroVisible =
    myRoleIsPending &&
    myRole === "delegado" &&
    (room.round ?? 1) === 1 &&
    !delegadoIntroDismissed;
  const delegadoJailSelectedName =
    nightTarget && myRole === "delegado" && nightAction === "jail"
      ? players.find((p) => p.id === nightTarget)?.name ?? "esta pessoa"
      : "";
  const nightMissingTargetOnly =
    !hideNightTarget && !nightTarget && !delegadoPass && !nightRolePass;
  const delegadoJailNeedsMoreText =
    myRole === "delegado" &&
    nightAction === "jail" &&
    Boolean(nightTarget) &&
    (nightSpecialAction?.trim().length ?? 0) < 10;
  const selectedTargetName = nightTarget
    ? players.find((p) => p.id === nightTarget)?.name ?? null
    : null;
  const selectedSuspicionName = suspicionTarget
    ? players.find((p) => p.id === suspicionTarget)?.name ?? null
    : null;

  const meCard = players.find((p) => p.id === playerId);
  const lado = meCard?.side ?? null;
  const selectionTone = nightSelectionTone(lado);
  const ladoLabel =
    lado === "criatura" ? "Criatura" : lado === "morador" ? "Morador" : lado === "neutro" ? "Neutro" : null;
  const displayName = myRole ? (ROLE_DISPLAY[myRole]?.replace(/^\S+\s+/, "") ?? myRole) : "";
  const xiloSrc = myRole ? (ROLE_XILO[myRole] ?? null) : null;
  const lore = myRole ? ROLE_LORE[myRole] : null;

  const promptText = nightPrompt(myRole, {
    myTurn: myRoleIsPending && !delegadoIntroVisible,
    action: nightAction,
    suspicionOnly: suspicionPrimary && !myRoleIsPending,
    waiting: !myRoleIsPending && !suspicionPrimary,
  });

  const submitNightAction = () => {
    if (anyPending || nightActionSent) return;
    if (nightMissingTargetOnly) return;
    if (myRole === "delegado" && nightAction === "jail" && nightTarget) {
      const len = nightSpecialAction?.trim().length ?? 0;
      if (len < 10) {
        setDelegadoJustifyInlineError(true);
        return;
      }
    }
    setDelegadoJustifyInlineError(false);
    const payload: Record<string, unknown> = {
      roomCode,
      action: nightAction,
      targetId: nightTarget || null,
      specialAction: nightSpecialAction,
    };
    if (myRole === "delegado" && nightAction === "jail" && nightTarget) {
      payload.justification = nightSpecialAction?.trim() ?? "";
    }
    void run("submitNightAction", payload, "nightAction")
      .then(() => setNightActionSent(true))
      .catch(() => {});
  };

  const finishSuspicion = async (pass: boolean, targetId: string | null) => {
    const key = pass ? "suspicionPass" : "suspicionSend";
    await run(
      "submitNightSuspicion",
      pass ? { roomCode, pass: true } : { roomCode, targetId },
      key,
    );
    if (canMarkNightReady) {
      await run("markNightReady", { roomCode }, "markNightReady");
      setNightActionSent(true);
    }
    setSuspicionSent(true);
  };

  const renderEtiqueta = () => {
    if (!myRole || !lore) return null;
    if (!loreOpen) {
      return (
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
      );
    }
    return (
      <div className="noite-lore-sheet">
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
            <div className="folheto-int__hint">{loreSheetFolhetoOpen ? "pronto?" : "toque o folheto"}</div>
          </button>
          <div className="folheto-int__corpo">
            <RoleLoreContent lore={lore} />
          </div>
        </div>
        <button
          type="button"
          className="btn-link noite-lore-close"
          onClick={() => {
            setLoreOpen(false);
            setLoreSheetFolhetoOpen(false);
          }}
        >
          ← fechar folheto
        </button>
      </div>
    );
  };

  return (
    <div className="screen screen--noite">
      {nightToast ? (
        <div className="night-flow-toast" role="status">
          {nightToast}
        </div>
      ) : null}

      {delegadoIntroVisible ? (
        <div className="delegado-night-intro-backdrop" role="dialog" aria-modal="true">
          <div className="delegado-night-intro-card">
            <h2 className="delegado-night-intro-title">👮 Sua vez, Delegado</h2>
            <p className="delegado-night-intro-body">Você pode prender um suspeito esta noite.</p>
            <p className="delegado-night-intro-body">
              Se prender alguém, escreva uma justificativa — ela vai aparecer no Folhetim amanhã.
            </p>
            <p className="muted delegado-night-intro-timer-note">
              Depois de continuar, você terá {NIGHT_ROLE_ACTION_SECONDS}s para enviar prender ou passar.
            </p>
            <button
              type="button"
              className="chip-btn delegado-night-intro-btn"
              onClick={() => {
                sessionStorage.setItem(`folhetim_delegado_night_intro_${roomCode}`, "1");
                setDelegadoIntroDismissed(true);
              }}
            >
              Entendi
            </button>
          </div>
        </div>
      ) : null}

      {renderEtiqueta()}

      {showCangConsult && !delegadoIntroVisible && (
        <div className="noite-cang-panel">
          <p className="noite-cang-panel__label muted">
            Consultar se a Geni já sabe de alguém? (opcional)
          </p>
          <div className="noite-alvos noite-alvos--compact">
            {players
              .filter((p) => p.id !== playerId && p.alive !== false && !p.eliminated && !p.expelled)
              .map((p) => (
                <TargetRow
                  key={p.id}
                  player={p}
                  glyph={stablePlayerGlyph(p.id ?? "", playerId, selfGlyph)}
                  selected={cangConsultTarget === p.id}
                  selectionTone={selectionTone}
                  disabled={anyPending}
                  onSelect={() => setCangConsultTarget(p.id ?? "")}
                />
              ))}
          </div>
          <div className="row noite-cang-actions">
            <button
              type="button"
              className="chip-btn chip-btn--with-spinner"
              disabled={anyPending || !cangConsultTarget || busy("cangConsult")}
              onClick={() =>
                void run(
                  "submitCangaceiroConsult",
                  { roomCode, targetId: cangConsultTarget },
                  "cangConsult",
                )
                  .then(() => setCangConsultTarget(""))
                  .catch(() => {})
              }
            >
              <span className="btn-with-spinner">
                {busy("cangConsult") ? "enviando…" : "Consultar"}
                <BtnSpinner show={busy("cangConsult")} />
              </span>
            </button>
            <button
              type="button"
              className="chip-btn chip-btn--with-spinner"
              disabled={anyPending || busy("cangPass")}
              onClick={() =>
                void run("submitCangaceiroConsult", { roomCode, pass: true }, "cangPass").catch(() => {})
              }
            >
              <span className="btn-with-spinner">
                {busy("cangPass") ? "…" : "Passar consulta"}
                <BtnSpinner show={busy("cangPass")} />
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="noite-hero">
        <div className="lua" aria-hidden>
          ☾
        </div>
        <p className="eyebrow eyebrow-luar noite-eyebrow">A vila dorme</p>
      </div>

      <p className="noite-prompt">{promptText}</p>

      {myRoleIsPending && !delegadoIntroVisible && (
        <>
          {roleActionOptions.length > 1 && (
            <div className="noite-action-chips" role="group" aria-label="Ação">
              {roleActionOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`chip-btn${nightAction === o.value ? " chip-btn--active" : ""}`}
                  disabled={anyPending || nightActionSent}
                  onClick={() => setNightAction(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          {needsAlignment && (
            <div className="noite-align-row" role="group" aria-label="Alinhamento">
              <button
                type="button"
                className={`chip-btn${nightSpecialAction === "moradores" ? " chip-btn--active" : ""}`}
                disabled={anyPending || nightActionSent}
                onClick={() => setNightSpecialAction("moradores")}
              >
                Moradores
              </button>
              <button
                type="button"
                className={`chip-btn${nightSpecialAction === "criaturas" ? " chip-btn--active" : ""}`}
                disabled={anyPending || nightActionSent}
                onClick={() => setNightSpecialAction("criaturas")}
              >
                Criaturas
              </button>
            </div>
          )}

          {!hideNightTarget && (
            <div className="noite-alvos">
              {filteredTargetPool.map((p) => (
                <TargetRow
                  key={p.id}
                  player={p}
                  glyph={stablePlayerGlyph(p.id ?? "", playerId, selfGlyph)}
                  selected={nightTarget === p.id}
                  selectionTone={selectionTone}
                  disabled={anyPending || nightActionSent}
                  onSelect={() => setNightTarget(p.id ?? "")}
                />
              ))}
            </div>
          )}

          {myRole === "delegado" && nightAction === "jail" && nightTarget ? (
            <div className="delegado-justify-field-wrap noite-delegado-justify">
              <label className="field-label" htmlFor="delegado-justify-input">
                Por que está prendendo {delegadoJailSelectedName}?
              </label>
              <textarea
                id="delegado-justify-input"
                className="delegado-justify-textarea"
                rows={3}
                maxLength={120}
                placeholder={`Há indícios de que ${delegadoJailSelectedName} está...`}
                value={nightSpecialAction ?? ""}
                onChange={(e) => setNightSpecialAction(e.target.value)}
                autoComplete="off"
              />
              <p className="delegado-justify-counter muted">
                {120 - (nightSpecialAction?.length ?? 0)} caracteres restantes
              </p>
              {delegadoJustifyInlineError ? (
                <p className="delegado-justify-error" role="alert">
                  Escreva uma justificativa para continuar.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {showSuspicion && !myRoleIsPending && (
        <div className="noite-alvos">
          {targetPool.map((p) => (
            <TargetRow
              key={p.id}
              player={p}
              glyph={stablePlayerGlyph(p.id ?? "", playerId, selfGlyph)}
              selected={suspicionTarget === p.id}
              selectionTone={selectionTone}
              disabled={anyPending || suspicionSent}
              onSelect={() => setSuspicionTarget(p.id ?? "")}
            />
          ))}
        </div>
      )}

      <div className="noite-footer">
        {myRoleIsPending && !delegadoIntroVisible ? (
          <button
            type="button"
            className={`btn-noite${nightActionSent ? " vote-sent" : ""}`}
            disabled={
              anyPending ||
              nightActionSent ||
              nightMissingTargetOnly ||
              (!delegadoJailNeedsMoreText && !canSubmit)
            }
            onClick={submitNightAction}
          >
            <span className="btn-with-spinner">
              {busy("nightAction")
                ? "enviando…"
                : nightConfirmLabel(myRole, nightAction, selectedTargetName, nightActionSent)}
              <BtnSpinner show={busy("nightAction")} />
            </span>
          </button>
        ) : suspicionPrimary ? (
          <>
            <button
              type="button"
              className={`btn-noite${suspicionSent ? " vote-sent" : ""}`}
              disabled={anyPending || !suspicionTarget || suspicionSent || busy("suspicionSend")}
              onClick={() => void finishSuspicion(false, suspicionTarget).catch(() => {})}
            >
              <span className="btn-with-spinner">
                {busy("suspicionSend")
                  ? "enviando…"
                  : suspicionConfirmLabel(selectedSuspicionName, suspicionSent)}
                <BtnSpinner show={busy("suspicionSend")} />
              </span>
            </button>
            <button
              type="button"
              className="btn-link noite-pass-link"
              disabled={anyPending || suspicionSent || busy("suspicionPass")}
              onClick={() => void finishSuspicion(true, null).catch(() => {})}
            >
              Passar sem marcar suspeita
            </button>
          </>
        ) : showSuspicion && !suspicionSent ? (
          <>
            <button
              type="button"
              className="btn-noite"
              disabled={anyPending || !suspicionTarget || busy("suspicionSend")}
              onClick={() => void finishSuspicion(false, suspicionTarget).catch(() => {})}
            >
              <span className="btn-with-spinner">
                {busy("suspicionSend")
                  ? "enviando…"
                  : suspicionConfirmLabel(selectedSuspicionName, false)}
                <BtnSpinner show={busy("suspicionSend")} />
              </span>
            </button>
            <button
              type="button"
              className="btn-link noite-pass-link"
              disabled={anyPending || busy("suspicionPass")}
              onClick={() => void finishSuspicion(true, null).catch(() => {})}
            >
              Passar
            </button>
          </>
        ) : (
          <button type="button" className="btn-noite" disabled>
            {nightActionSent || suspicionSent ? "Aguardando o amanhecer…" : "Outros jogadores agindo…"}
          </button>
        )}
      </div>
    </div>
  );
}
