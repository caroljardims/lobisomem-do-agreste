import type { PublicLogEntry } from "../types.js";

export type AmanhecerFolhetim = {
  manchete: string;
  paragraphs: string[];
  silentNight: boolean;
};

const DAY_PHASE_OPENING =
  "A cidade está acordada. Conversem, investiguem, desconfiem. Ao fim, votarão para expulsar alguém.";

/** Abertura do dia (finalizeNight) — não faz parte da edição da madrugada. */
export function isDayPhaseOpeningEntry(e: PublicLogEntry): boolean {
  const t = e.type ?? "";
  const msg = String(e.message ?? "").trim();
  return t === "dawn" && msg.includes("A cidade está acordada");
}

/** Entradas do log público que descrevem a noite que acabou (rodada atual). */
export function filterAmanhecerPublicLog(
  publicLog: PublicLogEntry[],
  round: number,
): PublicLogEntry[] {
  return publicLog.filter((e) => {
    if (e.round !== round) return false;
    const t = e.type ?? "";
    if (t === "expulsion" || t === "chronicle_end") return false;
    if (isDayPhaseOpeningEntry(e)) return false;
    if (["death", "bite", "terror", "invocation", "special"].includes(t)) return true;
    if (t === "dawn") return true;
    return false;
  });
}

function cordelDeathLine(message: string): string {
  const m = message.match(
    /^A cidade acorda com uma ausência\.\s*(.+?)\s+foi encontrad[oa] sem vida\.\s*(?:Era\s+(.+?)\.)?$/i,
  );
  if (m) {
    const name = m[1]?.trim() ?? "alguém";
    const role = m[2]?.trim();
    const lead = `O sino tocou cedo: ${name} não amanheceu. O delegado tomou nota, mas a noite não deixou pista.`;
    return role ? `${lead} A praça só soube depois: era ${role}.` : lead;
  }
  return message;
}

function pickManchete(events: PublicLogEntry[]): string {
  if (events.some((e) => e.type === "death")) return "UM MORTO NO AÇUDE";
  if (events.some((e) => e.type === "bite")) return "MARCAS ESTRANHAS NA CIDADE";
  if (events.some((e) => e.type === "terror")) return "TERROR NO ALVORECER";
  if (events.some((e) => e.type === "invocation")) return "UMA PRESENÇA RETORNA";
  return "NOTÍCIAS DA MADRUGADA";
}

function eventToParagraph(e: PublicLogEntry): string {
  const msg = String(e.message ?? "").trim();
  if (!msg) return "";
  if (e.type === "death") return cordelDeathLine(msg);
  return msg;
}

/** Monta manchete e corpo do folhetim da madrugada a partir do log público da rodada. */
export function buildAmanhecerFolhetim(dawnEntries: PublicLogEntry[]): AmanhecerFolhetim {
  const nightEvents = dawnEntries.filter(
    (e) => e.type && e.type !== "dawn" && !isDayPhaseOpeningEntry(e),
  );
  if (nightEvents.length === 0) {
    const silent =
      dawnEntries.find((e) => e.type === "dawn" && !isDayPhaseOpeningEntry(e))?.message ??
      "A noite passou em silêncio. Mas o silêncio, aqui, nunca é inocente.";
    return {
      manchete: "NOITE EM PAZ",
      paragraphs: [silent],
      silentNight: true,
    };
  }
  return {
    manchete: pickManchete(nightEvents),
    paragraphs: nightEvents.map(eventToParagraph).filter(Boolean),
    silentNight: false,
  };
}

export { DAY_PHASE_OPENING };

export function folhetimEditionNumber(round: number): number {
  return (round - 1) * 2 + 1;
}

/** Alinhamento de neutros e regras de mesa — já entram na madrugada, não na praça. */
export function isNightPublicSpecialEntry(e: PublicLogEntry): boolean {
  const m = String(e.message ?? "");
  return (
    m.startsWith("Alinhamento (1ª noite):") ||
    m.includes("Mesa de cinco: por regra do cordel")
  );
}

/** Expulsão e eventos especiais do dia — mesma edição da madrugada, parágrafos extras. */
export function filterDayPlazaPublicLog(
  publicLog: PublicLogEntry[],
  round: number,
): PublicLogEntry[] {
  return publicLog.filter((e) => {
    if (e.round !== round) return false;
    const t = e.type ?? "";
    if (t === "expulsion") return true;
    return t === "special" && !isNightPublicSpecialEntry(e);
  });
}

/** Edição completa da rodada: madrugada + desfechos da praça (quando existirem). */
export function buildRoundFolhetim(
  publicLog: PublicLogEntry[],
  round: number,
): AmanhecerFolhetim {
  const dawnEntries = filterAmanhecerPublicLog(publicLog, round);
  const base = buildAmanhecerFolhetim(dawnEntries);
  const plazaEntries = filterDayPlazaPublicLog(publicLog, round);
  if (plazaEntries.length === 0) return base;

  const plazaParagraphs = plazaEntries
    .map((e) => String(e.message ?? "").trim())
    .filter(Boolean);

  return {
    ...base,
    paragraphs: [...base.paragraphs, ...plazaParagraphs],
  };
}
