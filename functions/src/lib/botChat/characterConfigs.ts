import type { RoleId } from "folclore-game-engine";
import type { CharacterConfig, MessageTypeWeights } from "./types.js";
import { postBras, postCangaceiro, postDelegado, postMula, postPadre, postSaci } from "./postProcessing.js";

const W = (
  a: Partial<MessageTypeWeights> & Pick<MessageTypeWeights, "ALIBI">,
): MessageTypeWeights => ({
  ALIBI: a.ALIBI ?? 2,
  ACCUSE: a.ACCUSE ?? 2,
  DEFEND: a.DEFEND ?? 2,
  REACT: a.REACT ?? 2,
  DEFLECT: a.DEFLECT ?? 2,
  AGREE: a.AGREE ?? 2,
  DOUBT: a.DOUBT ?? 2,
});

export const CHARACTER_CONFIGS: Record<RoleId, CharacterConfig> = {
  lobisomem: { weights: W({ ALIBI: 3, ACCUSE: 5, DEFEND: 4, REACT: 3, DEFLECT: 1, AGREE: 2, DOUBT: 3 }), silentRate: 0.1, maxMessages: 3 },
  saci: {
    weights: W({ ALIBI: 3, ACCUSE: 3, DEFEND: 1, REACT: 2, DEFLECT: 5, AGREE: 1, DOUBT: 2 }),
    silentRate: 0.3,
    maxMessages: 2,
    postProcess: postSaci,
  },
  boto: { weights: W({ ALIBI: 4, ACCUSE: 0, DEFEND: 3, REACT: 2, DEFLECT: 3, AGREE: 2, DOUBT: 5 }), silentRate: 0.2, maxMessages: 3 },
  mula: {
    weights: W({ ALIBI: 2, ACCUSE: 5, DEFEND: 4, REACT: 2, DEFLECT: 1, AGREE: 1, DOUBT: 2 }),
    silentRate: 0.4,
    maxMessages: 2,
    postProcess: (p) => postMula(p),
  },
  iara: { weights: W({ ALIBI: 3, ACCUSE: 0, DEFEND: 2, REACT: 4, DEFLECT: 4, AGREE: 0, DOUBT: 0 }), silentRate: 0.4, maxMessages: 1 },
  curupira: { weights: W({ ALIBI: 3, ACCUSE: 4, DEFEND: 2, REACT: 2, DEFLECT: 2, AGREE: 0, DOUBT: 3 }), silentRate: 0.25, maxMessages: 2 },
  boitata: { weights: W({ ALIBI: 2, ACCUSE: 3, DEFEND: 2, REACT: 3, DEFLECT: 0, AGREE: 2, DOUBT: 5 }), silentRate: 0.05, maxMessages: 3 },
  aldeao: { weights: W({ ALIBI: 4, ACCUSE: 3, DEFEND: 2, REACT: 3, DEFLECT: 2, AGREE: 5, DOUBT: 2 }), silentRate: 0.1, maxMessages: 3 },
  delegado: {
    weights: W({ ALIBI: 3, ACCUSE: 5, DEFEND: 3, REACT: 2, DEFLECT: 0, AGREE: 2, DOUBT: 4 }),
    silentRate: 0.05,
    maxMessages: 3,
    postProcess: (p) => postDelegado(p),
  },
  doutor: { weights: W({ ALIBI: 3, ACCUSE: 3, DEFEND: 3, REACT: 4, DEFLECT: 3, AGREE: 1, DOUBT: 4 }), silentRate: 0.15, maxMessages: 2 },
  cartomante: { weights: W({ ALIBI: 3, ACCUSE: 2, DEFEND: 2, REACT: 4, DEFLECT: 0, AGREE: 0, DOUBT: 5 }), silentRate: 0.2, maxMessages: 2 },
  padre: {
    weights: W({ ALIBI: 3, ACCUSE: 4, DEFEND: 4, REACT: 3, DEFLECT: 2, AGREE: 3, DOUBT: 0 }),
    silentRate: 0.1,
    maxMessages: 3,
    postProcess: postPadre,
  },
  coronel: { weights: W({ ALIBI: 3, ACCUSE: 5, DEFEND: 4, REACT: 2, DEFLECT: 1, AGREE: 0, DOUBT: 3 }), silentRate: 0.05, maxMessages: 3 },
  bras_cubas: {
    weights: W({ ALIBI: 2, ACCUSE: 2, DEFEND: 1, REACT: 4, DEFLECT: 4, AGREE: 0, DOUBT: 3 }),
    silentRate: 0.05,
    maxMessages: 3,
    postProcess: postBras,
  },
  cangaceiro: {
    weights: W({ ALIBI: 3, ACCUSE: 4, DEFEND: 3, REACT: 2, DEFLECT: 0, AGREE: 0, DOUBT: 2 }),
    silentRate: 0.35,
    maxMessages: 2,
    postProcess: (p) => postCangaceiro(p),
  },
  geni: { weights: W({ ALIBI: 3, ACCUSE: 4, DEFEND: 3, REACT: 3, DEFLECT: 2, AGREE: 2, DOUBT: 3 }), silentRate: 0.15, maxMessages: 3 },
  mae_de_santo: { weights: W({ ALIBI: 2, ACCUSE: 3, DEFEND: 3, REACT: 4, DEFLECT: 0, AGREE: 0, DOUBT: 4 }), silentRate: 0.25, maxMessages: 2 },
};

/** Ensure every engine role has config (fallback morador-like). */
export function getCharacterConfig(role: RoleId): CharacterConfig {
  return CHARACTER_CONFIGS[role] ?? CHARACTER_CONFIGS.aldeao;
}
