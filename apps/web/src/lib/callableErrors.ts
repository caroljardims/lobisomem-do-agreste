import { FirebaseError } from "firebase/app";

const SERVER_SIDE_PT =
  "Algo falhou no servidor ao processar seu pedido. Espere um instante e tente de novo; se repetir, recarregue a página ou entre de novo na conta.";

function isGenericCloudMessage(m: string): boolean {
  const u = m.trim().toUpperCase();
  return (
    u === "INTERNAL" ||
    u === "UNKNOWN" ||
    u === "UNAVAILABLE" ||
    u === "NOT_FOUND" ||
    u === "PERMISSION_DENIED" ||
    u === "FAILED_PRECONDITION" ||
    u === "INVALID_ARGUMENT" ||
    u === "RESOURCE_EXHAUSTED" ||
    u === "UNAUTHENTICATED" ||
    u === "DEADLINE_EXCEEDED" ||
    u === "ABORTED" ||
    u === "CANCELED" ||
    u.length < 4
  );
}

/** Converte erros de `httpsCallable` em texto legível para o jogador. */
export function mapCallableError(e: unknown): string {
  if (e instanceof FirebaseError) {
    const { code, message } = e;
    const msg = (message || "").trim();

    switch (code) {
      case "functions/internal":
      case "functions/data-loss":
      case "functions/unknown":
        return SERVER_SIDE_PT;
      case "functions/unavailable":
      case "functions/deadline-exceeded":
        return "Conexão ou servidor demoraram a responder. Verifique a internet e tente novamente.";
      case "functions/unauthenticated":
        return "Sua sessão pode ter expirado. Entre de novo na conta e tente outra vez.";
      case "functions/permission-denied":
        return msg && !isGenericCloudMessage(msg) ? msg : "Você não tem permissão para essa ação.";
      case "functions/not-found":
        return msg && !isGenericCloudMessage(msg) ? msg : "Não encontramos essa sala ou o código não existe.";
      case "functions/failed-precondition":
        return msg && !isGenericCloudMessage(msg) ? msg : "Não dá para fazer isso agora no estado do jogo.";
      case "functions/invalid-argument":
        return msg && !isGenericCloudMessage(msg) ? msg : "Algum dado enviado é inválido.";
      case "functions/resource-exhausted":
        return msg && !isGenericCloudMessage(msg) ? msg : "Muitas tentativas ou recurso esgotado. Tente de novo em instantes.";
      case "functions/aborted":
        return msg && !isGenericCloudMessage(msg) ? msg : "A operação foi interrompida.";
      case "functions/canceled":
        return "Operação cancelada.";
      default:
        if (msg && !isGenericCloudMessage(msg)) return msg;
        return "Não foi possível completar a ação. Tente novamente.";
    }
  }
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  return "Erro inesperado. Tente novamente.";
}
