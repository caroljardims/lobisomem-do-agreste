import type { GeniInvestigationRecord } from "./types.js";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Normaliza `rooms.*.geniInvestigatedTargets` do Firestore.
 * - Legado: array de `string` (playerId) → tratados como `round: 0` (sempre anteriores à rodada 1+ no filtro `round < N`).
 * - Novo: `{ playerId, round, result }`.
 */
export function normalizeGeniInvestigatedTargets(raw: unknown): GeniInvestigationRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: GeniInvestigationRecord[] = [];
  for (const el of raw) {
    if (typeof el === "string" && el.trim()) {
      out.push({ playerId: el.trim(), round: 0, result: "morador" });
      continue;
    }
    if (!isRecord(el)) continue;
    const pid = typeof el.playerId === "string" ? el.playerId.trim() : "";
    if (!pid) continue;
    const round = typeof el.round === "number" && Number.isFinite(el.round) ? Math.floor(el.round) : 0;
    const r = el.result;
    const result: "criatura" | "morador" =
      r === "criatura" || r === "morador" ? r : "morador";
    out.push({ playerId: pid, round, result });
  }
  return out;
}

/** Rodadas anteriores à noite em resolução (Geni + Cangaceiro na mesma madrugada). */
export function geniInvestigationsPriorToRound(
  records: GeniInvestigationRecord[],
  currentRound: number,
): GeniInvestigationRecord[] {
  return records.filter((e) => e.round < currentRound);
}

/** Todos os alvos já conversados (validação “não repetir”). */
export function geniConversedPlayerIds(records: GeniInvestigationRecord[]): string[] {
  const seen = new Set<string>();
  for (const e of records) {
    if (e.playerId) seen.add(e.playerId);
  }
  return [...seen];
}

/** Dia / Tiro Certo: inclui a conversa da noite que acabou (`round <= currentRound`). */
export function geniKnowsTargetForDayTiro(
  records: GeniInvestigationRecord[],
  targetPlayerId: string,
  dayRound: number,
): boolean {
  return records.some((e) => e.playerId === targetPlayerId && e.round <= dayRound);
}
