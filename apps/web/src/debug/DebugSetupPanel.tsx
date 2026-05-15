/**
 * Localhost-only debug setup UI (Folhetim de Bucaré).
 * Render only when hostname is localhost / 127.0.0.1; visibility must not rely on env/build flags.
 */
import type { RoleId } from "folclore-game-engine";
import { useCallback, useState } from "react";
import { ensureDebugAuth } from "../auth/ensureDebugAuth.js";
import { call } from "../firebase.js";
import { mapCallableError } from "../lib/callableErrors.js";
import type { DebugSetupPersisted } from "./types.js";
import { clampBots, loadDebugSetup, saveDebugSetup } from "./debugStorage.js";
import { DEBUG_ALL_ROLES, DEBUG_ROLE_LABELS } from "./roleOptions.js";
import { SCENARIO_DEFS } from "./scenarios.js";

const HOST_SENTINEL = "__HOST__";

function randomRolePick(): RoleId | "random" {
  if (Math.random() < 0.35) return "random";
  const i = Math.floor(Math.random() * DEBUG_ALL_ROLES.length);
  return DEBUG_ALL_ROLES[i]!;
}

type Props = {
  onClose: () => void;
  onEntered: (roomCode: string, playerId: string) => void;
  onError: (msg: string) => void;
};

export function DebugSetupPanel({ onClose, onEntered, onError }: Props) {
  const [form, setForm] = useState<DebugSetupPersisted>(() => loadDebugSetup());
  const [busy, setBusy] = useState(false);

  const persist = useCallback((next: DebugSetupPersisted) => {
    setForm(next);
    saveDebugSetup(next);
  }, []);

  const setTotal = (total: number) => {
    const t = Math.min(12, Math.max(4, total));
    const bots = clampBots(t, form.bots);
    persist({ ...form, totalPlayers: t, bots });
  };

  const updateBot = (i: number, patch: Partial<DebugSetupPersisted["bots"][0]>) => {
    const bots = [...form.bots];
    bots[i] = { ...bots[i]!, ...patch };
    persist({ ...form, bots });
  };

  const randomAllBots = () => {
    const bots = form.bots.map((b) => ({
      ...b,
      role: randomRolePick(),
      alwaysVote: null,
    }));
    persist({ ...form, bots });
  };

  const applyScenario = (key: keyof typeof SCENARIO_DEFS) => {
    const cfg = SCENARIO_DEFS[key].build();
    const { scenarioLabel: _scenarioLabel, ...rest } = cfg;
    persist(rest as DebugSetupPersisted);
  };

  const start = async () => {
    setBusy(true);
    try {
      await ensureDebugAuth();
      const payload = {
        playerName: form.playerName.trim() || "Debug Player",
        playerRole: form.playerRole,
        totalPlayers: form.totalPlayers,
        bots: form.bots.map((b) => ({
          name: b.name?.trim() || undefined,
          role: b.role,
          alwaysVote: b.alwaysVote === HOST_SENTINEL ? HOST_SENTINEL : b.alwaysVote ?? null,
        })),
        startRound: form.startRound,
        skipNight: form.skipNight,
        forceMoonPhase: form.forceMoonPhase,
        showAllRoles: form.showAllRoles,
        slowMode: form.slowMode,
      };
      const c = call<typeof payload, { roomCode: string; playerId: string }>("startDebugGame");
      const { data } = await c(payload);
      const roomCode = String(data?.roomCode ?? "").toUpperCase().trim();
      const playerId = String(data?.playerId ?? "");
      if (!roomCode || !playerId) throw new Error("Resposta inválida.");
      persist(form);
      onEntered(roomCode, playerId);
      onClose();
    } catch (e: unknown) {
      onError(mapCallableError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="debug-setup-overlay" role="dialog" aria-modal="true" aria-labelledby="debug-setup-title">
      <div className="debug-setup-sheet">
        <div className="debug-setup-head">
          <h2 id="debug-setup-title">Partida debug (localhost)</h2>
          <button type="button" className="debug-setup-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="debug-setup-scroll">
          <section className="debug-setup-section">
            <h3 className="debug-setup-section-title">1 — Seu jogador</h3>
            <label className="field-label">Nome</label>
            <input
              className="field-input"
              value={form.playerName}
              maxLength={40}
              onChange={(e) => persist({ ...form, playerName: e.target.value })}
            />
            <label className="field-label">Papel</label>
            <select
              className="field-input"
              value={form.playerRole}
              onChange={(e) =>
                persist({ ...form, playerRole: e.target.value as RoleId })
              }
            >
              {DEBUG_ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {DEBUG_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </section>

          <section className="debug-setup-section">
            <div className="debug-setup-row">
              <h3 className="debug-setup-section-title">2 — Bots</h3>
              <div className="debug-stepper">
                <button type="button" onClick={() => setTotal(form.totalPlayers - 1)}>
                  −
                </button>
                <span>Total na mesa: {form.totalPlayers}</span>
                <button type="button" onClick={() => setTotal(form.totalPlayers + 1)}>
                  +
                </button>
              </div>
            </div>
            <p className="copy-muted debug-setup-hint">
              Você mais {form.totalPlayers - 1} bot(s). Opcional: forçar voto diurno dos bots para um id — use
              “sempre em você”.
            </p>
            <div className="debug-bot-grid">
              {form.bots.map((b, i) => (
                <div key={i} className="debug-bot-row">
                  <span className="debug-bot-num">{i + 1}</span>
                  <input
                    className="field-input debug-bot-name"
                    placeholder="nome opcional"
                    value={b.name ?? ""}
                    onChange={(e) => updateBot(i, { name: e.target.value })}
                  />
                  <select
                    className="field-input debug-bot-role"
                    value={b.role}
                    onChange={(e) =>
                      updateBot(i, {
                        role: e.target.value as DebugSetupPersisted["bots"][0]["role"],
                      })
                    }
                  >
                    <option value="random">Aleatório</option>
                    {DEBUG_ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {DEBUG_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <select
                    className="field-input debug-bot-vote"
                    value={
                      b.alwaysVote === HOST_SENTINEL ? HOST_SENTINEL : b.alwaysVote ?? ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      updateBot(i, {
                        alwaysVote: v === "" ? null : v,
                      });
                    }}
                  >
                    <option value="">voto livre</option>
                    <option value={HOST_SENTINEL}>sempre em você (__HOST__)</option>
                  </select>
                </div>
              ))}
            </div>
            <button type="button" className="chip-btn debug-random-all" onClick={randomAllBots}>
              Randomizar todos os bots
            </button>
          </section>

          <section className="debug-setup-section">
            <h3 className="debug-setup-section-title">3 — Ajustes</h3>
            <label className="field-label">Rodada inicial (1–7)</label>
            <input
              className="field-input"
              type="number"
              min={1}
              max={7}
              value={form.startRound}
              onChange={(e) =>
                persist({
                  ...form,
                  startRound: Math.min(7, Math.max(1, Number(e.target.value) || 1)),
                })
              }
            />
            <label className="field-label row-inline">
              <input
                type="checkbox"
                checked={form.skipNight}
                onChange={(e) => persist({ ...form, skipNight: e.target.checked })}
              />{" "}
              Pular noite ao iniciar (bots resolvem noite até o dia)
            </label>
            <label className="field-label">Lua (força na sala)</label>
            <select
              className="field-input"
              value={form.forceMoonPhase ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                persist({
                  ...form,
                  forceMoonPhase: v === "" ? null : (v as DebugSetupPersisted["forceMoonPhase"]),
                });
              }}
            >
              <option value="">normal</option>
              <option value="crescent">crescente (cosmético)</option>
              <option value="full">lua cheia (testar fim folclórico)</option>
            </select>
            <label className="field-label row-inline">
              <input
                type="checkbox"
                checked={form.showAllRoles}
                onChange={(e) => persist({ ...form, showAllRoles: e.target.checked })}
              />{" "}
              Mostrar papéis na UI principal (listas/selects)
            </label>
            <label className="field-label row-inline">
              <input
                type="checkbox"
                checked={form.slowMode}
                onChange={(e) => persist({ ...form, slowMode: e.target.checked })}
              />{" "}
              Slow mode (bots noturnos com +3s entre escolhas — servidor)
            </label>
          </section>

          <section className="debug-setup-section">
            <h3 className="debug-setup-section-title">4 — Cenários rápidos</h3>
            <div className="debug-scenario-btns">
              {(Object.keys(SCENARIO_DEFS) as Array<keyof typeof SCENARIO_DEFS>).map((key) => (
                <button key={key} type="button" className="chip-btn" onClick={() => applyScenario(key)}>
                  {SCENARIO_DEFS[key].label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="debug-setup-actions">
          <button type="button" className="ghost-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="primary-btn" disabled={busy} onClick={() => void start()}>
            {busy ? "Iniciando…" : "Iniciar partida debug"}
          </button>
        </div>
      </div>
    </div>
  );
}
