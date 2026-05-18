/** Pergunta em itálico no centro da tela de noite (estilo protótipo). */
export function nightPrompt(
  role: string | null,
  opts: {
    myTurn: boolean;
    action: string;
    suspicionOnly: boolean;
    waiting: boolean;
  },
): string {
  if (opts.suspicionOnly) {
    return "Quem na vila você desconfia ser inimigo?";
  }
  if (opts.waiting && !opts.myTurn) {
    return "A vila dorme. Aguarde o amanhecer.";
  }
  if (!opts.myTurn) {
    return "A vila dorme. Aguarde o amanhecer.";
  }
  if (opts.action === "pass") {
    if (role === "delegado") return "Delegado, vai prender alguém esta noite?";
    if (role === "geni") return "Geni, vai usar algum poder esta noite?";
    if (role === "doutor") return "Doutor, vai salvar alguém esta noite?";
    if (role === "mae_de_santo") return "Mãe de Santo, vai invocar alguém esta noite?";
    return "Vai agir esta noite, ou prefere passar?";
  }
  const byRole: Record<string, string> = {
    lobisomem: "Lobisomem, quem você caça esta noite?",
    saci: "Saci, de quem você rouba o poder esta noite?",
    mula: "Mula, quem você aterroriza esta noite?",
    boto: "Boto, quem você enfeitiça esta noite?",
    iara: "Iara, quem é o alvo desta noite?",
    curupira: "Curupira, quem você protege esta noite?",
    doutor: "Doutor, quem você salva esta noite?",
    mae_de_santo: "Mãe de Santo, quem você invoca esta noite?",
    geni: "Geni, com quem você conversa esta noite?",
    boitata: "Boitatá, quem você investiga esta noite?",
    cartomante: "Cartomante, quem você investiga esta noite?",
    delegado: "Delegado, quem você prende esta noite?",
    padre: "Padre, quem você catequiza esta noite?",
    cangaceiro: "Cangaceiro, quem você consulta sobre a Geni?",
  };
  return (role && byRole[role]) || "Escolha um alvo para esta noite.";
}

const NIGHT_EMPTY_CTA: Record<string, string> = {
  lobisomem: "Escolha quem caçar",
  saci: "Escolha de quem roubar",
  mula: "Escolha quem aterrorizar",
  boto: "Escolha quem enfeitiçar",
  iara: "Escolha alguém",
  curupira: "Escolha quem proteger",
  doutor: "Escolha quem salvar",
  mae_de_santo: "Escolha quem invocar",
  geni: "Escolha com quem conversar",
  boitata: "Escolha quem investigar",
  cartomante: "Escolha quem investigar",
  delegado: "Escolha quem prender",
  padre: "Escolha quem catequizar",
  cangaceiro: "Escolha quem consultar",
};

export function nightConfirmLabel(
  role: string | null,
  action: string,
  targetName: string | null,
  sent: boolean,
): string {
  if (sent) return "✓ Ação registrada";
  if (!targetName) {
    if (action === "pass") return "Passar a noite";
    if (role && NIGHT_EMPTY_CTA[role]) return NIGHT_EMPTY_CTA[role];
    return "Escolha alguém";
  }
  const upper = targetName.toUpperCase();
  if (role === "lobisomem" && action === "eliminate") return `Eliminar ${upper}`;
  if (role === "lobisomem" && action === "bite") return `Morder ${upper}`;
  if (role === "mula" && action === "terrorize") return `Aterrorizar ${upper}`;
  if (role === "mula" && action === "exorcize") return `Exorcizar ${upper}`;
  if (role === "saci" && action === "steal") return `Roubar poder de ${upper}`;
  if (role === "boto" && action === "enchant") return `Enfeitiçar ${upper}`;
  if (role === "iara" && action === "seduce") return `Seduzir ${upper}`;
  if (role === "iara" && action === "eliminate_special") return `Voz encantadora em ${upper}`;
  if (role === "curupira" && action === "protect") return `Proteger ${upper}`;
  if (role === "doutor" && action === "save") return `Salvar ${upper}`;
  if (role === "mae_de_santo" && action === "invoke") return `Invocar ${upper}`;
  if (role === "geni" && action === "converse") return `Conversar com ${upper}`;
  if (role === "geni" && action === "charm") return `Charme de verdade em ${upper}`;
  if (role === "boitata" && action === "investigate") return `Investigar ${upper}`;
  if (role === "cartomante" && action === "investigate") return `Investigar ${upper}`;
  if (role === "delegado" && action === "jail") return `Prender ${upper}`;
  if (role === "padre" && action === "catechize") return `Catequizar ${upper}`;
  return `Confirmar ${upper}`;
}

/** Tom visual da fileira selecionada: vermelho só para criaturas. */
export function nightSelectionTone(side: string | null | undefined): "criatura" | "benigno" {
  return side === "criatura" ? "criatura" : "benigno";
}

export function suspicionConfirmLabel(targetName: string | null, sent: boolean): string {
  if (sent) return "✓ Suspeita registrada";
  if (!targetName) return "Escolha alguém";
  return `Desconfio de ${targetName.toUpperCase()}`;
}
