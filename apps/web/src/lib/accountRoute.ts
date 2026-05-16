export type AccountTab = "estatisticas" | "historico" | "favoritos" | "ranking";

const TAB_SET = new Set<AccountTab>(["estatisticas", "historico", "favoritos", "ranking"]);

export function isMinhaContaPathname(pathname: string): boolean {
  return pathname === "/minha-conta";
}

export function parseAccountTab(search: string): AccountTab {
  const t = new URLSearchParams(search).get("tab") ?? "";
  return TAB_SET.has(t as AccountTab) ? (t as AccountTab) : "estatisticas";
}

export function readAccountRoute(): { open: boolean; tab: AccountTab } {
  return {
    open: isMinhaContaPathname(window.location.pathname),
    tab: parseAccountTab(window.location.search),
  };
}

/** One-shot: old hash routes → real path (SPA). */
export function migrateAccountHashToPathname(): void {
  const h = (window.location.hash ?? "").replace(/\/$/, "");
  if (h === "#/minha-conta") {
    window.history.replaceState(null, "", "/minha-conta");
    window.location.hash = "";
    return;
  }
  if (h === "#/ranking") {
    window.history.replaceState(null, "", "/minha-conta?tab=ranking");
    window.location.hash = "";
  }
}

export function accountPathForTab(tab: AccountTab): string {
  return tab === "estatisticas" ? "/minha-conta" : `/minha-conta?tab=${tab}`;
}

export function navigateAccount(tab: AccountTab, opts?: { replace?: boolean }): void {
  const path = accountPathForTab(tab);
  if (opts?.replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.dispatchEvent(new Event("folhetim-route"));
}

export function closeAccountToHome(): void {
  window.history.replaceState(null, "", "/");
  window.dispatchEvent(new Event("folhetim-route"));
}
