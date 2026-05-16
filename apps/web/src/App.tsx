import {
  geniConversedPlayerIds,
  normalizeGeniInvestigatedTargets,
  type RoleId,
} from "folclore-game-engine";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AuthModal } from "./components/AuthModal.js";
import { SaciGorroModal, type PendingGorro } from "./components/SaciGorroModal.js";
import { useAuth } from "./context/AuthContext.js";
import { auth, call } from "./firebase.js";
import {
  canShowCangaceiroTiro,
  canShowCoronelAccuse,
  hasPendingSaciGorro,
} from "./dayActions.js";
import {
  ROLE_DISPLAY,
  ROLE_LORE,
  ROLE_NIGHT_DESCRIPTION,
  RoleLoreContent,
} from "./lib/roleStories.js";
import { useChat } from "./hooks/useChat.js";
import { useDayVotes } from "./hooks/useDayVotes.js";
import { useGameEndHistory } from "./hooks/useGameEndHistory.js";
import { useMyRole } from "./hooks/useMyRole.js";
import { usePlayersCollection } from "./hooks/usePlayersCollection.js";
import { usePrivateLog } from "./hooks/usePrivateLog.js";
import { usePublicLog } from "./hooks/usePublicLog.js";
import { useRoomDocument } from "./hooks/useRoomDocument.js";
import { useAllSecrets } from "./hooks/useAllSecrets.js";
import { isLocalDebug } from "./debug/isLocalDebug.js";
import { DEBUG_ROLE_LABELS } from "./debug/roleOptions.js";
import { mapCallableError } from "./lib/callableErrors.js";
import { canBeExpulsionVoteTarget, canSubmitExpulsionVote } from "./lib/playerVote.js";
import type { PlayerDoc, RoomDoc, View } from "./types.js";
import { BtnSpinner } from "./components/BtnSpinner.js";
import { EndScreen } from "./components/screens/EndScreen.js";
import { MinhaContaScreen } from "./components/screens/MinhaContaScreen.js";
import {
  closeAccountToHome,
  migrateAccountHashToPathname,
  navigateAccount,
  readAccountRoute,
  isMinhaContaPathname,
  type AccountTab,
} from "./lib/accountRoute.js";
import { useMyPlayerPrivate } from "./hooks/useMyPlayerPrivate.js";

function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

const LS_ROOM = "folclore_roomCode";
const LS_PLAYER = "folclore_playerId";
const LS_GLYPH = "folclore_glyph";

const AVATAR_GLYPHS = ["☽", "✦", "◆", "❖", "✧", "☆", "★", "◉"];

const DebugIntroChromeLazy = lazy(() => import("./debug/DebugIntroChrome.js"));
const DebugGameChromeLazy = lazy(() => import("./debug/DebugGameChrome.js"));

export function App() {
  const { user, authReady, signOutUser } = useAuth();
  const uid = user?.uid ?? null;
  const [err, setErr] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const anyPending = pendingAction !== null;
  const busy = (key: string) => pendingAction === key;
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem(LS_ROOM) ?? "");
  const [playerId, setPlayerId] = useState(() => localStorage.getItem(LS_PLAYER) ?? "");
  const [name, setName] = useState("");
  const [expected, setExpected] = useState(5);
  const room = useRoomDocument(roomCode);
  const players = usePlayersCollection(roomCode);
  const secretsEnabled = Boolean(isLocalDebug() && roomCode && room?.debug === true);
  const debugSecrets = useAllSecrets(roomCode, secretsEnabled);
  const myRole = useMyRole(roomCode, playerId);
  const publicLog = usePublicLog(roomCode);
  const privateLog = usePrivateLog(roomCode, playerId);
  const chat = useChat(roomCode, room?.status === "day");
  const dayRoundVotes = useDayVotes(roomCode, room);
  const { allRoundVotes, allNightActions, historyLoaded } = useGameEndHistory(roomCode, room);
  const [chatText, setChatText] = useState("");
  const [voteTarget, setVoteTarget] = useState<string>("");
  const [nightTarget, setNightTarget] = useState<string>("");
  const [nightAction, setNightAction] = useState("eliminate");
  const [nightSpecialAction, setNightSpecialAction] = useState<string | null>(null);
  const [nightActionSent, setNightActionSent] = useState(false);
  const [dayActionSent, setDayActionSent] = useState<string | null>(null);
  /** Coronel: primeiro clique arma acusação formal (desabilita voto); segundo confirma. */
  const [coronelAccusationArmed, setCoronelAccusationArmed] = useState(false);
  const [loreOpen, setLoreOpen] = useState(false);
  const [brasChosenRole, setBrasChosenRole] = useState("aldeao");
  const [cangConsultTarget, setCangConsultTarget] = useState("");
  const [tiroCertoTarget, setTiroCertoTarget] = useState("");
  const [tiroPreview, setTiroPreview] = useState<{ consulted: boolean; hint?: string } | null>(null);
  const [accountRoute, setAccountRoute] = useState<{ open: boolean; tab: AccountTab }>(() =>
    typeof window !== "undefined" ? readAccountRoute() : { open: false, tab: "estatisticas" },
  );
  const [suspicionTarget, setSuspicionTarget] = useState("");
  const [suspicionSent, setSuspicionSent] = useState(false);

  // Entry flow
  const [view, setView] = useState<View>("intro");
  const [glyph, setGlyph] = useState(() => localStorage.getItem(LS_GLYPH) ?? "☽");
  const [joinCodeArr, setJoinCodeArr] = useState(["", "", "", ""]);
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);
  const [copied, setCopied] = useState(false);
  // tracks locally whether the current user created the room (avoids waiting for Firestore)
  const [amHost, setAmHost] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const postAuthTarget = useRef<"create" | "join" | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const [debugSetupOpen, setDebugSetupOpen] = useState(false);
  const [debugSidebarOpen, setDebugSidebarOpen] = useState(false);

  const myPrivate = useMyPlayerPrivate(roomCode, playerId || undefined);

  const refreshAccountRoute = useCallback(() => {
    setAccountRoute(readAccountRoute());
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    migrateAccountHashToPathname();
    if (authReady && !user && isMinhaContaPathname(window.location.pathname)) {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new Event("folhetim-route"));
      setAuthModalOpen(true);
    }
    refreshAccountRoute();
  }, [authReady, user, refreshAccountRoute]);

  useEffect(() => {
    const onRoute = () => refreshAccountRoute();
    window.addEventListener("popstate", onRoute);
    window.addEventListener("folhetim-route", onRoute);
    return () => {
      window.removeEventListener("popstate", onRoute);
      window.removeEventListener("folhetim-route", onRoute);
    };
  }, [refreshAccountRoute]);

  useEffect(() => {
    if (!isLocalDebug()) return;
    const toggle = () => {
      if (!roomCode) {
        setDebugSetupOpen((prev) => !prev);
      } else if (room?.debug === true) {
        setDebugSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener("folhetim-debug-toggle", toggle);
    return () => window.removeEventListener("folhetim-debug-toggle", toggle);
  }, [roomCode, room?.debug]);

  useEffect(() => {
    setNightActionSent(false);
    setSuspicionSent(false);
    setSuspicionTarget("");
  }, [room?.status, room?.round]);

  useEffect(() => {
    if (!authReady || user) return;
    if (roomCode || playerId) {
      localStorage.removeItem(LS_ROOM);
      localStorage.removeItem(LS_PLAYER);
      setRoomCode("");
      setPlayerId("");
      setAmHost(false);
      setView("intro");
    }
  }, [authReady, user, roomCode, playerId]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onDoc = (ev: MouseEvent) => {
      if (userMenuRef.current?.contains(ev.target as Node)) return;
      setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [userMenuOpen]);

  useEffect(() => {
    if ((view !== "create" && view !== "joinName") || !user) return;
    const hint = (user.displayName ?? "").trim().slice(0, 20);
    if (!hint) return;
    setName((prev) => (prev.trim() ? prev : hint));
  }, [view, user]);

  useEffect(() => {
    if (room?.status === "day" && Number(room.round ?? 1) === 1) {
      setLoreOpen(false);
    }
  }, [room?.status, room?.round]);

  useEffect(() => {
    if (room?.status !== "day") return;
    setVoteTarget("");
  }, [roomCode, room?.votesRound, room?.round, room?.status]);

  // Sync local stepper with Firestore whenever the room doc changes
  useEffect(() => {
    if (room?.expectedPlayerCount) {
      setExpected(Number(room.expectedPlayerCount));
    }
  }, [room?.expectedPlayerCount]);

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

  const formatDebugPlayerOpt = useCallback(
    (p: PlayerDoc) => {
      const label = p.name ?? "?";
      const id = p.id;
      if (!id || room?.debug !== true || room?.debugShowAllRoles !== true) return label;
      const rr = debugSecrets[id]?.role as RoleId | undefined;
      if (!rr) return label;
      return `${label} — ${DEBUG_ROLE_LABELS[rr] ?? rr}`;
    },
    [room?.debug, room?.debugShowAllRoles, debugSecrets],
  );

  const run = useCallback(
    async (
      fnName: string,
      data: Record<string, unknown>,
      pendingKey: string = fnName,
    ) => {
      setErr(null);
      setPendingAction(pendingKey);
      try {
        const c = call(fnName);
        const res = await c({ playerId, ...data });
        return res.data as Record<string, unknown>;
      } catch (e: unknown) {
        setErr(mapCallableError(e));
        throw e;
      } finally {
        setPendingAction(null);
      }
    },
    [playerId],
  );

  const fillBots = useCallback(async () => {
    setErr(null);
    setPendingAction("fillBots");
    try {
      if (Number(room?.expectedPlayerCount) !== expected) {
        await call("setExpectedPlayerCount")({
          playerId,
          roomCode,
          expectedPlayerCount: expected,
        });
      }
      await call("addBots")({
        playerId,
        roomCode,
        count: Math.max(1, Math.min(expected, 10) - players.length),
      });
    } catch (e: unknown) {
      setErr(mapCallableError(e));
    } finally {
      setPendingAction(null);
    }
  }, [playerId, roomCode, room?.expectedPlayerCount, expected, players.length]);

  const createRoom = async () => {
    localStorage.setItem(LS_GLYPH, glyph);
    try {
      const r = await run("createRoom", { name, expectedPlayerCount: expected }, "createRoom");
      setAmHost(true);
      const code = String(r.roomCode ?? "");
      const pid = String(r.playerId ?? "");
      setRoomCode(code);
      setPlayerId(pid);
      localStorage.setItem(LS_ROOM, code);
      localStorage.setItem(LS_PLAYER, pid);
    } catch {
      setAmHost(false);
    }
  };

  const joinRoom = async () => {
    localStorage.setItem(LS_GLYPH, glyph);
    const code = joinCodeArr.join("").toUpperCase().trim();
    try {
      const r = await run("joinRoom", { roomCode: code, name }, "joinRoom");
      const pid = String(r.playerId ?? "");
      setRoomCode(code);
      setPlayerId(pid);
      localStorage.setItem(LS_ROOM, code);
      localStorage.setItem(LS_PLAYER, pid);
    } catch {
      /* setErr em run */
    }
  };

  const leave = () => {
    localStorage.removeItem(LS_ROOM);
    localStorage.removeItem(LS_PLAYER);
    setRoomCode("");
    setPlayerId("");
    setAmHost(false);
    setView("intro");
    setDebugSetupOpen(false);
    setDebugSidebarOpen(false);
  };

  const handleDebugEntered = useCallback((code: string, pid: string) => {
    const normalized = code.toUpperCase().trim();
    setRoomCode(normalized);
    setPlayerId(pid);
    setAmHost(true);
    localStorage.setItem(LS_ROOM, normalized);
    localStorage.setItem(LS_PLAYER, pid);
    setErr(null);
    setDebugSetupOpen(false);
  }, []);

  const copyCode = () => {
    copyToClipboard(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const goIntro = () => {
    setView("intro");
    setJoinCodeArr(["", "", "", ""]);
    setErr(null);
    setAuthModalOpen(false);
    postAuthTarget.current = null;
    setUserMenuOpen(false);
  };

  const handleAuthSuccess = () => {
    setAuthModalOpen(false);
    const t = postAuthTarget.current;
    postAuthTarget.current = null;
    const u = auth.currentUser;
    const hint = (u?.displayName ?? "").trim().slice(0, 20);
    if (hint) setName((prev) => (prev.trim() ? prev : hint));
    if (t === "create") setView("create");
    else if (t === "join") setView("join");
  };

  const handleLandingSignOut = async () => {
    setUserMenuOpen(false);
    try {
      await signOutUser();
      if (typeof window !== "undefined" && isMinhaContaPathname(window.location.pathname)) {
        closeAccountToHome();
      }
      leave();
    } catch {
      setErr("Algo deu errado. Tente novamente.");
    }
  };

  const landingUserInitials = (): string => {
    const dn = (user?.displayName ?? "").trim();
    if (dn) {
      const parts = dn.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
      return dn.slice(0, 2).toUpperCase();
    }
    const em = (user?.email ?? "").trim();
    if (em) return em.slice(0, 2).toUpperCase();
    return "?";
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

  const startGame = () => {
    void run("startGame", { roomCode }, "startGame").catch(() => {});
  };

  const roleActionOptions = useMemo(() => {
    const r = myRole ?? "";
    const me = players.find((p) => p.id === playerId);
    if (r === "lobisomem") {
      const opts = [{ value: "eliminate", label: "eliminar" }];
      if (!me?.wolfBiteUsed) opts.push({ value: "bite", label: "morder (uso único)" });
      return opts;
    }
    if (r === "iara") {
      const round = Number(room?.round ?? 1);
      const voiceUsed = me?.iaraSeductionBlockedThroughRound != null;
      const seductionBlocked = voiceUsed && round <= Number(me!.iaraSeductionBlockedThroughRound);
      const opts: { value: string; label: string }[] = [];
      if (!seductionBlocked) opts.push({ value: "seduce", label: "seduzir" });
      if (!voiceUsed) opts.push({ value: "eliminate_special", label: "Voz Encantadora (uso único)" });
      return opts;
    }
    if (r === "mula") {
      const opts = [{ value: "terrorize", label: "aterrorizar" }];
      if (!me?.mulaExorcizeUsed) opts.push({ value: "exorcize", label: "Exorcismo da Vingança (uso único)" });
      return opts;
    }
    if (r === "geni") {
      const opts: { value: string; label: string }[] = [{ value: "converse", label: "conversar" }];
      if (!me?.geniCharmUsed) opts.push({ value: "charm", label: "Charme de Verdade (uso único)" });
      opts.push({ value: "pass", label: "passar (sem conversar nem charme)" });
      return opts;
    }
    if (r === "delegado") {
      return [
        { value: "jail", label: "prender" },
        { value: "pass", label: "passar (sem prisão)" },
      ];
    }
    const round = Number(room?.round ?? 1);
    if (r === "cartomante") {
      const opts = [{ value: "investigate", label: "investigar" }];
      if (round > 1) opts.push({ value: "pass", label: "passar (sem investigar)" });
      return opts;
    }
    if (r === "boitata") {
      const opts = [{ value: "investigate", label: "investigar" }];
      if (round > 1) opts.push({ value: "pass", label: "passar (sem investigar)" });
      return opts;
    }
    const single: Record<string, { value: string; label: string }> = {
      saci:       { value: "steal",       label: "roubar habilidade" },
      boto:       { value: "enchant",     label: "enfeitiçar" },
      curupira:   { value: "protect",     label: "proteger" },
      padre:      { value: "catechize",   label: "catequizar" },
    };
    if (r === "doutor") {
      return [
        { value: "save", label: "salvar" },
        { value: "pass", label: "passar (não salvar ninguém)" },
      ];
    }
    if (r === "mae_de_santo") {
      return [
        { value: "invoke", label: "invocar" },
        { value: "pass", label: "passar (sem invocar)" },
      ];
    }
    if (single[r]) return [single[r]];
    return [];
  }, [myRole, players, playerId, room?.round]);

  useEffect(() => {
    setNightAction(roleActionOptions[0]?.value ?? "eliminate");
    setNightTarget("");
    setNightSpecialAction(null);
    setNightActionSent(false);
    setDayActionSent(null);
    setCoronelAccusationArmed(false);
    setCangConsultTarget("");
    setTiroCertoTarget("");
    setTiroPreview(null);
  }, [myRole, room?.round, room?.status]);

  useEffect(() => {
    if (room?.round === 1 && room?.status === "night") setLoreOpen(true);
  }, [room?.round, room?.status]);

  useEffect(() => {
    if (room?.status !== "night") return;
    const passRoles = ["geni", "doutor", "mae_de_santo", "cartomante", "boitata", "delegado"] as const;
    if (myRole && (passRoles as readonly string[]).includes(myRole) && nightAction === "pass") {
      setNightTarget("");
      setNightSpecialAction(null);
    }
  }, [nightAction, myRole, room?.status]);

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

  if (!authReady) {
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

  if (user && accountRoute.open) {
    return (
      <>
        <MinhaContaScreen
          user={user}
          tab={accountRoute.tab}
          onClose={() => closeAccountToHome()}
          onSignOut={async () => {
            try {
              await signOutUser();
              closeAccountToHome();
              leave();
            } catch {
              setErr("Algo deu errado. Tente novamente.");
            }
          }}
        />
        <AuthModal
          open={authModalOpen}
          onClose={() => {
            setAuthModalOpen(false);
            postAuthTarget.current = null;
          }}
          onSuccess={handleAuthSuccess}
        />
      </>
    );
  }

  // ── Entry flow ──

  if (!roomCode) {
    const authModal = (
      <AuthModal
        open={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          postAuthTarget.current = null;
        }}
        onSuccess={handleAuthSuccess}
      />
    );
    const debugLandingChrome = isLocalDebug() ? (
      <Suspense fallback={null}>
        <DebugIntroChromeLazy
          panelOpen={debugSetupOpen}
          onPanelOpenChange={setDebugSetupOpen}
          onEntered={handleDebugEntered}
          onApiError={setErr}
        />
      </Suspense>
    ) : null;
    if (view === "intro") {
      return (
        <>
          <div className="page page--landing">
            <div className="landing-user-corner">
              {user && (
                <div
                  className={`landing-user-menu-wrap${userMenuOpen ? " is-open" : ""}`}
                  ref={userMenuRef}
                >
                  <button
                    type="button"
                    className="landing-user-trigger"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setUserMenuOpen((o) => !o)}
                  >
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="landing-user-avatar" />
                    ) : (
                      <span className="landing-user-initials">{landingUserInitials()}</span>
                    )}
                  </button>
                  {userMenuOpen && (
                    <div className="landing-user-dropdown" role="menu">
                      <button
                        type="button"
                        className="landing-user-dropdown-item"
                        role="menuitem"
                        onClick={() => {
                          navigateAccount("estatisticas");
                          setUserMenuOpen(false);
                        }}
                      >
                        Minha conta
                      </button>
                      <button
                        type="button"
                        className="landing-user-dropdown-item"
                        role="menuitem"
                        onClick={() => {
                          navigateAccount("favoritos");
                          setUserMenuOpen(false);
                        }}
                      >
                        Favoritos
                      </button>
                      <button
                        type="button"
                        className="landing-user-dropdown-item"
                        role="menuitem"
                        onClick={() => {
                          navigateAccount("ranking");
                          setUserMenuOpen(false);
                        }}
                      >
                        Ranking
                      </button>
                      <div className="landing-user-dropdown-divider" role="separator" />
                      <button
                        type="button"
                        className="landing-user-dropdown-item"
                        role="menuitem"
                        onClick={() => void handleLandingSignOut()}
                      >
                        Sair
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="intro-top-deco" aria-hidden="true">
            <div className="deco-divider">
              <span className="deco-glyph">◆ ◆ ◆</span>
            </div>
          </div>
          <div className="brand-center">
            <div className="brand-title">Folhetim de Bucaré</div>
          </div>

          <div className="intro-body">
            <div className="intro-cordel" lang="pt-BR">
              <p>
                Noite longa no sertão
                <br />
                O calor não é da rua
                <br />
                Quem assombra meu portão
                <br />
                Tem apreço pela lua.
                <br />
                A magia dessa gente
                <br />
                Tem poder inconsequente!
              </p>
              <p>
                Senti um calor no couro
                <br />
                Tão perto passou a mula!
                <br />
                E com grito da Iara
                <br />
                Rio arrasta quem não cura!
                <br />
                E o lobo dessa terra
                <br />
                Foi vizinho, virou fera!
              </p>
              <p>
                Nessa noite de mistério
                <br />
                Quem se vai e quem que fica?
                <br />
                Vai ser no alvorecer
                <br />
                Que resolve a intriga
                <br />
                Se eu vivo ou se me vô
                <br />
                Pr'outro mundo, que horrô!
              </p>
            </div>
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
              onClick={() => {
                if (!user) {
                  postAuthTarget.current = "create";
                  setAuthModalOpen(true);
                  return;
                }
                setView("create");
              }}
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
                if (!user) {
                  postAuthTarget.current = "join";
                  setAuthModalOpen(true);
                  return;
                }
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
          {debugLandingChrome}
          {authModal}
        </>
      );
    }

    if (view === "create") {
      return (
        <>
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
                disabled={anyPending || !name.trim() || !uid}
                onClick={createRoom}
              >
                <div className="btn-stack">
                  <span className="btn-title btn-title-row">
                    {busy("createRoom") ? "aguarda…" : "Abrir sala"}
                    <BtnSpinner show={busy("createRoom")} />
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
        {debugLandingChrome}
        {authModal}
        </>
      );
    }

    if (view === "join") {
      return (
        <>
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
        {debugLandingChrome}
        {authModal}
        </>
      );
    }

    if (view === "joinName") {
      return (
        <>
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
                disabled={anyPending || !name.trim() || !uid}
                onClick={joinRoom}
              >
                <div className="btn-stack">
                  <span className="btn-title btn-title-row">
                    {busy("joinRoom") ? "aguarda…" : "Entrar na sala"}
                    <BtnSpinner show={busy("joinRoom")} />
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
        {debugLandingChrome}
        {authModal}
        </>
      );
    }
  }

  // ── Room flow ──

  // Show lobby immediately when roomCode is set — don't wait for Firestore snapshot.
  // Same pattern as Sips: local state drives the screen, server data fills in reactively.
  const inLobby = !room || room.status === "lobby";

  // amHost is set locally the moment createRoom returns, before room doc arrives.
  const effectiveIsHost = isHost || (amHost && !room);

  const canStart = effectiveIsHost && players.length >= 5 && players.length >= expected;

  const hostCta = effectiveIsHost ? (
    <button
      type="button"
      className={canStart ? "primary-btn" : "primary-btn primary-btn-disabled"}
      disabled={anyPending || !canStart}
      onClick={startGame}
    >
      <div className="btn-stack">
        <span className="btn-title btn-title-row">
          {busy("startGame")
            ? "iniciando…"
            : canStart
              ? "Começar a noite"
              : "Esperando jogadores"}
          <BtnSpinner show={busy("startGame")} />
        </span>
        <span className="btn-sub">
          {canStart
            ? `${players.length} jogadores prontos`
            : players.length < 5
              ? `mínimo 5 · agora ${players.length}`
              : `${players.length} de ${room?.expectedPlayerCount ?? 5} — preencha as vagas`}
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

  const isDebugSession = !!(room && isLocalDebug() && room.debug === true);

  return (
    <>
      {isDebugSession && room && (
        <Suspense fallback={null}>
          <DebugGameChromeLazy
            roomCode={roomCode}
            room={room}
            players={players}
            secrets={debugSecrets}
            sidebarOpen={debugSidebarOpen}
            onSidebarToggle={() => setDebugSidebarOpen((prev) => !prev)}
            onCallableError={(m) => setErr(m)}
          />
        </Suspense>
      )}
      <div className={`page${isDebugSession ? " page--debug" : ""}`}>
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
        {user && (
          <button
            type="button"
            className="back-link"
            style={{ marginLeft: "auto" }}
            onClick={() => {
              navigateAccount("ranking");
            }}
          >
            Ranking
          </button>
        )}
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
                          title: "Folhetim de Bucaré",
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
                    className="chip-btn chip-btn--with-spinner"
                    disabled={anyPending || !room}
                    onClick={() =>
                      void run("setExpectedPlayerCount", {
                        roomCode,
                        expectedPlayerCount: expected,
                      }, "setExpected").catch(() => {})
                    }
                  >
                    atualizar vagas
                    <BtnSpinner show={busy("setExpected")} />
                  </button>
                  {players.length < Math.min(expected, 10) && (
                    <button
                      type="button"
                      className="chip-btn chip-btn--with-spinner"
                      disabled={anyPending}
                      onClick={fillBots}
                    >
                      + preencher com bots ({Math.min(expected, 10) - players.length} vagas)
                      <BtnSpinner show={busy("fillBots")} />
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
            <strong>
              {room.status === "day"
                ? `Dia ${room.round ?? 1}`
                : room.status === "night"
                  ? `Noite ${room.round ?? 1}`
                  : `Rodada ${room.round ?? 1}`}
            </strong>
          </p>
          {typeof room.maxRounds === "number" && room.maxRounds > 0 && (
            <p className="muted" style={{ marginTop: "0.35rem", lineHeight: 1.45 }}>
              <strong>Lua cheia:</strong> rodada atual <strong>{room.round ?? 1}</strong> — o relógio da cidade
              permite até <strong>{room.maxRounds}</strong> rodadas numeradas. Se, após um amanhecer, a rodada
              passar de <strong>{room.maxRounds}</strong>, o folclore vence na hora (vitória coletiva das
              criaturas), mesmo com moradores vivos.
            </p>
          )}
          {myRole && <p className="muted">Seu personagem: {ROLE_DISPLAY[myRole] ?? myRole}</p>}

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

          {room.status === "night" && (() => {
            const meNight = players.find((p) => p.id === playerId);
            const myRoleIsPending = !!(myRole && room.nightPendingRoles?.includes(myRole));
            const needsAlignment =
              (myRole === "curupira" || myRole === "boitata") &&
              room.round === 1 &&
              Number(room.gameTablePlayerCount) !== 5;
            const targetPool = myRole === "mae_de_santo"
              ? players.filter((p) => p.eliminated && !p.expelled)
              : players.filter((p) => p.id !== playerId && p.alive !== false && !p.eliminated && !p.expelled);
            const needsJailReason = myRole === "delegado" && nightAction === "jail";
            const delegadoPass = myRole === "delegado" && nightAction === "pass";
            const nightRolePass =
              nightAction === "pass" &&
              (myRole === "geni" ||
                myRole === "doutor" ||
                myRole === "mae_de_santo" ||
                myRole === "cartomante" ||
                myRole === "boitata");
            const hideNightTarget = delegadoPass || nightRolePass;
            let canSubmit = false;
            if (!anyPending) {
              if (delegadoPass || nightRolePass) canSubmit = true;
              else if (myRole === "delegado" && nightAction === "jail") {
                canSubmit = !!nightTarget && !!nightSpecialAction?.trim();
              } else {
                canSubmit =
                  !!nightTarget &&
                  (!needsAlignment || !!nightSpecialAction) &&
                  (!needsJailReason || !!nightSpecialAction?.trim());
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

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {showCangConsult && (
                  <div className="game-card" style={{ alignSelf: "stretch" }}>
                    <p className="muted" style={{ marginTop: 0 }}>
                      Consultar se a Geni investigou alguém? (opcional — não gasta o Tiro Certo)
                    </p>
                    <label className="field-label">Jogador</label>
                    <select
                      className="vote-select"
                      value={cangConsultTarget}
                      onChange={(e) => setCangConsultTarget(e.target.value)}
                    >
                      <option value="">— escolher —</option>
                      {players
                        .filter((p) => p.id !== playerId && p.alive !== false && !p.eliminated && !p.expelled)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {formatDebugPlayerOpt(p)}
                          </option>
                        ))}
                    </select>
                    <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
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
                          {busy("cangConsult") ? "enviando…" : "Enviar consulta"}
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
                          {busy("cangPass") ? "…" : "Passar"}
                          <BtnSpinner show={busy("cangPass")} />
                        </span>
                      </button>
                    </div>
                  </div>
                )}
                {myRoleIsPending ? (
                  <>
                    {myRole && ROLE_NIGHT_DESCRIPTION[myRole] && (
                      <p className="muted" style={{ margin: 0 }}>
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
                    {hideNightTarget && (
                      <p className="muted" style={{ margin: 0 }}>
                        {delegadoPass
                          ? "Prender é opcional. Você não pode prender a mesma pessoa em duas noites seguidas."
                          : "Sem alvo esta noite — sua vez será concluída e a noite poderá seguir."}
                      </p>
                    )}
                    {needsJailReason && (
                      <>
                        <label>Motivo da prisão (será lido publicamente)</label>
                        <input
                          type="text"
                          placeholder="ex: comportamento suspeito na última noite"
                          value={nightSpecialAction ?? ""}
                          onChange={(e) => setNightSpecialAction(e.target.value)}
                          maxLength={120}
                        />
                      </>
                    )}
                    {!hideNightTarget && (
                      <>
                        <label>Alvo</label>
                        <select value={nightTarget} onChange={(e) => setNightTarget(e.target.value)}>
                          <option value="">—</option>
                          {filteredTargetPool.map((p) => (
                            <option key={p.id} value={p.id}>{formatDebugPlayerOpt(p)}</option>
                          ))}
                        </select>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={!canSubmit || anyPending || nightActionSent}
                      className={nightActionSent ? "vote-sent" : undefined}
                      style={{ marginTop: "4px" }}
                      onClick={() =>
                        void run(
                          "submitNightAction",
                          {
                            roomCode,
                            action: nightAction,
                            targetId: nightTarget || null,
                            specialAction: nightSpecialAction,
                          },
                          "nightAction",
                        )
                          .then(() => setNightActionSent(true))
                          .catch(() => {})
                      }
                    >
                      <span className="btn-with-spinner">
                        {busy("nightAction")
                          ? "enviando…"
                          : nightActionSent
                            ? "✓ Ação registrada"
                            : "Enviar ação"}
                        <BtnSpinner show={busy("nightAction")} />
                      </span>
                    </button>
                  </>
                ) : (
                  <>
                    <p className="muted" style={{ margin: 0 }}>
                      {myRole === "cangaceiro"
                        ? "A consulta acima é opcional. Quando quiser, confirme o Toque da alvorada para amanhecer."
                        : myRole && !["coronel", "aldeao", "bras_cubas"].includes(myRole)
                          ? "Ação enviada. Aguardando os outros…"
                          : "Você não tem ação noturna. Aguarde o amanhecer."}
                    </p>
                    {canMarkNightReady && (
                      <button
                        type="button"
                        disabled={anyPending || nightActionSent}
                        className={nightActionSent ? "vote-sent" : undefined}
                        onClick={() =>
                          void run("markNightReady", { roomCode }, "markNightReady")
                            .then(() => setNightActionSent(true))
                            .catch(() => {})
                        }
                      >
                        <span className="btn-with-spinner">
                          {busy("markNightReady")
                            ? "enviando…"
                            : nightActionSent
                              ? "✓ Toque da alvorada enviado"
                              : "Toque da alvorada"}
                          <BtnSpinner show={busy("markNightReady")} />
                        </span>
                      </button>
                    )}
                  </>
                )}
                {showSuspicion && (
                  <div className="game-card">
                    <p className="muted" style={{ marginTop: 0 }}>
                      Sua suspeita desta noite (opcional). Só você vê — ninguém mais na sala tem acesso.
                    </p>
                    {(myRole === "cartomante" ||
                      myRole === "boitata" ||
                      myRole === "geni") &&
                      (myPrivate?.investigationTargetsUsed?.length ||
                        (myRole === "geni" &&
                          geniConversedPlayerIds(
                            normalizeGeniInvestigatedTargets(room.geniInvestigatedTargets),
                          ).length > 0)) && (
                      <p className="muted" style={{ fontSize: "0.85rem" }}>
                        Alvos já usados em investigação/prisão/conversa (não podem repetir):{" "}
                        {(myRole === "geni"
                          ? geniConversedPlayerIds(
                              normalizeGeniInvestigatedTargets(room.geniInvestigatedTargets),
                            )
                          : myPrivate?.investigationTargetsUsed
                        )?.map((id: string) => players.find((x) => x.id === id)?.name ?? id)
                          .join(", ")}
                      </p>
                    )}
                    <label className="field-label">Desconfio de:</label>
                    <select
                      className="vote-select"
                      value={suspicionTarget}
                      onChange={(e) => setSuspicionTarget(e.target.value)}
                    >
                      <option value="">— ninguém / passar —</option>
                      {targetPool.map((p) => (
                        <option key={p.id} value={p.id}>
                          {formatDebugPlayerOpt(p)}
                        </option>
                      ))}
                    </select>
                    <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="chip-btn chip-btn--with-spinner"
                        disabled={anyPending || suspicionSent || busy("suspicionPass")}
                        onClick={() =>
                          void run("submitNightSuspicion", { roomCode, pass: true }, "suspicionPass")
                            .then(() => setSuspicionSent(true))
                            .catch(() => {})
                        }
                      >
                        <span className="btn-with-spinner">
                          {busy("suspicionPass") ? "…" : "Passar"}
                          <BtnSpinner show={busy("suspicionPass")} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="chip-btn chip-btn--with-spinner"
                        disabled={anyPending || !suspicionTarget || suspicionSent || busy("suspicionSend")}
                        onClick={() =>
                          void run(
                            "submitNightSuspicion",
                            { roomCode, targetId: suspicionTarget },
                            "suspicionSend",
                          )
                            .then(() => setSuspicionSent(true))
                            .catch(() => {})
                        }
                      >
                        <span className="btn-with-spinner">
                          {busy("suspicionSend") ? "enviando…" : "Confirmar suspeita"}
                          <BtnSpinner show={busy("suspicionSend")} />
                        </span>
                      </button>
                    </div>
                    {suspicionSent && <p className="muted">✓ Registrado para o amanhecer.</p>}
                  </div>
                )}
              </div>
            );
          })()}

          {room.status === "day" && (() => {
            const myPlayer = players.find((p) => p.id === playerId);
            const currentRound = room.round ?? 1;
            const isNightPublicSpecial = (e: { message?: string }) => {
              const m = String(e.message ?? "");
              return m.startsWith("Alinhamento (1ª noite):") || m.includes("Mesa de cinco: por regra do cordel");
            };
            const dawnEntries = publicLog.filter((e) => {
              if (e.round !== currentRound) return false;
              const t = e.type ?? "";
              if (["death", "bite", "terror", "invocation", "dawn"].includes(t)) return true;
              return t === "special" && isNightPublicSpecial(e);
            });
            const dayFolhetimOutcomes = publicLog.filter((e) => {
              if (e.round !== currentRound) return false;
              const t = e.type ?? "";
              if (t === "expulsion") return true;
              return t === "special" && !isNightPublicSpecial(e);
            });
            const hasDeathOrElimination = dawnEntries.some((e) => e.type === "death");
            const outOfGame = players.filter((p) => p.alive === false || p.eliminated || p.expelled);
            const canVote = !!(myPlayer && canSubmitExpulsionVote(myPlayer));
            const hasVoted =
              Boolean(playerId) && Object.hasOwn(dayRoundVotes, playerId);
            const eligibleVoters = players.filter((p) => canSubmitExpulsionVote(p));
            const allVotesIn =
              eligibleVoters.length === 0 ||
              eligibleVoters.every((p) => Object.hasOwn(dayRoundVotes, p.id ?? ""));
            const validExpulsionTargetIds = new Set(
              players.filter(canBeExpulsionVoteTarget).map((p) => p.id ?? ""),
            );
            const rawResolved = canVote && hasVoted ? (dayRoundVotes[playerId] ?? "") : voteTarget;
            const resolvedVoteTarget =
              rawResolved && validExpulsionTargetIds.has(rawResolved) ? rawResolved : "";
            const voteSelectValue = resolvedVoteTarget;

            return (
              <div className="stack stack--dense day-phase">
                <div className="game-card log-card day-section folhetim-card">
                  <strong className="folhetim-title">Folhetim de Bucaré</strong>
                  {dawnEntries.filter((e) => e.type !== "dawn").map((e) => (
                    <p key={e.id}>{e.message}</p>
                  ))}
                  {!hasDeathOrElimination && (
                    <p className="muted">Ninguém foi eliminado esta noite.</p>
                  )}
                  {dayFolhetimOutcomes.map((e) => (
                    <p key={e.id}>{e.message}</p>
                  ))}
                  {privateLog.map((e) => (
                    <p key={e.id} className="private-log-entry">🔒 {e.message}</p>
                  ))}
                  {outOfGame.length > 0 && (
                    <p className="muted" style={{ marginTop: "0.5rem" }}>
                      Fora do jogo: {outOfGame.map((p) => p.name).join(", ")}
                    </p>
                  )}
                </div>
                <div className="game-card chat-card day-section">
                  <strong>Chat</strong>
                  {chat.map((m) => (
                    (m as { type?: string }).type === "vote" ? (
                      <p key={m.id} className="muted" style={{ fontSize: "0.8em" }}>
                        {m.text}
                      </p>
                    ) : (
                      <p key={m.id}>
                        <strong>{m.name}:</strong> {m.text}
                      </p>
                    )
                  ))}
                </div>
                {(() => {
                  const isDead =
                    myPlayer?.alive === false ||
                    myPlayer?.eliminated ||
                    myPlayer?.expelled;
                  if (isDead && !myPlayer?.invoked) {
                    return (
                      <p className="muted day-section">
                        Você não pode enviar mensagens.
                      </p>
                    );
                  }
                  if (myPlayer?.silenced) {
                    return (
                      <p className="muted day-section">
                        Você está em silêncio e não pode falar agora.
                      </p>
                    );
                  }
                  return (
                    <div className="row day-section">
                      <input
                        value={chatText}
                        onChange={(e) => setChatText(e.target.value)}
                        placeholder="Mensagem…"
                      />
                      <button
                        type="button"
                        className="btn-with-spinner"
                        disabled={!chatText.trim() || anyPending}
                        onClick={() =>
                          void run("sendChatMessage", { roomCode, text: chatText }, "chatSend")
                            .then(() => setChatText(""))
                            .catch(() => {})
                        }
                      >
                        {busy("chatSend") ? "enviando…" : "Enviar"}
                        <BtnSpinner show={busy("chatSend")} />
                      </button>
                    </div>
                  );
                })()}
                {room.votingOpen === true &&
                  (!canVote ? (
                  <p className="muted day-section">Você não tem direito a voto nesta rodada.</p>
                ) : (
                  <div className="day-section vote-block">
                    <label>Seu voto - vote para expulsar um suspeito</label>
                    <select
                      value={voteSelectValue}
                      disabled={hasVoted || anyPending || (myRole === "coronel" && coronelAccusationArmed)}
                      onChange={(e) => setVoteTarget(e.target.value)}
                    >
                      <option value="">Nulo</option>
                      {players
                        .filter((p) => p.id !== playerId && canBeExpulsionVoteTarget(p))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {formatDebugPlayerOpt(p)}
                          </option>
                        ))}
                    </select>
                    <div
                      className="row vote-control-row"
                      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}
                    >
                      <button
                        type="button"
                        className={hasVoted ? "vote-sent" : undefined}
                        disabled={
                          hasVoted ||
                          anyPending ||
                          (myRole === "coronel" && coronelAccusationArmed)
                        }
                        onClick={() =>
                          void run("submitVote", { roomCode, targetId: resolvedVoteTarget || null }, "vote").catch(
                            () => {},
                          )
                        }
                      >
                        <span className="btn-with-spinner">
                          {busy("vote") ? "enviando…" : hasVoted ? "✓ Voto enviado" : "Votar"}
                          <BtnSpinner show={busy("vote")} />
                        </span>
                      </button>
                      {canShowCoronelAccuse(myRole, room, myPlayer) && (
                        <>
                          <button
                            type="button"
                            disabled={
                              anyPending ||
                              dayActionSent === "coronel" ||
                              (coronelAccusationArmed && !resolvedVoteTarget)
                            }
                            className={
                              dayActionSent === "coronel"
                                ? "vote-sent"
                                : coronelAccusationArmed
                                  ? "primary-btn"
                                  : undefined
                            }
                            onClick={() => {
                              if (dayActionSent === "coronel") return;
                              if (!coronelAccusationArmed) {
                                setCoronelAccusationArmed(true);
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
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {isHost && room.votingOpen && (
                  <div className="day-section vote-block">
                    <button
                      type="button"
                      className={allVotesIn ? "primary-btn" : undefined}
                      disabled={anyPending || !allVotesIn}
                      onClick={() => void run("advanceDay", { roomCode }, "advanceDay").catch(() => {})}
                    >
                      <span className="btn-with-spinner">
                        {busy("advanceDay")
                          ? "aguarda…"
                          : allVotesIn
                            ? "Encerrar dia e contar votos"
                            : `Aguardando votos — ${eligibleVoters.filter((p) => Object.hasOwn(dayRoundVotes, p.id ?? "")).length} de ${eligibleVoters.length}`}
                        <BtnSpinner show={busy("advanceDay")} />
                      </span>
                    </button>
                  </div>
                )}
                {isHost && room.pendingNightStart && !hasPendingSaciGorro(room) && !room.pendingBrasChoice && (
                  <div className="day-section vote-block">
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={anyPending}
                      onClick={() => void run("startNight", { roomCode }, "startNight").catch(() => {})}
                    >
                      <span className="btn-with-spinner" style={{ width: "100%" }}>
                        {busy("startNight") ? "recolhendo…" : "Toque de recolher"}
                        <BtnSpinner show={busy("startNight")} />
                      </span>
                    </button>
                  </div>
                )}
                {canShowCangaceiroTiro(myRole, myPlayer) && (
                  <div
                    className="row day-actions-row day-section"
                    style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}
                  >
                    <span className="muted day-actions-label">Tiro Certo (uma vez na partida)</span>
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
                            {formatDebugPlayerOpt(p)}
                          </option>
                        ))}
                    </select>
                    {tiroPreview && (
                      <p className="muted" style={{ margin: 0 }}>
                        {tiroPreview.consulted
                          ? `Geni já conversou com essa pessoa: parece ser ${tiroPreview.hint}.`
                          : "Geni ainda não conversou com essa pessoa — se disparar, será às cegas."}
                      </p>
                    )}
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
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
                            /* setErr em run */
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
                            /* setErr em run */
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
            );
          })()}
        </div>
      )}

      {myRole === "saci" &&
        playerId &&
        room?.pendingSaciGorro &&
        typeof room.pendingSaciGorro === "object" &&
        room.pendingSaciGorro.saciPlayerId === playerId && (
          <SaciGorroModal
            open
            pending={room.pendingSaciGorro as PendingGorro}
            players={players}
            saciPlayerId={playerId}
            onSubmit={(targetPlayerId) =>
              run("submitSaciGorroChoice", { roomCode, targetPlayerId }, "gorroChoice").then(() => undefined)
            }
            onExpire={() =>
              run("expireSaciGorro", { roomCode }, "gorroExpire").then(() => undefined)
            }
            busy={busy("gorroChoice") || busy("gorroExpire")}
          />
        )}

      {room?.pendingBrasChoice && myRole === "bras_cubas" && (
        <div className="game-card">
          <p style={{ fontFamily: "var(--type-display)", fontStyle: "italic", color: "var(--gold)", marginBottom: 12 }}>
            Brás Cubas foi expulso. Qual é a sua escolha?
          </p>
          <button
            type="button"
            disabled={anyPending}
            onClick={() => void run("brasContinueChoice", { roomCode, endGame: true }, "brasEnd").catch(() => {})}
            style={{ marginBottom: 10 }}
          >
            <span className="btn-with-spinner">
              {busy("brasEnd") ? "aguarda…" : "Encerrar — vencer agora"}
              <BtnSpinner show={busy("brasEnd")} />
            </span>
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 13, color: "var(--ink-cream)" }}>
              Ou voltar como:
            </label>
            <select
              value={brasChosenRole}
              disabled={anyPending}
              onChange={(e) => setBrasChosenRole(e.target.value)}
              className="vote-select"
            >
              {Object.entries(ROLE_DISPLAY).map(([roleId, label]) => (
                <option key={roleId} value={roleId}>{label}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={anyPending}
              onClick={() =>
                void run(
                  "brasContinueChoice",
                  { roomCode, endGame: false, chosenRole: brasChosenRole },
                  "brasContinue",
                ).catch(() => {})
              }
            >
              <span className="btn-with-spinner">
                {busy("brasContinue") ? "aguarda…" : `Continuar como ${ROLE_DISPLAY[brasChosenRole] ?? brasChosenRole}`}
                <BtnSpinner show={busy("brasContinue")} />
              </span>
            </button>
          </div>
        </div>
      )}

      {room?.status === "ended" && room && (
        <EndScreen
          room={room}
          players={players}
          publicLog={publicLog}
          myRole={myRole}
          loreOpen={loreOpen}
          setLoreOpen={setLoreOpen}
          allRoundVotes={allRoundVotes}
          allNightActions={allNightActions}
          historyLoaded={historyLoaded}
          isHost={isHost}
          anyPending={anyPending}
          busy={busy}
          run={run}
          roomCode={roomCode}
        />
      )}

    </div>
    </>
  );
}
