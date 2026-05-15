import { ROLE_DISPLAY } from "./roleStories.js";

/** Tipos gravados em `room.individualWins` (Cloud Functions + engine). */
const INDIVIDUAL_WIN_COPY: Record<string, string> = {
  mula_padre: "A maldição encontrou o Padre — vitória da Mula.",
  iara_delegado: "O Delegado foi levado pelas águas — vitória da Iara.",
  lobisomem_survived_r4: "Quatro luas e a fera ainda de pé — vitória do Lobisomem.",
  boto_all_moradores: "Não sobrou coração de morador sem encanto — vitória do Boto.",
  padre_all_moradores: "A fé cobriu todo morador vivo — vitória do Padre.",
  cangaceiro_iara: "O tiro encontrou a Iara — vitória do Cangaceiro.",
  bras_tolo_encerra: "O Tolo riu por último — Brás Cubas encerra em glória.",
  coronel_acusacao_boitata: "A acusação formal acertou o fogo — vitória do Coronel sobre o Boitatá.",
  curupira_cinco_objetivo:
    "Mesa de cinco: cumpriu o pacto com a mata e sobreviveu — vitória pessoal da Curupira.",
  boitata_cinco_objetivo:
    "Mesa de cinco: leu bem os sinais da cidade e sobreviveu — vitória pessoal do Boitatá.",
};

export type IndividualWinEntry = {
  playerId: string;
  role: string;
  type: string;
  round: number;
  timestamp: number;
};

export function individualWinChronicleLine(
  win: IndividualWinEntry,
  playerName: string,
): string {
  const body = INDIVIDUAL_WIN_COPY[win.type] ?? `Conquista registrada (${win.type}).`;
  const roleLabel = ROLE_DISPLAY[win.role] ?? win.role;
  return `${playerName} (${roleLabel}), rodada ${win.round}: ${body}`;
}
