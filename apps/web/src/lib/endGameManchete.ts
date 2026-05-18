import type { PlayerDoc, RoomDoc } from "../types.js";
import { ROLE_DISPLAY } from "./roleStories.js";

export type EndManchete = {
  manchete: string;
  body: string;
};

const SIDE_OF_ROLE: Record<string, string> = {
  lobisomem: "criatura",
  saci: "criatura",
  mula: "criatura",
  boto: "criatura",
  iara: "criatura",
  curupira: "neutro",
  doutor: "morador",
  mae_de_santo: "morador",
  geni: "morador",
  boitata: "neutro",
  cartomante: "morador",
  delegado: "morador",
  cangaceiro: "morador",
  padre: "morador",
  coronel: "morador",
  aldeao: "morador",
  bras_cubas: "neutro",
};

function playerWithRole(
  players: PlayerDoc[],
  revealed: Record<string, string>,
  roleId: string,
): string | null {
  const p = players.find((pl) => revealed[pl.id ?? ""] === roleId);
  return p?.name ?? null;
}

function firstCreatureName(players: PlayerDoc[], revealed: Record<string, string>): string | null {
  for (const p of players) {
    const role = revealed[p.id ?? ""];
    if (role && SIDE_OF_ROLE[role] === "criatura") return p.name ?? null;
  }
  return null;
}

/** Manchete e corpo da página 1 da edição final. */
export function buildEndManchete(room: RoomDoc, players: PlayerDoc[]): EndManchete {
  const revealed = room.revealedRoles ?? {};
  const moradoresPlazaTie =
    room.winner === "moradores" && room.collectiveEndKind === "moradores_plaza_tie";

  if (room.winner === "bots") {
    return {
      manchete: "APOCALIPSE ROBÔ",
      body: "As criaturas fugiram. Os moradores sumiram. Algo que não veio do rio, do mato ou do sertão desceu sobre Bucaré — e a praça ficou sem voz de cordel.",
    };
  }

  if (moradoresPlazaTie) {
    return {
      manchete: "A PRAÇA DECIDIU",
      body: "A cidade segurou o fôlego. O folclore e os moradores ficaram frente a frente na praça — iguais em número. No empate, a cidade resistiu. Bucaré pode dormir tranquila.",
    };
  }

  if (room.winner === "moradores") {
    const wolf = playerWithRole(players, revealed, "lobisomem");
    const body = wolf
      ? `A vila identificou o ${ROLE_DISPLAY.lobisomem ?? "Lobisomem"} (${wolf}) e Bucaré pode dormir tranquila.`
      : "O folclore recuou para as sombras. Os moradores venceram — e Bucaré pode dormir tranquila.";
    return {
      manchete: "A VILA VENCEU O FOLCLORE",
      body,
    };
  }

  if (room.winner === "criaturas") {
    const creature = firstCreatureName(players, revealed);
    const body = creature
      ? `Quando a fumaça baixou, o folclore tinha mais sombra do que gente na praça. ${creature} e os demais segredos da noite ficaram por cima.`
      : "Quando a fumaça baixou, havia mais sombra do que gente na praça. O folclore engoliu a vila.";
    return {
      manchete: "AS CRIATURAS DOMINARAM BUCARÉ",
      body,
    };
  }

  const wp = players.find((p) => p.id === room.winner);
  const wpRole = wp ? revealed[wp.id ?? ""] : null;
  const wpName = wp?.name ?? "Alguém";
  const roleLabel = wpRole ? (ROLE_DISPLAY[wpRole] ?? wpRole) : "o destino";
  return {
    manchete: `${wpName.toUpperCase()} VENCEU`,
    body: `${wpName} (${roleLabel}) cumpriu o que veio buscar nesta edição — e a praça ficará tempo contando essa história.`,
  };
}
