export const AVATAR_GLYPHS = ["☽", "✦", "◆", "❖", "✧", "☆", "★", "◉"] as const;

/** Símbolo estável por jogador (protótipo usa ✶ ◆ etc. nas fileiras). */
export function stablePlayerGlyph(playerId: string, selfId: string, selfGlyph: string): string {
  if (playerId === selfId) return selfGlyph;
  let h = 0;
  for (let i = 0; i < playerId.length; i++) h = (h * 31 + playerId.charCodeAt(i)) | 0;
  return AVATAR_GLYPHS[Math.abs(h) % AVATAR_GLYPHS.length] ?? "✦";
}
