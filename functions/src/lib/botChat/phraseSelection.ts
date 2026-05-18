import type { RoleId } from "folclore-game-engine";
import type { BotContext, MessageType, Rng } from "./types.js";
import { getCharacterConfig } from "./characterConfigs.js";
import { getExclusivePhrases } from "./exclusivePhrases.js";
import { getGenericPhrases } from "./genericPhrases.js";

function randomFrom<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function fillTemplates(phrase: string, ctx: BotContext): string {
  const target = ctx.accuseTargetName ?? "alguém";
  const victim = ctx.victim ?? "quem partiu";
  const accuser = ctx.wasAccusedBy ?? "alguém";
  return phrase
    .replace(/\{event\}/g, ctx.dailyEvent)
    .replace(/\{target\}/g, target)
    .replace(/\{victim\}/g, victim)
    .replace(/\{accuser\}/g, accuser);
}

export function selectPhrase(type: MessageType, ctx: BotContext, rng: Rng): string {
  const exclusive = getExclusivePhrases(ctx.role, type);
  const generic = getGenericPhrases(type);
  const genLen = generic.length;
  const exLen = exclusive.length;

  let raw: string;
  if (exLen > 0 && genLen > 0) {
    const bias = 3 / (3 + genLen / exLen);
    raw = rng() < bias ? randomFrom(exclusive, rng) : randomFrom(generic, rng);
  } else if (exLen > 0) {
    raw = randomFrom(exclusive, rng);
  } else {
    raw = randomFrom(generic, rng);
  }

  if (ctx.role === "geni" && type === "ACCUSE" && ctx.botoId && ctx.accuseTargetId === ctx.botoId) {
    raw = "Tem alguém aqui que não é o que parece. Eu sei reconhecer o tipo.";
  }
  if (ctx.role === "cangaceiro" && type === "ACCUSE" && ctx.iaraId && ctx.accuseTargetId === ctx.iaraId) {
    raw = "Tem alguém aqui que não é de Bucaré. Eu sei.";
  }

  let phrase = fillTemplates(raw, ctx);
  if (ctx.role === "cartomante" && type === "ACCUSE" && rng() < 0.6) {
    phrase = phrase.replace(/\{target\}/g, "alguém aqui");
  }

  const cfg = getCharacterConfig(ctx.role);
  if (cfg.postProcess) phrase = cfg.postProcess(phrase, ctx, rng);
  return phrase;
}
