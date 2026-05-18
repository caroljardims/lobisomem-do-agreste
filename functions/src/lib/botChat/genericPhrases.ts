import type { MessageType } from "./types.js";

const ALIBI: string[] = [
  "{event}. Não vi nada fora do comum.",
  "Passei o dia {event}. Alguém pode confirmar se precisar.",
  "Tava {event} quando soube do que aconteceu.",
  "{event} até tarde. Cheguei cansado.",
  "Minha manhã foi {event}. Simples assim.",
  "Fiz o que faço todo dia — {event}. Nada diferente.",
  "{event}. Tem testemunha se precisar.",
  "Dia normal pra mim. {event}, como sempre.",
];

const ACCUSE: string[] = [
  "{target} não tá falanado? Estranho, pra essa hora...",
  "Alguém mais reparou em {target} hoje?",
  "Não tô acusando, mas {target} me deixou desconfiado.",
  "O que {target} tava fazendo quando tudo aconteceu?",
  "{target} não tá me convencendo.",
  "Tem algo errado com {target}. Não sei explicar.",
  "{target} desviou o assunto cedo demais.",
  "Olhem pra {target}. Só isso.",
];

const DEFEND: string[] = [
  "Não tenho nada a ver com isso.",
  "Tão no lugar errado procurando.",
  "Me expulsem se quiserem. Vão arrepender.",
  "Não preciso me justificar pra ninguém aqui.",
  "Façam o que acharem melhor. Eu sei o que sou.",
  "Podem me acusar. A verdade aparece sozinha.",
  "Tô de consciência limpa.",
  "Procurem melhor. Não é aqui.",
];

const REACT: string[] = [
  "{victim} foi... não esperava.",
  "Isso muda tudo. {victim} era importante.",
  "Que seja feita justiça por {victim}.",
  "{victim}. Bucaré perdeu alguém hoje.",
  "Não acredito. {victim}?",
  "Isso é grave. {victim} foi.",
  "{victim} não merecia.",
  "A cidade fica mais fraca sem {victim}.",
  "Sem {victim}, a praça fica diferente.",
  "Puxa vida, {victim}...",
  "Difícil acreditar em {victim}.",
  "O povo de Bucaré sente falta de {victim}.",
  "Com {victim} fora, sobra desconfiança.",
  "Que notícia dura sobre {victim}.",
  "{victim} deixou um buraco aqui.",
  "Isso com {victim} não faz sentido pra mim.",
];

const DEFLECT: string[] = [
  "Vamos pensar com calma antes de sair acusando.",
  "Não é tão simples quanto parece.",
  "Tão olhando pro lugar errado.",
  "Bucaré tá nervosa hoje. Cuidado com decisão por impulso.",
  "Quem grita mais alto não é necessariamente inocente.",
  "Precisamos de mais informação antes de votar.",
  "Errar aqui pode custar caro pra todo mundo.",
  "Calma. Decisão com raiva é decisão errada.",
];

const AGREE: string[] = [
  "Também tô desconfiando de {target}.",
  "Concordo. {target} precisa explicar melhor.",
  "Tava pensando a mesma coisa sobre {target}.",
  "Se vocês acham que é {target}, eu topo.",
  "{target}. Faz sentido.",
  "Não é à toa que todo mundo olha pra {target}.",
  "Acho que tão certos sobre {target}.",
  "Meu voto vai pra {target} se nada mudar.",
];

const DOUBT: string[] = [
  "A história de {target} não fecha direito.",
  "Alguém mais achou estranha a explicação de {target}?",
  "{target} foi {event}? Ao mesmo tempo que tudo aconteceu?",
  "Não tô convencido com o que {target} disse.",
  "{target} sabe mais do que tá falando.",
  "Por que {target} não comentou sobre o que aconteceu?",
  "{target} tá quieto de um jeito que me preocupa.",
  "Algo na história de {target} não bate.",
];

const POOLS: Record<MessageType, string[]> = {
  ALIBI,
  ACCUSE,
  DEFEND,
  REACT,
  DEFLECT,
  AGREE,
  DOUBT,
};

export function getGenericPhrases(type: MessageType): string[] {
  return POOLS[type];
}
