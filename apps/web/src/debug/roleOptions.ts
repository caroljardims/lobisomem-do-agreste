import type { RoleId } from "folclore-game-engine";

export const DEBUG_ALL_ROLES: RoleId[] = [
  "lobisomem",
  "saci",
  "boto",
  "mula",
  "iara",
  "curupira",
  "boitata",
  "aldeao",
  "delegado",
  "doutor",
  "cartomante",
  "padre",
  "coronel",
  "bras_cubas",
  "geni",
  "cangaceiro",
  "mae_de_santo",
];

/** Readable labels aligned with ROLE_DISPLAY (without emoji duplication in dropdown). */
export const DEBUG_ROLE_LABELS: Record<RoleId, string> = {
  lobisomem: "Lobisomem",
  saci: "Saci Pererê",
  boto: "Boto Cor-de-Rosa",
  mula: "Mula sem Cabeça",
  iara: "Iara",
  curupira: "Curupira",
  boitata: "Boitatá",
  aldeao: "Aldeão",
  delegado: "Delegado",
  doutor: "Doutor",
  cartomante: "Cartomante",
  padre: "Padre",
  coronel: "Coronel",
  bras_cubas: "Brás Cubas",
  geni: "Geni",
  cangaceiro: "Cangaceiro",
  mae_de_santo: "Mãe de Santo",
};
