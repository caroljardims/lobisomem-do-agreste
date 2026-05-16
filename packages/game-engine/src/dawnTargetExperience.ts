/** Mensagens privadas ao alvo — perspectiva do afetado, sem nomear o causador (cordel / Bucaré). */

export const TARGET_CURUPIRA_PROTECTED = `Algo velou por você esta noite.
Uma presença da mata, talvez.
Você não sabe o que te rondou —
mas alguma coisa ficou entre você e o perigo.`;

export const TARGET_DOUTOR_SAVED = `Você sentiu algo diferente nesta noite.
Uma mão invisível o curou do golpe fatal.
Alguém em Bucaré se preocupou com você.`;

export const TARGET_GENI_CHARME = `Esta noite foi estranhamente boa.
Nada de ruim chegou perto de você.
Às vezes Bucaré protege quem menos espera.`;

export const TARGET_PADRE_CATECHIZED = `Uma paz incomum te acompanhou hoje.
Como se uma bênção tivesse pousado sobre você
sem pedir licença.`;

export const TARGET_WOLF_PROTECTED = `Esta noite alguém ou algo tentou te alcançar.
Você não sabe o que foi —
mas sentiu que o perigo passou perto
e não conseguiu chegar.`;

export const TARGET_MULA_TERROR_FAILED = `Um barulho distante na madrugada.
Uma sensação de que algo tentou te alcançar
— e não conseguiu.
Bucaré te protegeu desta vez.`;

export const TARGET_MULA_EXORCIZE_FAILED = TARGET_MULA_TERROR_FAILED;

export const TARGET_BOTO_ENCHANT_FAILED = `Você sonhou com algo estranho —
mas o sonho não ficou.
Algo tentou entrar e foi embora sem conseguir.`;

export const TARGET_IARA_SEDUCE_FAILED = `Uma voz tentou te chamar pelo rio esta noite.
Mas alguma coisa te manteve firme.
Você nem sabe o que foi —
mas acordou inteiro.`;

export const TARGET_SACI_STEAL_FAILED = `Um redemoinho tentou passar pelo seu quarto.
Mas não entrou.
Sua habilidade está intacta —
alguém ou algo te guardou.`;

export const TARGET_WOLF_BITTEN = `Você foi mordido esta noite.
Não viu quem. Não ouviu passos.
Só sentiu — e agora carrega algo que não tinha antes.
Amanhã sentirá sede de sangue.`;

export const TARGET_MULA_TERRORIZED = `O terror te acordou antes do sol.
Algo passou pela sua porta esta noite —
sem cabeça, sem nome, sem piedade.
Você vai ficar em silêncio no início do dia.
Não consegue evitar.`;

export const TARGET_BOTO_ENCHANTED = `Você teve um "sonho" muito vívido esta noite.
Um rosto, uma voz, uma sensação de encantamento.
Quando acordar, vai perceber que não consegue
votar contra certas pessoas —
não sabe explicar por quê.`;

export const TARGET_IARA_SEDUCED = `A noite foi longa e estranha.
Uma voz d'água entrou pelos seus sonhos.
Você vai tentar votar —
e vai descobrir que não consegue.`;

export const TARGET_SACI_STOLEN = `Algo foi mexido enquanto você dormia.
Um redemoinho passou pelo seu quarto,
ou foi impressão?
Amanhã sua habilidade não vai responder.
Alguém levou o que era seu.`;

export const TARGET_DELEGADO_JAILED = `A lei de Bucaré tem braços longos esta noite.
Você foi detido — hoje você não vota.`;

export const TARGET_GENI_CONVERSATION = `A noite foi de prazer. Você engajou numa conversa que revelou mais do que parecia.
Você não percebeu — mas foi ouvido.`;

export const TARGET_INVESTIGATED_OBSERVED = `Alguém em Bucaré te observou do além esta noite.
Você não sabe quem.
Mas alguém sabe mais sobre você agora.`;

/** Abertura do dia (finalizeNight), antes do folhetim de abertura — encantado pelo Boto. */
export const DAY_PRIMER_ENCHANTED = `Algo desta noite ainda te afeta.
Você vai tentar votar —
e vai sentir que não consegue contra certas pessoas.
Não sabe explicar. Bucaré tem seus mistérios.`;

/** Abertura do dia — seduzido pela Iara. */
export const DAY_PRIMER_SEDUCED = `Uma voz da noite ainda ressoa.
Hoje você não vai conseguir votar.
Não é escolha — é encantamento.`;

export type QueuedPrivate = { playerId: string; message: string };
