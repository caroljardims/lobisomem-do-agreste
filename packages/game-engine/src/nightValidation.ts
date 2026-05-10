import type { NightActionInput, PlayerDawnState } from "./types.js";
import type { RoleId } from "./types.js";

export interface NightValidationContext {
  round: number;
  /** Quem está autorizado a agir neste passo. */
  expectedRole: RoleId;
  /** Se o jogador está bloqueado pela noite anterior (Saci). */
  blockedNextNight?: boolean;
}

export function validateNightAction(
  ctx: NightValidationContext,
  player: PlayerDawnState,
  submission: NightActionInput,
): { ok: true } | { ok: false; error: string } {
  if (!player.alive || player.eliminated || player.expelled) {
    return { ok: false, error: "Jogador não pode agir." };
  }
  if (ctx.blockedNextNight) {
    return { ok: false, error: "Habilidade bloqueada nesta noite." };
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
  return { ok: true };
}
