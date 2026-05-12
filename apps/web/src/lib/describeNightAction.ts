export function describeNightAction(
  actorName: string,
  role: string,
  action: string,
  targetName: string,
  specialAction?: string | null,
): string {
  switch (role) {
    case "lobisomem":
      return action === "bite"
        ? `${actorName} mordeu ${targetName}`
        : `${actorName} tentou eliminar ${targetName}`;
    case "saci":
      return `${actorName} bloqueou ${targetName} para a próxima noite`;
    case "mula":
      return action === "exorcize"
        ? `${actorName} usou o Exorcismo da Vingança em ${targetName}`
        : `${actorName} aterrorizou ${targetName}`;
    case "boto":
      return `${actorName} enfeitiçou ${targetName}`;
    case "iara":
      return action === "eliminate_special"
        ? `${actorName} usou a Voz Encantadora em ${targetName}`
        : `${actorName} seduziu ${targetName}`;
    case "curupira":
      return `${actorName} protegeu ${targetName}`;
    case "doutor":
      return `${actorName} tentou salvar ${targetName}`;
    case "mae_de_santo":
      return `${actorName} invocou ${targetName}`;
    case "geni":
      return action === "charm"
        ? `${actorName} usou o Charme de Verdade em ${targetName}`
        : `${actorName} conversou com ${targetName}`;
    case "padre":
      return `${actorName} catequizou ${targetName}`;
    case "boitata":
      return `${actorName} investigou ${targetName}`;
    case "cartomante":
      return `${actorName} investigou ${targetName}`;
    case "delegado": {
      const reason = specialAction?.trim();
      return reason
        ? `${actorName} prendeu ${targetName} — "${reason}"`
        : `${actorName} prendeu ${targetName}`;
    }
    case "cangaceiro":
      return action === "pass"
        ? `${actorName} não consultou Geni nesta noite`
        : `${actorName} consultou se Geni já havia conversado com ${targetName}`;
    default:
      return "";
  }
}
