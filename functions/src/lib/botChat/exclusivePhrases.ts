import type { RoleId } from "folclore-game-engine";
import type { MessageType } from "./types.js";

export type ExclusivePools = Partial<Record<MessageType, string[]>>;

/** Role-specific lines (never reveal role identity). */
export const EXCLUSIVE_PHRASES: Partial<Record<RoleId, ExclusivePools>> = {
  lobisomem: {
    ACCUSE: [
      "Tem alguém aqui que não tá sendo honesto. Todo mundo sente, ninguém fala.",
      "Se eu tivesse que escolher agora, seria {target}. E não mudo de ideia fácil.",
    ],
    DEFEND: [
      "Podem me olhar o quanto quiserem. Não vão achar nada.",
      "Tô aqui. Sempre estive. Não tenho onde me esconder.",
    ],
  },
  saci: {
    ALIBI: ["Eu? Tava por aí. Como sempre. kkkkkkk", "Pergunta pra quem me viu — se alguém me viu."],
    ACCUSE: ["Não sei, acho que é {target}. Ou não. Tanto faz."],
    DEFLECT: ["Parem de ser chatos. Isso aqui tá lento demais.", "Vamo logo nisso que eu tenho o que fazer."],
  },
  boto: {
    DOUBT: [
      "Não tô acusando. Só acho {target} interessante hoje.",
      "Curioso o comportamento de {target}. Nada mais.",
    ],
    DEFEND: [
      "Não precisam desconfiar de mim.",
      "Se me conhecessem melhor não perderiam tempo assim.",
    ],
    ALIBI: ["Tava conversando com pessoal. Boa noite, até."],
  },
  mula: {
    ACCUSE: ["Esse aí esconde alguma coisa.", "{target}. Tô de olho."],
    DEFEND: ["Me expulsem. Vão ver."],
    REACT: ["Era de se esperar."],
    ALIBI: ["Tava sozinha. Como sempre."],
  },
  iara: {
    ALIBI: ["Passei o dia perto da água. Estava estranha hoje."],
    REACT: ["{victim} foi. O rio leva muita coisa."],
    DEFLECT: ["Bucaré tem seus mistérios. Deixem estar."],
    DEFEND: ["Quem me conhece sabe o que sou."],
  },
  curupira: {
    ALIBI: ["Tava longe dessa confusão toda."],
    ACCUSE: ["{target} foi visto num lugar que não devia. Não gostei."],
    DOUBT: ["A história de {target} tem buraco."],
    DEFLECT: ["Cuidem do que pisam. Não é simples assim."],
  },
  boitata: {
    DOUBT: ["A história de {target} não bate com o que vi.", "Vi muita coisa essa noite. {target} é suspeito."],
    REACT: ["Era esperado. Os sinais estavam lá."],
    ALIBI: ["Vi muita coisa ontem. Não vou dizer tudo agora."],
  },
  aldeao: {
    ALIBI: ["Tava em casa. Não vi nada, juro."],
    REACT: ["{victim}? Meu Deus. Não esperava isso."],
    ACCUSE: ["Eu não sei não, mas {target}... tem algo errado ali."],
    AGREE: ["Tão certos sobre {target}. Eu também acho."],
  },
  delegado: {
    ALIBI: ["Tava de ronda. Tudo registrado."],
    ACCUSE: ["Preciso que {target} explique onde estava e o que fez."],
    DEFEND: ["Tenho registro de tudo. Podem verificar."],
    DOUBT: ["{target} não prestou satisfação ainda. Isso me incomoda."],
  },
  doutor: {
    REACT: ["Mais um. Essa cidade vai me dar trabalho."],
    ACCUSE: ["{target} tá com uma cara que já vi antes. Não é bom sinal."],
    DEFLECT: ["Parem de especular sem dados. Não ajuda ninguém."],
    ALIBI: ["Tava atendendo. Sempre tem alguém pra atender."],
    DOUBT: ["A explicação de {target} tem furo. Eu sei reconhecer."],
  },
  cartomante: {
    DOUBT: ["Não vou dizer o nome. Mas {target} tem algo que não fecha."],
    REACT: ["Eu sabia que alguém iria. Não sabia quem."],
    ALIBI: ["Tava ocupada com o que é meu. Sempre tem o que ler."],
    ACCUSE: ["Alguém aqui sabe mais do que fala. Muito mais."],
  },
  padre: {
    ACCUSE: ["{target} precisa examinar sua consciência."],
    DEFEND: ["Minha vida é aberta. Não tenho o que esconder."],
    REACT: ["Que Deus tenha misericórdia de {victim}. E de nós."],
    AGREE: ["{target} precisa responder. A verdade exige isso."],
  },
  coronel: {
    ALIBI: ["Tava cuidando do que é meu. Como sempre."],
    ACCUSE: ["{target} vai ter que me dar satisfação."],
    DEFEND: ["Nessa cidade, todos me conhecem. Basta isso."],
    REACT: ["Isso não devia ter acontecido. Alguém vai pagar."],
  },
  bras_cubas: {
    REACT: ["{victim} foi. A morte é a única coisa honesta nessa cidade."],
    DEFLECT: ["Continuem. Estou aqui observando o espetáculo."],
    ALIBI: ["Tava pensando. Vocês não fariam isso."],
    DOUBT: ["Tem algo errado aqui que vai além de {target}."],
  },
  geni: {
    ACCUSE: ["{target} tá diferente hoje. Eu noto essas coisas."],
    REACT: ["{victim}... que pena. Eu gostava dessa pessoa."],
    DEFEND: ["Quem me conhece sabe o que sou."],
    ALIBI: ["Conheço essa cidade melhor que ninguém. Vi muita coisa hoje."],
  },
  mae_de_santo: {
    ACCUSE: ["Tem coisa errada em {target}. Não é de hoje."],
    REACT: ["O que veio tinha que vir. {victim} descansa agora."],
    DEFEND: ["Podem me testar. Não tenho medo do que não me pertence."],
    DOUBT: ["{target} tá carregado de algo que não devia carregar."],
    ALIBI: ["Tava no meu lugar. A noite tava agitada, senti desde cedo."],
  },
  cangaceiro: {
    ALIBI: ["Tava pelo sertão. Só."],
    ACCUSE: ["{target}. Tô de olho."],
    DEFEND: ["Podem tentar."],
    REACT: ["Era de esperar."],
  },
};

export function getExclusivePhrases(role: RoleId, type: MessageType): string[] {
  return EXCLUSIVE_PHRASES[role]?.[type] ?? [];
}
