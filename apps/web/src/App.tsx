import { signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth, call, db } from "./firebase.js";

function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

const LS_ROOM = "folclore_roomCode";
const LS_PLAYER = "folclore_playerId";
const LS_GLYPH = "folclore_glyph";

const AVATAR_GLYPHS = ["☽", "✦", "◆", "❖", "✧", "☆", "★", "◉"];

type View = "intro" | "create" | "join" | "joinName";

type RoomDoc = DocumentData & {
  status?: string;
  hostUid?: string;
  expectedPlayerCount?: number;
  round?: number;
  spokespersonId?: string;
  currentActorRole?: string | null;
  nightPendingRoles?: string[];
  votingOpen?: boolean;
  pendingBrasChoice?: boolean;
  winner?: string | null;
};

type PlayerDoc = DocumentData & {
  id?: string;
  name?: string;
  uid?: string;
  alive?: boolean;
  eliminated?: boolean;
  expelled?: boolean;
  isSpokesperson?: boolean;
  isBot?: boolean;
  wolfBiteUsed?: boolean;
  seduced?: boolean;
  jailed?: boolean;
};

export function App() {
  const [uid, setUid] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(LS_ROOM) ?? "");
  const [playerId, setPlayerId] = useState(() => localStorage.getItem(LS_PLAYER) ?? "");
  const [name, setName] = useState("");
  const [expected, setExpected] = useState(5);
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [players, setPlayers] = useState<PlayerDoc[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [publicLog, setPublicLog] = useState<{ id: string; message?: string; round?: number; type?: string }[]>([]);
  const [chat, setChat] = useState<{ id: string; name?: string; text?: string }[]>([]);
  const [chatText, setChatText] = useState("");
  const [voteTarget, setVoteTarget] = useState<string>("");
  const [nightTarget, setNightTarget] = useState<string>("");
  const [nightAction, setNightAction] = useState("eliminate");
  const [nightSpecialAction, setNightSpecialAction] = useState<string | null>(null);

  // Entry flow
  const [view, setView] = useState<View>("intro");
  const [glyph, setGlyph] = useState(() => localStorage.getItem(LS_GLYPH) ?? "☽");
  const [joinCodeArr, setJoinCodeArr] = useState(["", "", "", ""]);
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);
  const [copied, setCopied] = useState(false);
  // tracks locally whether the current user created the room (avoids waiting for Firestore)
  const [amHost, setAmHost] = useState(false);

  useEffect(() => {
    signInAnonymously(auth)
      .then((c) => setUid(c.user.uid))
      .catch((e) => setErr(String(e.message)));
  }, []);

  useEffect(() => {
    if (!roomCode) {
      setRoom(null);
      setPlayers([]);
      return;
    }
    const unsubR = onSnapshot(doc(db, "rooms", roomCode), (s) =>
      setRoom(s.exists() ? (s.data() as RoomDoc) : null),
    );
    const unsubP = onSnapshot(collection(db, "rooms", roomCode, "players"), (snap) =>
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlayerDoc)),
    );
    const qLog = query(
      collection(db, "rooms", roomCode, "publicLogEntries"),
      orderBy("timestamp", "asc"),
    );
    const unsubL = onSnapshot(qLog, (snap) =>
      setPublicLog(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => {
      unsubR();
      unsubP();
      unsubL();
    };
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !playerId) {
      setMyRole(null);
      return;
    }
    return onSnapshot(doc(db, "rooms", roomCode, "secrets", playerId), (s) => {
      setMyRole(s.exists() ? String((s.data() as { role?: string }).role ?? "") : null);
    });
  }, [roomCode, playerId]);

  useEffect(() => {
    if (!roomCode || room?.status !== "day") {
      setChat([]);
      return;
    }
    const q = query(
      collection(db, "rooms", roomCode, "chat"),
      orderBy("createdAt", "asc"),
    );
    return onSnapshot(q, (snap) =>
      setChat(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
  }, [roomCode, room?.status]);

  // Auto-advance join view when all 4 cells filled
  useEffect(() => {
    if (view === "join" && joinCodeArr.every((c) => c.length === 1)) {
      setView("joinName");
    }
  }, [joinCodeArr, view]);

  // Auto-focus first code cell
  useEffect(() => {
    if (view !== "join") return;
    const t = requestAnimationFrame(() => codeInputRefs.current[0]?.focus());
    return () => cancelAnimationFrame(t);
  }, [view]);

  const isHost = !!(room?.hostUid && uid === room.hostUid);
  const isSpokesperson = room?.spokespersonId === playerId;

  const run = useCallback(async (fnName: string, data: Record<string, unknown>) => {
    setErr(null);
    setLoading(true);
    try {
      const c = call(fnName);
      const res = await c(data);
      return res.data as Record<string, unknown>;
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: string }).message)
          : String(e);
      setErr(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const createRoom = async () => {
    localStorage.setItem(LS_GLYPH, glyph);
    setAmHost(true);
    const r = await run("createRoom", { name, expectedPlayerCount: expected });
    const code = String(r.roomCode ?? "");
    const pid = String(r.playerId ?? "");
    setRoomCode(code);
    setPlayerId(pid);
    localStorage.setItem(LS_ROOM, code);
    localStorage.setItem(LS_PLAYER, pid);
  };

  const joinRoom = async () => {
    localStorage.setItem(LS_GLYPH, glyph);
    const code = joinCodeArr.join("").toUpperCase().trim();
    const r = await run("joinRoom", { roomCode: code, name });
    const pid = String(r.playerId ?? "");
    setRoomCode(code);
    setPlayerId(pid);
    localStorage.setItem(LS_ROOM, code);
    localStorage.setItem(LS_PLAYER, pid);
  };

  const leave = () => {
    localStorage.removeItem(LS_ROOM);
    localStorage.removeItem(LS_PLAYER);
    setRoomCode("");
    setPlayerId("");
    setAmHost(false);
    setView("intro");
  };

  const copyCode = () => {
    copyToClipboard(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const goIntro = () => {
    setView("intro");
    setJoinCodeArr(["", "", "", ""]);
    setErr(null);
  };

  const updateJoinDigit = (index: number, raw: string) => {
    const ch = raw.replace(/[^a-zA-Z0-9]/g, "").slice(-1).toUpperCase();
    const next = [...joinCodeArr];
    next[index] = ch;
    setJoinCodeArr(next);
    if (ch && index < 3) codeInputRefs.current[index + 1]?.focus();
  };

  const onCodeKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !joinCodeArr[index] && index > 0) {
      e.preventDefault();
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const displayGlyph = (p: PlayerDoc): string => {
    if (p.id === playerId) return glyph;
    return (p.name?.[0] ?? "?").toUpperCase();
  };

  const startGame = () => run("startGame", { roomCode });

  const submitNight = () =>
    run("submitNightAction", {
      roomCode,
      action: nightAction,
      targetId: nightTarget || null,
      specialAction: nightSpecialAction,
    });

  const ROLE_NIGHT_DESCRIPTION: Record<string, string> = {
    lobisomem:    "Você sai para caçar. Escolha um alvo para eliminar — ou use a mordida para converter (uso único).",
    saci:         "Você rouba a habilidade de alguém esta noite, bloqueando sua ação na próxima.",
    mula:         "Você aterroriza alguém para silenciá-lo durante o dia.",
    boto:         "Você enfeitiça alguém para que não possa votar contra as criaturas.",
    iara:         "Você seduz alguém para roubar seu voto — ou usa a Voz Encantadora para eliminá-lo (uso único).",
    curupira:     "Você protege alguém das criaturas esta noite.",
    doutor:       "Você salva alguém de ser eliminado. Não pode repetir o mesmo alvo da noite anterior.",
    mae_de_santo: "Você invoca um jogador já eliminado para retornar por mais um dia.",
    geni:         "Você conversa com alguém e o sistema revela: morador ou criatura.",
    boitata:      "Você investiga alguém para descobrir seu lado.",
    cartomante:   "Você lê o destino de alguém para revelar se é morador ou criatura.",
    delegado:     "Você prende alguém — ele perde o voto no próximo dia e você descobre seu lado.",
    cangaceiro:   "Você consulta se a Geni já investigou seu alvo, preparando o Tiro Certo para o dia.",
  };

  const roleActionOptions = useMemo(() => {
    const r = myRole ?? "";
    const me = players.find((p) => p.id === playerId);
    if (r === "lobisomem") {
      const opts = [{ value: "eliminate", label: "eliminar" }];
      if (!me?.wolfBiteUsed) opts.push({ value: "bite", label: "morder (uso único)" });
      return opts;
    }
    if (r === "iara") return [
      { value: "seduce", label: "seduzir" },
      { value: "eliminate_special", label: "Voz Encantadora (uso único)" },
    ];
    const single: Record<string, { value: string; label: string }> = {
      saci:       { value: "steal",       label: "roubar habilidade" },
      mula:       { value: "terrorize",   label: "aterrorizar" },
      boto:       { value: "enchant",     label: "enfeitiçar" },
      curupira:   { value: "protect",     label: "proteger" },
      doutor:     { value: "save",        label: "salvar" },
      mae_de_santo: { value: "invoke",    label: "invocar" },
      geni:       { value: "converse",    label: "conversar" },
      boitata:    { value: "investigate", label: "investigar" },
      cartomante: { value: "investigate", label: "investigar" },
      delegado:   { value: "jail",        label: "prender" },
      cangaceiro: { value: "query",       label: "consultar" },
    };
    if (single[r]) return [single[r]];
    return [];
  }, [myRole, players, playerId]);

  useEffect(() => {
    setNightAction(roleActionOptions[0]?.value ?? "eliminate");
    setNightTarget("");
    setNightSpecialAction(null);
  }, [myRole, room?.round]);

  // ── Shared UI fragments ──

  const glyphPicker = (
    <div className="glyph-grid" role="group" aria-label="Símbolo do jogador">
      {AVATAR_GLYPHS.map((g) => (
        <button
          key={g}
          type="button"
          className={g === glyph ? "glyph-pick glyph-pick-active" : "glyph-pick"}
          onClick={() => setGlyph(g)}
        >
          {g}
        </button>
      ))}
    </div>
  );

  const stepper = (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        onClick={() => setExpected(Math.max(5, expected - 1))}
      >
        −
      </button>
      <span className="stepper-val">{expected}</span>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => setExpected(Math.min(20, expected + 1))}
      >
        +
      </button>
    </div>
  );

  // ── Connecting screen ──

  if (!uid) {
    return (
      <div className="page connecting-page">
        <div className="connecting-content">
          <div className="connecting-glyph">◆</div>
          <p className="connecting-text">conectando…</p>
          {err && <p className="error">{err}</p>}
        </div>
      </div>
    );
  }

  // ── Entry flow ──

  if (!roomCode) {
    if (view === "intro") {
      return (
        <div className="page">
          <div className="brand-center">
            <div className="brand-title">Folclore Oculto</div>
            <div className="brand-tagline">jogo de identidade social</div>
          </div>

          <div className="intro-body">
            <h2 className="h-display">
              Cada um no sertão,
              <br />
              todos na mesma noite.
            </h2>
            <p className="copy-muted">
              crie uma sala, divida o código com a turma e revele os segredos do
              folclore — em tempo real.
            </p>
          </div>

          <div className="spacer" />

          <div className="ctas">
            <button
              type="button"
              className="primary-btn"
              onClick={() => setView("create")}
            >
              <div className="btn-stack">
                <span className="btn-title">Criar uma sala</span>
                <span className="btn-sub">você vira o anfitrião da noite</span>
              </div>
              <span className="btn-arrow" aria-hidden>
                →
              </span>
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setJoinCodeArr(["", "", "", ""]);
                setView("join");
              }}
            >
              <div className="btn-stack">
                <span className="btn-title">Entrar com código</span>
                <span className="btn-sub">já recebeu o convite</span>
              </div>
              <span className="btn-arrow" aria-hidden>
                →
              </span>
            </button>
          </div>

          <div className="footer">
            <div className="deco-divider">
              <span className="deco-glyph">◆ ◆ ◆</span>
            </div>
          </div>
        </div>
      );
    }

    if (view === "create") {
      return (
        <div className="page">
          <div className="top-bar">
            <button type="button" className="back-link" onClick={goIntro}>
              ← voltar
            </button>
            <span className="session-label">nova sala</span>
            <span className="top-bar-spacer" />
          </div>

          <div className="form-layout">
            <div className="form-col-lead">
              <h2 className="h-display">
                Quem você é
                <br />
                nessa noite?
              </h2>
              <p className="copy-muted">
                você abre a porta — escolha como quer aparecer e chame a turma.
              </p>
            </div>
            <div className="form-col-fields">
              <label className="field-label" htmlFor="name-create">
                seu nome
              </label>
              <input
                id="name-create"
                className="field-input"
                placeholder="como quer ser chamado"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
              />
              <label className="field-label">símbolo</label>
              {glyphPicker}
              <label className="field-label">jogadores esperados</label>
              {stepper}
              {err && <p className="error">{err}</p>}
              <button
                type="button"
                className="primary-btn"
                disabled={loading || !name.trim()}
                onClick={createRoom}
              >
                <div className="btn-stack">
                  <span className="btn-title">
                    {loading ? "aguarda…" : "Abrir sala"}
                  </span>
                  <span className="btn-sub">geramos o código para você</span>
                </div>
                <span className="btn-arrow" aria-hidden>
                  →
                </span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (view === "join") {
      return (
        <div className="page">
          <div className="top-bar">
            <button type="button" className="back-link" onClick={goIntro}>
              ← voltar
            </button>
            <span className="session-label">entrar</span>
            <span className="top-bar-spacer" />
          </div>

          <div className="form-layout">
            <div className="form-col-lead">
              <h2 className="h-display">Qual o código?</h2>
              <p className="copy-muted">
                quatro letras ou números — como veio no convite.
              </p>
            </div>
            <div className="form-col-fields">
              <div className="code-input-row">
                {joinCodeArr.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      codeInputRefs.current[i] = el;
                    }}
                    className="code-cell"
                    value={digit}
                    onChange={(e) => updateJoinDigit(i, e.target.value)}
                    onKeyDown={(e) => onCodeKeyDown(i, e)}
                    maxLength={1}
                    inputMode="text"
                    autoCapitalize="characters"
                    aria-label={`Dígito ${i + 1} do código`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (view === "joinName") {
      return (
        <div className="page">
          <div className="top-bar">
            <button
              type="button"
              className="back-link"
              onClick={() => {
                setJoinCodeArr(["", "", "", ""]);
                setView("join");
              }}
            >
              ← voltar
            </button>
            <span className="session-label">quase lá</span>
            <span className="top-bar-spacer" />
          </div>

          <div className="form-layout">
            <div className="form-col-lead">
              <p className="code-preview">{joinCodeArr.join("")}</p>
              <p className="copy-muted">
                sala encontrada. agora é só dizer quem é você.
              </p>
            </div>
            <div className="form-col-fields">
              <label className="field-label" htmlFor="name-join">
                seu nome
              </label>
              <input
                id="name-join"
                className="field-input"
                placeholder="como quer ser chamado"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
              />
              <label className="field-label">símbolo</label>
              {glyphPicker}
              {err && <p className="error">{err}</p>}
              <button
                type="button"
                className="primary-btn"
                disabled={loading || !name.trim()}
                onClick={joinRoom}
              >
                <div className="btn-stack">
                  <span className="btn-title">
                    {loading ? "aguarda…" : "Entrar na sala"}
                  </span>
                  <span className="btn-sub">entrar na partida</span>
                </div>
                <span className="btn-arrow" aria-hidden>
                  →
                </span>
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  // ── Room flow ──

  // Show lobby immediately when roomCode is set — don't wait for Firestore snapshot.
  // Same pattern as Sips: local state drives the screen, server data fills in reactively.
  const inLobby = !room || room.status === "lobby";

  // amHost is set locally the moment createRoom returns, before room doc arrives.
  const effectiveIsHost = isHost || (amHost && !room);

  const canStart = effectiveIsHost && players.length >= 5;

  const hostCta = effectiveIsHost ? (
    <button
      type="button"
      className={canStart ? "primary-btn" : "primary-btn primary-btn-disabled"}
      disabled={loading || !canStart}
      onClick={startGame}
    >
      <div className="btn-stack">
        <span className="btn-title">
          {loading
            ? "iniciando…"
            : canStart
              ? "Começar a noite"
              : "Esperando jogadores"}
        </span>
        <span className="btn-sub">
          {canStart
            ? `${players.length} jogadores prontos`
            : `mínimo 5 · agora ${players.length}`}
        </span>
      </div>
      <span className="btn-arrow" aria-hidden>
        →
      </span>
    </button>
  ) : (
    <div className="waiting-host">
      <span className="dot-pulse" />
      aguardando o anfitrião iniciar o jogo…
    </div>
  );

  return (
    <div className="page">
      <div className="top-bar">
        <button type="button" className="back-link" onClick={leave}>
          ← sair
        </button>
        <span className="session-label">
          {inLobby ? "lobby" : `rodada ${room?.round ?? 1}`}
        </span>
        <span className="online-pill">
          <span className="dot-online" />
          {players.length}
        </span>
      </div>

      {err && <p className="error">{err}</p>}

      {inLobby && (
        <>
          <div className="lobby-content">
            <div className="code-section">
              <div className="code-card">
                <div className="code-card-label">código da sala</div>
                <div className="code-card-value">
                  {roomCode.split("").map((c, i) => (
                    <span key={i} className="code-letter">
                      {c}
                    </span>
                  ))}
                </div>
                <div className="code-card-row">
                  <button type="button" className="chip-btn" onClick={copyCode}>
                    {copied ? "✓ copiado" : "copiar"}
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() =>
                      navigator
                        .share?.({
                          title: "Folclore Oculto",
                          text: `entra na minha sala: ${roomCode}`,
                        })
                        .catch(() => {})
                    }
                  >
                    compartilhar
                  </button>
                </div>
                <div className="code-card-deco">◆ ◆ ◆</div>
              </div>
              <div className="cta-desktop">{hostCta}</div>
            </div>

            <div className="players-section">
              <div className="section-eyebrow">
                à volta da fogueira{" "}
                <span className="muted-label">
                  · {players.length} de {room?.expectedPlayerCount ?? "?"}
                </span>
              </div>

              {players.length === 0 && (
                <div className="waiting-host">
                  <span className="dot-pulse" />
                  carregando jogadores…
                </div>
              )}

              <div className="player-list">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className={
                      p.id === playerId
                        ? "player-row player-row-you"
                        : "player-row"
                    }
                  >
                    <div className="player-glyph">{displayGlyph(p)}</div>
                    <div className="player-text">
                      <div className="player-name">
                        {p.name}
                        {p.id === playerId && (
                          <span className="player-tag">você</span>
                        )}
                        {p.uid === room?.hostUid && (
                          <span className="player-tag player-tag-host">
                            anfitrião
                          </span>
                        )}
                      </div>
                      <div className="player-meta">
                        <span className="dot-online" />
                        conectado
                      </div>
                    </div>
                  </div>
                ))}
                {room && players.length < (room.expectedPlayerCount ?? 20) && (
                  <div className="player-row player-row-empty">
                    <div className="player-glyph player-glyph-empty">+</div>
                    <div className="player-text">
                      <div className="player-name player-name-muted">
                        vaga aberta
                      </div>
                      <div className="player-meta">
                        esperando alguém entrar…
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {effectiveIsHost && (
                <div className="host-expected">
                  <label className="field-label">vagas esperadas</label>
                  {stepper}
                  <button
                    type="button"
                    className="chip-btn"
                    disabled={loading || !room}
                    onClick={() =>
                      run("setExpectedPlayerCount", {
                        roomCode,
                        expectedPlayerCount: expected,
                      })
                    }
                  >
                    atualizar vagas
                  </button>
                  {players.length < 5 && (
                    <button
                      type="button"
                      className="chip-btn"
                      disabled={loading}
                      onClick={() =>
                        run("addBots", {
                          roomCode,
                          count: Math.max(1, 5 - players.length),
                        })
                      }
                    >
                      + preencher com bots
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="cta-mobile">{hostCta}</div>
        </>
      )}

      {room && room.status !== "lobby" && room.status !== "ended" && (
        <div className="game-card">
          <p>
            Fase: <strong>{room.status}</strong> · Rodada {room.round ?? 1}
          </p>
          {myRole && <p className="muted">Seu personagem: {myRole}</p>}

          {room.status === "night" && (() => {
            const myRoleIsPending = !!(myRole && room.nightPendingRoles?.includes(myRole));
            const needsAlignment = (myRole === "curupira" || myRole === "boitata") && room.round === 1;
            const targetPool = myRole === "mae_de_santo"
              ? players.filter((p) => p.eliminated || p.expelled)
              : players.filter((p) => p.id !== playerId && p.alive !== false && !p.eliminated && !p.expelled);
            const canSubmit = !loading && !!nightTarget && (!needsAlignment || !!nightSpecialAction);

            return (
              <div>
                {myRoleIsPending ? (
                  <>
                    {myRole && ROLE_NIGHT_DESCRIPTION[myRole] && (
                      <p className="muted" style={{ marginBottom: "0.5rem" }}>
                        {ROLE_NIGHT_DESCRIPTION[myRole]}
                      </p>
                    )}
                    {roleActionOptions.length > 1 && (
                      <>
                        <label>Ação</label>
                        <select value={nightAction} onChange={(e) => setNightAction(e.target.value)}>
                          {roleActionOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </>
                    )}
                    {needsAlignment && (
                      <>
                        <label>Seu alinhamento (rodada 1)</label>
                        <select value={nightSpecialAction ?? ""} onChange={(e) => setNightSpecialAction(e.target.value)}>
                          <option value="">escolha um lado…</option>
                          <option value="moradores">moradores</option>
                          <option value="criaturas">criaturas</option>
                        </select>
                      </>
                    )}
                    <label>Alvo</label>
                    <select value={nightTarget} onChange={(e) => setNightTarget(e.target.value)}>
                      <option value="">—</option>
                      {targetPool.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button type="button" disabled={!canSubmit} onClick={submitNight}>
                      Enviar ação
                    </button>
                  </>
                ) : (
                  <p className="muted">
                    {myRole && !["coronel", "padre", "aldeao", "bras_cubas"].includes(myRole)
                      ? "Ação enviada. Aguardando os outros…"
                      : "Você não tem ação noturna. Aguarde o amanhecer."}
                  </p>
                )}
              </div>
            );
          })()}

          {room.status === "day" && (
            <div>
              {(() => {
                const currentRound = room.round ?? 1;
                const nightTypes = ["death", "bite", "terror", "invocation", "dawn", "special"];
                const dawnEntries = publicLog.filter(
                  (e) => e.round === currentRound && nightTypes.includes(e.type ?? ""),
                );
                if (dawnEntries.length === 0) return null;
                return (
                  <div className="game-card log-card" style={{ marginBottom: "0.75rem" }}>
                    <strong>O que aconteceu esta noite</strong>
                    {dawnEntries.map((e) => (
                      <p key={e.id}>{e.message}</p>
                    ))}
                  </div>
                );
              })()}
              <div className="game-card log-card">
                <strong>Chat</strong>
                {chat.map((m) => (
                  <p key={m.id}>
                    <strong>{m.name}:</strong> {m.text}
                  </p>
                ))}
              </div>
              <div className="row">
                <input
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Mensagem…"
                />
                <button
                  type="button"
                  onClick={() =>
                    run("sendChatMessage", {
                      roomCode,
                      text: chatText,
                    }).then(() => setChatText(""))
                  }
                >
                  Enviar
                </button>
              </div>
              {(() => {
                const myPlayer = players.find((p) => p.id === playerId);
                const canVote =
                  myPlayer?.alive !== false &&
                  !myPlayer?.eliminated &&
                  !myPlayer?.expelled &&
                  !myPlayer?.seduced &&
                  !myPlayer?.jailed;
                if (!canVote)
                  return (
                    <p className="muted" style={{ marginTop: "0.75rem" }}>
                      Você não tem direito a voto nesta rodada.
                    </p>
                  );
                return (
                  <div style={{ marginTop: "0.75rem" }}>
                    <label>Seu voto</label>
                    <select
                      value={voteTarget}
                      onChange={(e) => setVoteTarget(e.target.value)}
                    >
                      <option value="">Nulo</option>
                      {players
                        .filter(
                          (p) =>
                            p.id !== playerId &&
                            p.alive !== false &&
                            !p.eliminated &&
                            !p.expelled,
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        run("submitVote", { roomCode, targetId: voteTarget || null })
                      }
                    >
                      Votar
                    </button>
                  </div>
                );
              })()}
              <div className="row" style={{ marginTop: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() =>
                    run("coronelStartAccusation", {
                      roomCode,
                      targetId: voteTarget,
                    })
                  }
                >
                  Coronel: acusação
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run("coronelAccusationVote", { roomCode, yes: true })
                  }
                >
                  Voto sim
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run("coronelAccusationVote", { roomCode, yes: false })
                  }
                >
                  Voto não
                </button>
              </div>
              <div className="row" style={{ marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() =>
                    run("cangaceiroTiroCerto", { roomCode, targetId: voteTarget })
                  }
                >
                  Cangaceiro: Tiro Certo
                </button>
                <button
                  type="button"
                  onClick={() => run("markSaciGorroOffer", { roomCode })}
                >
                  Saci: oferta Gorro
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run("saciGorroSwap", {
                      roomCode,
                      swapWithPlayerId: voteTarget,
                    })
                  }
                >
                  Saci: trocar com
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {room?.pendingBrasChoice && myRole === "bras_cubas" && (
        <div className="game-card">
          <p>Brás Cubas: escolha</p>
          <button
            type="button"
            onClick={() =>
              run("brasContinueChoice", { roomCode, endGame: true })
            }
          >
            Encerrar com vitória
          </button>
          <button
            type="button"
            onClick={() =>
              run("brasContinueChoice", { roomCode, endGame: false })
            }
          >
            Continuar como Aldeão
          </button>
        </div>
      )}

      {room?.status === "ended" && (
        <div className="game-card ended-card">
          <p className="ended-label">Fim de jogo</p>
          <p className="ended-winner">Vencedor: {String(room.winner)}</p>
          {isHost && (
            <button
              type="button"
              className="primary-btn"
              disabled={loading}
              style={{ marginTop: "1rem" }}
              onClick={() => run("restartGame", { roomCode })}
            >
              <div className="btn-stack">
                <span className="btn-title">{loading ? "reiniciando…" : "Recomeçar"}</span>
                <span className="btn-sub">volta ao lobby com os mesmos jogadores</span>
              </div>
              <span className="btn-arrow" aria-hidden>→</span>
            </button>
          )}
        </div>
      )}

      {isSpokesperson && (
        <div className="game-card log-card">
          <strong>Textos públicos (porta-voz)</strong>
          {publicLog.map((e) => (
            <p key={e.id}>{e.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}
