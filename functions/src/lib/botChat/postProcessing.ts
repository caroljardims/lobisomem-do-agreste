import type { BotContext } from "./types.js";

function truncateWords(s: string, max: number): string {
  const w = s.trim().split(/\s+/).filter(Boolean);
  if (w.length <= max) return s.trim();
  return w.slice(0, max).join(" ");
}

function capitalizeSentences(s: string): string {
  return s
    .split(/([.!?]\s+)/)
    .map((chunk, i) => {
      if (i % 2 === 0 && chunk.length > 0) {
        return chunk.charAt(0).toUpperCase() + chunk.slice(1);
      }
      return chunk;
    })
    .join("");
}

export function postSaci(phrase: string, _ctx: BotContext, rng: () => number): string {
  if (rng() >= 0.3) return phrase;
  return phrase + (rng() < 0.5 ? " kkkkkkk" : " rs");
}

export function postMula(phrase: string): string {
  return truncateWords(phrase, 12);
}

export function postCangaceiro(phrase: string): string {
  return truncateWords(phrase, 10);
}

export function postDelegado(phrase: string): string {
  return capitalizeSentences(phrase);
}

export function postPadre(phrase: string, _ctx: BotContext, rng: () => number): string {
  if (rng() >= 0.4) return phrase;
  return rng() < 0.5 ? `Em nome da verdade, ${phrase}` : `${phrase} — que Deus nos ilumine.`;
}

export function postBras(phrase: string, _ctx: BotContext, rng: () => number): string {
  if (rng() >= 0.3) return phrase;
  return rng() < 0.5 ? `Não que me importe, mas ${phrase}` : `${phrase} — não que isso mude algo.`;
}
