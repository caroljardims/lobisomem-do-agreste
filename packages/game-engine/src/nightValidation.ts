import type { NightActionInput, PlayerDawnState } from "./types.js";
import type { RoleId } from "./types.js";

export interface NightValidationContext {
  round: number;
  /** Quem está autorizado a agir neste passo. */
  expectedRole: RoleId;
  /** Congelado no início da partida (`gameTablePlayerCount`). Mesa de 5: Curupira/Boitatá não podem declarar criaturas. */
  tablePlayerCount?: number;
  /**
   * Alvos já usados em investigação/conversa (noites anteriores).
   * Cartomante, Boitatá e Geni (conversa) não podem repetir o mesmo jogador.
   */
  priorInvestigationTargetIds?: string[];
}

export function validateNightAction(
  ctx: NightValidationContext,
  player: PlayerDawnState,
  submission: NightActionInput,
): { ok: true } | { ok: false; error: string } {
  if (!player.alive || player.eliminated || player.expelled) {
    return { ok: false, error: "Jogador não pode agir." };
  }
  if (submission.role !== player.role) {
    return { ok: false, error: "Papel incorreto." };
  }
  if (submission.role !== ctx.expectedRole) {
    return { ok: false, error: "Não é sua vez nesta fase." };
  }
  if (player.role === "doutor" && submission.targetId && player.doctorLastTargetId === submission.targetId) {
    return { ok: false, error: "Doutor não pode salvar o mesmo alvo em noites consecutivas." };
  }
  if (player.role === "lobisomem" && submission.action === "bite" && player.wolfBiteUsed) {
    return { ok: false, error: "Morder já foi usado nesta partida." };
  }
  if (player.role === "mula" && submission.action === "exorcize" && player.mulaExorcizeUsed) {
    return { ok: false, error: "Exorcismo da Vingança já foi usado nesta partida." };
  }
  if (player.role === "geni" && submission.action === "charm" && player.geniCharmUsed) {
    return { ok: false, error: "Charme de Verdade já foi usado nesta partida." };
  }
  if (
    player.role === "iara" &&
    submission.action === "seduce" &&
    player.iaraSeductionBlockedThroughRound != null &&
    ctx.round <= player.iaraSeductionBlockedThroughRound
  ) {
    return { ok: false, error: "Sedução bloqueada após o uso da Voz Encantadora." };
  }
  if (player.role === "delegado") {
    const last = player.delegadoLastJailedId ?? null;
    const isPass =
      submission.action === "pass" || (submission.action === "jail" && !submission.targetId);
    if (isPass) {
      if (submission.targetId) {
        return { ok: false, error: "Para passar, não selecione alvo." };
      }
      if (submission.specialAction?.trim()) {
        return { ok: false, error: "Para passar, não informe motivo de prisão." };
      }
      return { ok: true };
    }
    if (submission.action === "jail" && submission.targetId) {
      if (!submission.specialAction?.trim()) {
        return { ok: false, error: "Motivo da prisão é obrigatório quando prende alguém." };
      }
      if (last === submission.targetId) {
        return { ok: false, error: "Não pode prender a mesma pessoa em noites seguidas." };
      }
      return { ok: true };
    }
    return { ok: false, error: "Ação inválida para o Delegado." };
  }
  if (submission.action === "pass") {
    const allowPass =
      player.role === "geni" ||
      player.role === "doutor" ||
      player.role === "mae_de_santo" ||
      ((player.role === "cartomante" || player.role === "boitata") && ctx.round > 1);
    if (!allowPass) {
      return { ok: false, error: "Este personagem não pode passar a noite desta forma." };
    }
    if (submission.targetId) {
      return { ok: false, error: "Para passar, não selecione alvo." };
    }
    if (submission.specialAction?.trim()) {
      return { ok: false, error: "Para passar, não use alinhamento ou outros campos extras." };
    }
    return { ok: true };
  }
  if (player.role === "doutor" && submission.action === "save" && !submission.targetId) {
    return { ok: false, error: "Escolha quem salvar ou use Passar." };
  }
  if (player.role === "mae_de_santo" && submission.action === "invoke" && !submission.targetId) {
    return { ok: false, error: "Escolha quem invocar ou use Passar." };
  }
  if (player.role === "cartomante" && submission.action === "investigate" && !submission.targetId) {
    return { ok: false, error: "Escolha alguém para investigar ou use Passar." };
  }
  if (player.role === "boitata" && submission.action === "investigate" && !submission.targetId) {
    return { ok: false, error: "Escolha alguém para investigar ou use Passar." };
  }
  if (player.role === "geni" && submission.action === "converse" && !submission.targetId) {
    return { ok: false, error: "Escolha com quem conversar ou use Passar." };
  }
  if (player.role === "geni" && submission.action === "charm" && !submission.targetId) {
    return { ok: false, error: "Escolha quem proteger com o Charme ou use Passar." };
  }
  const prior = ctx.priorInvestigationTargetIds ?? [];
  if (submission.targetId && prior.includes(submission.targetId)) {
    if (
      player.role === "cartomante" ||
      player.role === "boitata" ||
      (player.role === "geni" && submission.action === "converse")
    ) {
      return { ok: false, error: "Esse jogador já foi alvo da sua ação em uma noite anterior." };
    }
  }

  const fiveNeutralTown = ctx.tablePlayerCount === 5 && (player.role === "curupira" || player.role === "boitata");
  if (fiveNeutralTown && submission.specialAction === "criaturas") {
    return {
      ok: false,
      error: "Em mesa de cinco jogadores, Curupira e Boitatá ficam ao lado dos moradores no placar — não é possível alinhar com o folclore.",
    };
  }
  if (
    ctx.round === 1 &&
    (player.role === "curupira" || player.role === "boitata") &&
    submission.action !== "pass"
  ) {
    if (!fiveNeutralTown) {
      const al = submission.specialAction;
      if (al !== "moradores" && al !== "criaturas") {
        return { ok: false, error: "Na 1ª noite escolha moradores ou criaturas antes de confirmar." };
      }
    }
  }

  return { ok: true };
}
