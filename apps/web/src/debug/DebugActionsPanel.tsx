/**
 * Sidebar with forced phase advances and Firestore snapshots (localhost + room.debug apenas).
 */
import { doc, getDoc } from "firebase/firestore";
import type { RoleId } from "folclore-game-engine";
import { useCallback, useState } from "react";
import { call, db } from "../firebase.js";
import { mapCallableError } from "../lib/callableErrors.js";
import type { PlayerDoc } from "../types.js";
import { DEBUG_ALL_ROLES, DEBUG_ROLE_LABELS } from "./roleOptions.js";

type Props = {
  roomCode: string;
  players: PlayerDoc[];
  open: boolean;
  onToggle: () => void;
  onError: (m: string) => void;
};

const NIGHT_ACTIONS = [
  "eliminate",
  "bite",
  "steal",
  "terrorize",
  "enchant",
  "seduce",
  "eliminate_special",
  "protect",
  "save",
  "investigate",
  "jail",
  "invoke",
  "converse",
  "query",
  "catechize",
  "pass",
];

export function DebugActionsPanel({ roomCode, players, open, onToggle, onError }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [roomJson, setRoomJson] = useState<string | null>(null);
  const [logPlayerId, setLogPlayerId] = useState("");
  const [privateLog, setPrivateLog] = useState<string | null>(null);
  const [naPlayer, setNaPlayer] = useState("");
  const [naRole, setNaRole] = useState<RoleId>("lobisomem");
  const [naAction, setNaAction] = useState("eliminate");
  const [naTarget, setNaTarget] = useState("");
  const [naSpecial, setNaSpecial] = useState("");
  const [killTarget, setKillTarget] = useState("");
  const [expelTarget, setExpelTarget] = useState("");
  const [fw, setFw] = useState<"moradores" | "criaturas" | "individual_objectives">("moradores");

  const runDbg = useCallback(
    async (fn: string, data: Record<string, unknown>, key: string) => {
      setBusy(key);
      onError("");
      try {
        const c = call<Record<string, unknown>, Record<string, unknown>>(fn);
        const res = await c({ roomCode: roomCode.toUpperCase(), ...data });
        return res.data;
      } catch (e: unknown) {
        onError(mapCallableError(e));
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [roomCode, onError],
  );

  const refreshRoomDoc = async () => {
    try {
      const snap = await getDoc(doc(db, "rooms", roomCode.toUpperCase()));
      setRoomJson(JSON.stringify(snap.data() ?? {}, null, 2));
    } catch (e: unknown) {
      setRoomJson(mapCallableError(e));
    }
  };

  const fetchPrivateLog = async () => {
    if (!logPlayerId) return;
    try {
      const data = (await runDbg("debugGetPrivateLog", { playerId: logPlayerId }, "debugLog")) as {
        entries?: unknown;
      };
      setPrivateLog(JSON.stringify(data?.entries ?? [], null, 2));
    } catch {
      /* onError handled */
    }
  };

  return (
    <>
      <button type="button" className="debug-sidebar-toggle" onClick={onToggle} aria-expanded={open}>
        {open ? "⟩" : "⟨"} ações
      </button>
      {open && (
        <aside className="debug-sidebar">
          <h3 className="debug-sidebar-title">Ações debug</h3>

          <div className="debug-sidebar-group">
            <button
              type="button"
              className="chip-btn"
              disabled={!!busy}
              onClick={() => void runDbg("debugAdvancePhase", {}, "adv")}
            >
              {busy === "adv" ? "…" : "Avançar fase"}
            </button>
            <p className="muted small">Noite → resolve noite; dia com votos → encerra dia; pausa → inicia noite.</p>
          </div>

          <div className="debug-sidebar-group">
            <label className="field-label">Matar (eliminar)</label>
            <select className="field-input" value={killTarget} onChange={(e) => setKillTarget(e.target.value)}>
              <option value="">—</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="chip-btn"
              disabled={!killTarget || !!busy}
              onClick={() => void runDbg("debugKillPlayer", { targetPlayerId: killTarget }, "kill")}
            >
              {busy === "kill" ? "…" : "Matar"}
            </button>
          </div>

          <div className="debug-sidebar-group">
            <label className="field-label">Expulsar (força votos)</label>
            <select className="field-input" value={expelTarget} onChange={(e) => setExpelTarget(e.target.value)}>
              <option value="">—</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="chip-btn"
              disabled={!expelTarget || !!busy}
              onClick={() => void runDbg("debugExpelPlayer", { targetPlayerId: expelTarget }, "expel")}
            >
              {busy === "expel" ? "…" : "Expulsar"}
            </button>
          </div>

          <div className="debug-sidebar-group">
            <label className="field-label">Forçar vitória coletiva</label>
            <select className="field-input" value={fw} onChange={(e) => setFw(e.target.value as typeof fw)}>
              <option value="moradores">moradores</option>
              <option value="criaturas">criaturas</option>
              <option value="individual_objectives">criaturas (via objetivos)</option>
            </select>
            <button
              type="button"
              className="chip-btn"
              disabled={!!busy}
              onClick={() => void runDbg("debugForceWin", { winner: fw }, "win")}
            >
              {busy === "win" ? "…" : "Encerrar com vencedor"}
            </button>
          </div>

          <div className="debug-sidebar-group">
            <button
              type="button"
              className="chip-btn"
              disabled={!!busy}
              onClick={() => void runDbg("debugResetRound", {}, "rst")}
            >
              {busy === "rst" ? "…" : "Resetar rodada atual"}
            </button>
          </div>

          <hr className="debug-hr" />

          <div className="debug-sidebar-group">
            <button type="button" className="chip-btn" onClick={() => void refreshRoomDoc()}>
              Ver sala (Firestore JSON)
            </button>
            {roomJson && <pre className="debug-json-pre">{roomJson}</pre>}
          </div>

          <div className="debug-sidebar-group">
            <label className="field-label">Log privado</label>
            <select className="field-input" value={logPlayerId} onChange={(e) => setLogPlayerId(e.target.value)}>
              <option value="">—</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" className="chip-btn" onClick={() => void fetchPrivateLog()}>
              Carregar
            </button>
            {privateLog && <pre className="debug-json-pre">{privateLog}</pre>}
          </div>

          <div className="debug-sidebar-group">
            <h4 className="debug-subhead">Simular ação noturna</h4>
            <label className="field-label">Jogador</label>
            <select className="field-input" value={naPlayer} onChange={(e) => setNaPlayer(e.target.value)}>
              <option value="">—</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label className="field-label">Papel usado na gravação</label>
            <select className="field-input" value={naRole} onChange={(e) => setNaRole(e.target.value as RoleId)}>
              {DEBUG_ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {DEBUG_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <label className="field-label">action</label>
            <select className="field-input" value={naAction} onChange={(e) => setNaAction(e.target.value)}>
              {NIGHT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <label className="field-label">targetId</label>
            <select className="field-input" value={naTarget} onChange={(e) => setNaTarget(e.target.value)}>
              <option value="">null</option>
              {players.map((p) => (
                <option key={p.id} value={p.id!}>
                  {p.name}
                </option>
              ))}
            </select>
            <label className="field-label">specialAction (texto / alinhamento)</label>
            <input
              className="field-input"
              value={naSpecial}
              onChange={(e) => setNaSpecial(e.target.value)}
              placeholder="ex: moradores ou motivo delegado"
            />
            <button
              type="button"
              className="chip-btn"
              disabled={!naPlayer || !!busy}
              onClick={() =>
                void runDbg(
                  "debugSetNightAction",
                  {
                    playerId: naPlayer,
                    role: naRole,
                    action: naAction,
                    targetId: naTarget || null,
                    specialAction: naSpecial.trim() || null,
                  },
                  "dna",
                )
              }
            >
              {busy === "dna" ? "…" : "Gravar + avançar fila"}
            </button>
            <p className="muted small">Só funciona em `status: night`. Host debug.</p>
          </div>
        </aside>
      )}
    </>
  );
}
