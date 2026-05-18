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
  ROLE_DISPLAY,
  ROLE_LORE,
  ROLE_XILO,
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
import { NIGHT_ROLE_ACTION_SECONDS } from "./lib/nightTurnConstants.js";
import { mapCallableError } from "./lib/callableErrors.js";
import type { PlayerDoc, RoomDoc, View } from "./types.js";
import { BtnSpinner } from "./components/BtnSpinner.js";
import { EndScreen } from "./components/screens/EndScreen.js";
import { AmanhecerScreen } from "./components/screens/AmanhecerScreen.js";
import { DayScreen } from "./components/screens/DayScreen.js";
import {
  buildRoundFolhetim,
  folhetimEditionNumber,
} from "./lib/amanhecerContent.js";
import { NightScreen } from "./components/screens/NightScreen.js";
import { AVATAR_GLYPHS } from "./lib/playerGlyph.js";
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

/** @deprecated – kept only during refactor; use RoleLoreContent directly */
function extractBatismoSections(lore: unknown): { quem: string; faz: string; quer: string } {
  if (!lore || typeof lore === "string") {
    return { quem: typeof lore === "string" ? lore : "", faz: "", quer: "" };
  }
  const rich = lore as { narrative?: string; sections?: Array<{ kind: string; title?: string; content?: unknown; text?: unknown }> };
  const narrative = rich.narrative ?? "";
  const sections = rich.sections ?? [];
  const faz = sections.find(
    (s) => s.kind === "kv" && /poder|noturno|poder noturno|habilidade/i.test(String(s.title ?? "")),
  );
  const quer = sections.find(
    (s) => s.kind === "kv" && /objetivo/i.test(String(s.title ?? "")),
  );
  const fazText = faz ? String(typeof faz.content === "string" ? faz.content : "") : "";
  const querText = quer ? String(typeof quer.content === "string" ? quer.content : "") : "";
  return { quem: narrative, faz: fazText, quer: querText };
}

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
  const { allRoundVotes, allRoundBotVoteReasons, allNightActions, historyLoaded } = useGameEndHistory(
    roomCode,
    room,
  );
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
  const [loreSheetFolhetoOpen, setLoreSheetFolhetoOpen] = useState(false);
  const [brasChosenRole, setBrasChosenRole] = useState("aldeao");
  const [cangConsultTarget, setCangConsultTarget] = useState("");
  const [tiroCertoTarget, setTiroCertoTarget] = useState("");
  const [tiroPreview, setTiroPreview] = useState<{ consulted: boolean; hint?: string } | null>(null);
  const [accountRoute, setAccountRoute] = useState<{ open: boolean; tab: AccountTab }>(() =>
    typeof window !== "undefined" ? readAccountRoute() : { open: false, tab: "estatisticas" },
  );
  const [suspicionTarget, setSuspicionTarget] = useState("");
  const [suspicionSent, setSuspicionSent] = useState(false);
  const [nightToast, setNightToast] = useState<string | null>(null);
  const [delegadoJustifyInlineError, setDelegadoJustifyInlineError] = useState(false);
  const [delegadoIntroDismissed, setDelegadoIntroDismissed] = useState(false);

  // Batismo do personagem — folheto interativo antes da noite 1
  const [batismoSeen, setBatismoSeen] = useState<boolean>(() => {
    try { return sessionStorage.getItem(`batismo_${localStorage.getItem(LS_ROOM) ?? ""}`) === "1"; }
    catch { return false; }
  });
  const [batismoFolhetoOpen, setBatismoFolhetoOpen] = useState(false);

  const [folhetimDismissedRound, setFolhetimDismissedRound] = useState(0);

  const showBatismo =
    room?.status === "night" &&
    Number(room?.round ?? 0) === 1 &&
    !!myRole &&
    !batismoSeen;

  const currentRound = room?.round ?? 1;
  const showAmanhecer =
    room?.status === "day" &&
    !showBatismo &&
    currentRound >= 1 &&
    folhetimDismissedRound !== currentRound;

  const roundFolhetim = useMemo(
    () => buildRoundFolhetim(publicLog, currentRound),
    [publicLog, currentRound],
  );
  const folhetimEdition = folhetimEditionNumber(currentRound);

  const inDayPhase =
    room?.status === "day" && !showBatismo && !showAmanhecer;

  function confirmBatismo() {
    setBatismoSeen(true);
    setLoreOpen(false);
    try { sessionStorage.setItem(`batismo_${roomCode}`, "1"); } catch { /* ignore */ }
  }

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
    if (!room) return;
    const r = room.round ?? 0;
    if (room.status === "lobby" || room.status === "ended" || r === 0) {
      setFolhetimDismissedRound(0);
      return;
    }
    setFolhetimDismissedRound((prev) => (r < prev ? 0 : prev));
  }, [room?.status, room?.round, roomCode]);

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

  useEffect(() => {
    if (!roomCode || typeof sessionStorage === "undefined") return;
    setDelegadoIntroDismissed(sessionStorage.getItem(`folhetim_delegado_night_intro_${roomCode}`) === "1");
  }, [roomCode]);

  useEffect(() => {
    setDelegadoJustifyInlineError(false);
  }, [nightTarget, nightSpecialAction, nightAction]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!roomCode) return;
    if (room?.status !== "night" || myRole !== "delegado") return;
    if (!room.nightPendingRoles?.includes("delegado")) return;
    if (nightActionSent) return;
    if ((room.round ?? 1) === 1 && !delegadoIntroDismissed) return;

    const t = window.setTimeout(() => {
      void run(
        "submitNightAction",
        { roomCode, action: "pass", targetId: null, specialAction: null },
        "nightAction",
      )
        .then(() => {
          setNightActionSent(true);
          setNightToast("Tempo esgotado. Você passou a noite sem prender ninguém.");
          window.setTimeout(() => setNightToast(null), 6000);
        })
        .catch(() => {});
    }, NIGHT_ROLE_ACTION_SECONDS * 1000);

    return () => window.clearTimeout(t);
  }, [
    room?.status,
    room?.round,
    room?.nightPendingRoles,
    myRole,
    nightActionSent,
    roomCode,
    delegadoIntroDismissed,
    run,
  ]);

  useEffect(() => {
    if (room?.status !== "night") setNightToast(null);
  }, [room?.status]);

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
    if (room?.status === "lobby") {
      setBatismoSeen(false);
      try { sessionStorage.removeItem(`batismo_${roomCode}`); } catch { /* ignore */ }
    }
  }, [room?.status, roomCode]);

  useEffect(() => {
    if (room?.round === 1 && room?.status === "night" && !batismoSeen) setLoreOpen(true);
  }, [room?.round, room?.status, batismoSeen]);

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
          <div className="page page--landing page--jornal">

            {/* ── Masthead ── */}
            <header className="jornal-masthead">
              <span className="jornal-masthead__col">Edição N.º 1</span>
              <span className="jornal-masthead__col jornal-masthead__col--center">
                {new Date().toLocaleDateString("pt-BR", { month: "long" }).replace(/^\w/, c => c.toUpperCase())} de 1922
              </span>
              <span className="jornal-masthead__col jornal-masthead__col--right">
                {user ? (
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
                        <button type="button" className="landing-user-dropdown-item" role="menuitem"
                          onClick={() => { navigateAccount("estatisticas"); setUserMenuOpen(false); }}>
                          Minha conta
                        </button>
                        <button type="button" className="landing-user-dropdown-item" role="menuitem"
                          onClick={() => { navigateAccount("favoritos"); setUserMenuOpen(false); }}>
                          Favoritos
                        </button>
                        <button type="button" className="landing-user-dropdown-item" role="menuitem"
                          onClick={() => { navigateAccount("ranking"); setUserMenuOpen(false); }}>
                          Ranking
                        </button>
                        <div className="landing-user-dropdown-divider" role="separator" />
                        <button type="button" className="landing-user-dropdown-item" role="menuitem"
                          onClick={() => void handleLandingSignOut()}>
                          Sair
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <span>Tiragem: Pra Leitura Interna</span>
                )}
              </span>
            </header>

            <div className="jornal-masthead__rule" />

            {/* ── Hero ── */}
            <div className="jornal-hero">
              <div className="jornal-hero__text">
                <h1 className="jornal-titulo">Folhetim<br />de Bucaré</h1>
              </div>
            </div>

            <div className="jornal-masthead__rule jornal-masthead__rule--thin" />

            {/* ── Corpo: cordel + CTAs ── */}
            <div className="jornal-corpo">
              {/* Botões — aparecem primeiro no mobile */}
              <div className="jornal-ctas">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => {
                    if (!user) { postAuthTarget.current = "create"; setAuthModalOpen(true); return; }
                    setView("create");
                  }}
                >
                  <div className="btn-stack">
                    <span className="btn-title">Criar uma sala</span>
                    <span className="btn-sub">você vira o anfitrião da noite</span>
                  </div>
                  <span className="btn-arrow" aria-hidden>→</span>
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setJoinCodeArr(["", "", "", ""]);
                    if (!user) { postAuthTarget.current = "join"; setAuthModalOpen(true); return; }
                    setView("join");
                  }}
                >
                  <div className="btn-stack">
                    <span className="btn-title">Entrar com código</span>
                    <span className="btn-sub">já recebeu o convite</span>
                  </div>
                  <span className="btn-arrow" aria-hidden>→</span>
                </button>
              </div>

              {/* Cordel — coluna esquerda no desktop */}
              <div className="jornal-cordel" lang="pt-BR">
                <p>
                  Noite longa no sertão<br />
                  O calor não é da rua<br />
                  Quem assombra meu portão<br />
                  Tem apreço pela lua.<br />
                  A magia dessa gente<br />
                  Tem poder inconsequente!
                </p>
                <p>
                  Senti um calor no couro<br />
                  Tão perto passou a mula!<br />
                  E com grito da Iara<br />
                  Rio arrasta quem não cura!<br />
                  E o lobo dessa terra<br />
                  Foi vizinho, virou fera!
                </p>
                <p>
                  Nessa noite de mistério<br />
                  Quem se vai e quem que fica?<br />
                  Vai ser no alvorecer<br />
                  Que resolve a intriga<br />
                  Se eu vivo ou se me vô<br />
                  Pr'outro mundo, que horrô!
                </p>
              </div>
            </div>

            {/* ── Rodapé ── */}
            <div className="jornal-masthead__rule" />
            <footer className="jornal-rodape">
              <span>Por: caroljardims</span>
              <span>Preço: Dois Mil-Réis</span>
            </footer>
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
      <div
        className={`page${isDebugSession ? " page--debug" : ""}${
          room?.status === "night"
            ? " fase--noite"
            : showAmanhecer
              ? " fase--amanhecer"
              : inDayPhase
                ? " fase--dia"
                : ""
        }`}
      >
      <div className="top-bar">
        <button type="button" className="back-link" onClick={leave}>
          ← sair
        </button>
        <span className="session-label">
          {inLobby
            ? "lobby"
            : showAmanhecer
              ? `amanhecer · dia ${room?.round ?? 1}`
              : room?.status === "night"
                ? `rodada ${room.round ?? 1} · noite`
                : inDayPhase
                  ? `dia ${room?.round ?? 1} · praça`
                  : room?.status === "day"
                    ? `rodada ${room.round ?? 1} · dia`
                    : `rodada ${room?.round ?? 1}`}
        </span>
        <span className="online-pill">
          <span className="dot-online" />
          {players.length}
        </span>
        {((room?.status === "night" && myRole && !showBatismo) || inDayPhase) && myRole ? (
          <button
            type="button"
            className="back-link noite-help-btn"
            style={{ marginLeft: "auto" }}
            aria-label="Reler carta do personagem"
            onClick={() => {
              setLoreSheetFolhetoOpen(true);
              setLoreOpen(true);
            }}
          >
            ?
          </button>
        ) : user ? (
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
        ) : null}
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

      {/* ── Batismo do personagem — noite 1, antes de tudo ── */}
      {showBatismo && myRole && (() => {
        const lore = ROLE_LORE[myRole];
        const xiloSrc = ROLE_XILO[myRole] ?? null;
        const meCard = players.find((p) => p.id === playerId);
        const lado = meCard?.side ?? "morador";
        const ladoLabel = lado === "criatura" ? "Criatura" : lado === "neutro" ? "Neutro" : "Morador";
        const displayName = ROLE_DISPLAY[myRole]?.replace(/^\S+\s+/, "") ?? myRole;
        return (
          <div className="game-card fade-enter" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ textAlign: "center" }}>
              <div className="eyebrow eyebrow-luar" style={{ fontSize: 10, letterSpacing: "0.42em" }}>Editora Bucaré</div>
              <h2 style={{ fontFamily: "var(--ff-display)", color: "var(--texto-claro)", fontSize: 22, lineHeight: 1.1, marginTop: 6 }}>
                Esta noite,<br />você é —
              </h2>
            </div>

            {/* Folheto interativo */}
            <div className={`folheto-int folheto-int--${lado} ${batismoFolhetoOpen ? "is-open" : ""}`}>
              <button
                type="button"
                className="folheto-int__capa"
                onClick={() => setBatismoFolhetoOpen(true)}
                aria-expanded={batismoFolhetoOpen}
              >
                <div className="folheto-int__xilo">
                  {xiloSrc ? (
                    <img src={xiloSrc} alt={displayName} />
                  ) : (
                    <div className="folheto-int__placeholder">{displayName.toUpperCase()}</div>
                  )}
                </div>
                <div className="folheto-int__name">{displayName.toUpperCase()}</div>
                <div className="folheto-int__lado">— {ladoLabel} —</div>
                <div className="folheto-int__hint">
                  {batismoFolhetoOpen ? "pronto?" : "toque o folheto"}
                </div>
              </button>

              <div className="folheto-int__corpo">
                {lore && <RoleLoreContent lore={lore} />}
              </div>
            </div>

            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                className={`btn-dia`}
                disabled={!batismoFolhetoOpen}
                onClick={confirmBatismo}
              >
                {batismoFolhetoOpen ? "Entendi — ir para a noite ☾" : "Toque o folheto primeiro"}
              </button>
              {!batismoFolhetoOpen && (
                <p className="muted" style={{ textAlign: "center", fontSize: 12 }}>
                  leia com calma — ninguém vê sua carta.
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {room && room.status === "night" && !showBatismo && (
        <NightScreen
          room={room}
          roomCode={roomCode}
          players={players}
          playerId={playerId}
          myRole={myRole}
          selfGlyph={glyph}
          roleActionOptions={roleActionOptions}
          myPrivate={myPrivate}
          nightTarget={nightTarget}
          setNightTarget={setNightTarget}
          nightAction={nightAction}
          setNightAction={setNightAction}
          nightSpecialAction={nightSpecialAction}
          setNightSpecialAction={setNightSpecialAction}
          nightActionSent={nightActionSent}
          setNightActionSent={setNightActionSent}
          suspicionTarget={suspicionTarget}
          setSuspicionTarget={setSuspicionTarget}
          suspicionSent={suspicionSent}
          setSuspicionSent={setSuspicionSent}
          cangConsultTarget={cangConsultTarget}
          setCangConsultTarget={setCangConsultTarget}
          nightToast={nightToast}
          delegadoIntroDismissed={delegadoIntroDismissed}
          setDelegadoIntroDismissed={setDelegadoIntroDismissed}
          delegadoJustifyInlineError={delegadoJustifyInlineError}
          setDelegadoJustifyInlineError={setDelegadoJustifyInlineError}
          loreOpen={loreOpen}
          setLoreOpen={setLoreOpen}
          loreSheetFolhetoOpen={loreSheetFolhetoOpen}
          setLoreSheetFolhetoOpen={setLoreSheetFolhetoOpen}
          run={run}
          busy={busy}
          anyPending={anyPending}
        />
      )}

      {showAmanhecer && room && (
        <AmanhecerScreen
          room={room}
          publicLog={publicLog}
          privateLog={privateLog}
          onDismiss={() => setFolhetimDismissedRound(currentRound)}
        />
      )}

      {inDayPhase && room && (
        <DayScreen
          room={room}
          roomCode={roomCode}
          players={players}
          playerId={playerId}
          myRole={myRole}
          chat={chat}
          dayRoundVotes={dayRoundVotes}
          roundFolhetim={roundFolhetim}
          folhetimEdition={folhetimEdition}
          currentRound={currentRound}
          isHost={isHost}
          voteTarget={voteTarget}
          setVoteTarget={setVoteTarget}
          chatText={chatText}
          setChatText={setChatText}
          coronelAccusationArmed={coronelAccusationArmed}
          setCoronelAccusationArmed={setCoronelAccusationArmed}
          dayActionSent={dayActionSent}
          setDayActionSent={setDayActionSent}
          tiroCertoTarget={tiroCertoTarget}
          setTiroCertoTarget={setTiroCertoTarget}
          tiroPreview={tiroPreview}
          setTiroPreview={setTiroPreview}
          loreOpen={loreOpen}
          setLoreOpen={setLoreOpen}
          loreSheetFolhetoOpen={loreSheetFolhetoOpen}
          setLoreSheetFolhetoOpen={setLoreSheetFolhetoOpen}
          formatPlayerName={formatDebugPlayerOpt}
          run={run}
          busy={busy}
          anyPending={anyPending}
        />
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
          allRoundBotVoteReasons={allRoundBotVoteReasons}
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
