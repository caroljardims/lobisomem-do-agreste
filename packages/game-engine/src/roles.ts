import type { RoleId, Side } from "./types.js";

export const ROLE_SIDE: Record<RoleId, Side> = {
  lobisomem: "criatura",
  saci: "criatura",
  mula: "criatura",
  boto: "criatura",
  iara: "criatura",
  geni: "neutro",
  bras_cubas: "neutro",
  cangaceiro: "neutro",
  curupira: "morador",
  doutor: "morador",
  mae_de_santo: "morador",
  delegado: "morador",
  boitata: "morador",
  cartomante: "morador",
  coronel: "morador",
  padre: "morador",
  aldeao: "morador",
};

export const CREATURE_ROLES: RoleId[] = [
  "lobisomem",
  "saci",
  "mula",
  "boto",
  "iara",
];

export const NEUTRAL_ROLES: RoleId[] = ["geni", "bras_cubas", "cangaceiro"];

export function isCreatureRole(role: RoleId): boolean {
  return ROLE_SIDE[role] === "criatura";
}

export function displayRoleName(role: RoleId): string {
  const map: Record<RoleId, string> = {
    lobisomem: "Lobisomem",
    saci: "Saci Pererê",
    mula: "Mula sem Cabeça",
    boto: "Boto Cor-de-Rosa",
    iara: "Iara",
    geni: "Geni",
    bras_cubas: "Brás Cubas",
    cangaceiro: "Cangaceiro",
    curupira: "Curupira",
    doutor: "Doutor",
    mae_de_santo: "Mãe de Santo",
    delegado: "Delegado",
    boitata: "Boitatá",
    cartomante: "Cartomante",
    coronel: "Coronel",
    padre: "Padre",
    aldeao: "Aldeão",
  };
  return map[role];
}
