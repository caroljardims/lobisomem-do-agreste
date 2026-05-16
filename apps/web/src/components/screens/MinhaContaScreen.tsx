import { ROLE_SIDE, type RoleId } from "folclore-game-engine";
import { updateProfile, type User } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth, db, storage } from "../../firebase.js";
import { ROLE_DISPLAY } from "../../lib/roleStories.js";
import type { AccountTab } from "../../lib/accountRoute.js";
import { navigateAccount } from "../../lib/accountRoute.js";
import { useGameHistoryPage, type GameHistoryRow } from "../../hooks/useGameHistoryPage.js";
import { useLeaderboard } from "../../hooks/useLeaderboard.js";

const ROLE_GRID: RoleId[] = (Object.keys(ROLE_SIDE) as RoleId[]).sort((a, b) => a.localeCompare(b));

const MILESTONES = [50, 150, 300, 500, 1000];

function initialsFromUser(user: User): string {
  const dn = (user.displayName ?? "").trim();
  if (dn) {
    const parts = dn.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return dn.slice(0, 2).toUpperCase();
  }
  const em = (user.email ?? "").trim();
  if (em) return em.slice(0, 2).toUpperCase();
  return "?";
}

function formatPlayedAt(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function sideLabel(side: string): string {
  if (side === "criatura") return "Criatura";
  if (side === "neutro") return "Neutro";
  return "Morador";
}

type ProfileDoc = {
  displayName?: string;
  photoURL?: string | null;
  createdAt?: { toDate?: () => Date };
  gamesPlayed?: number;
  gamesWon?: number;
  totalPoints?: number;
  mvpCount?: number;
  podiumCount?: number;
  bestGame?: number;
  favoriteRole?: string | null;
  isPremium?: boolean;
  favorites?: string[];
  rolePlayCounts?: Record<string, number>;
};

export function MinhaContaScreen(props: {
  user: User;
  tab: AccountTab;
  onClose: () => void;
  onSignOut: () => void | Promise<void>;
}) {
  const { user, tab, onClose, onSignOut } = props;
  const uid = user.uid;
  const [profile, setProfile] = useState<ProfileDoc | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);

  const { top, mine, myRank } = useLeaderboard(uid);
  const { rows: historyRows, hasMore, loading: histLoading, error: histError, loadMore } =
    useGameHistoryPage(uid);

  const [favLocal, setFavLocal] = useState<string[]>([]);
  const favDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [favSavedFlash, setFavSavedFlash] = useState(false);

  useEffect(() => {
    setProfileLoading(true);
    const r = doc(db, "users", uid);
    const unsub = onSnapshot(r, (snap) => {
      setProfile(snap.exists() ? ((snap.data() as ProfileDoc) ?? {}) : null);
      setProfileLoading(false);
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const f = profile?.favorites;
    if (Array.isArray(f)) setFavLocal(f.map(String));
  }, [profile?.favorites]);

  const displayName = (profile?.displayName ?? user.displayName ?? "Jogador").trim() || "Jogador";
  const photoURL = profile?.photoURL ?? user.photoURL ?? null;
  const createdLabel = useMemo(() => {
    const raw = profile?.createdAt;
    const d = raw && typeof raw.toDate === "function" ? raw.toDate() : null;
    if (!d) return null;
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }, [profile?.createdAt]);

  const totalPts = Number(profile?.totalPoints ?? 0);
  const nextMilestone = MILESTONES.find((m) => m > totalPts) ?? MILESTONES[MILESTONES.length - 1]!;
  const prevMilestone = MILESTONES.filter((m) => m <= totalPts).pop() ?? 0;
  const barPct =
    nextMilestone > prevMilestone
      ? Math.min(100, Math.round(((totalPts - prevMilestone) / (nextMilestone - prevMilestone)) * 100))
      : 100;

  const isPremium = profile?.isPremium === true;
  const premiumPrice = import.meta.env.VITE_PREMIUM_PRICE ?? "—";
  const stripeUrl = import.meta.env.VITE_STRIPE_CHECKOUT_URL as string | undefined;

  const flushFavorites = useCallback(
    async (next: string[]) => {
      await setDoc(doc(db, "users", uid), { uid, favorites: next }, { merge: true });
      setFavSavedFlash(true);
      window.setTimeout(() => setFavSavedFlash(false), 1200);
    },
    [uid],
  );

  const scheduleFavoritesWrite = useCallback(
    (next: string[]) => {
      if (favDebounceRef.current) clearTimeout(favDebounceRef.current);
      favDebounceRef.current = setTimeout(() => {
        favDebounceRef.current = null;
        void flushFavorites(next).catch(() => {});
      }, 500);
    },
    [flushFavorites],
  );

  const toggleFavoriteRole = (roleId: RoleId) => {
    if (!isPremium) return;
    setFavLocal((prev) => {
      const has = prev.includes(roleId);
      let next: string[];
      if (has) next = prev.filter((x) => x !== roleId);
      else if (prev.length >= 3) next = [...prev.slice(1), roleId];
      else next = [...prev, roleId];
      scheduleFavoritesWrite(next);
      return next;
    });
  };

  const openEdit = () => {
    setEditName((profile?.displayName ?? user.displayName ?? "").trim());
    setEditOpen(true);
  };

  const cancelEdit = () => {
    setEditOpen(false);
  };

  const saveEdit = async () => {
    setSavingProfile(true);
    try {
      const nameTrim = editName.trim().slice(0, 40) || "Jogador";
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: nameTrim, photoURL: photoURL ?? null }).catch(() => {});
      }
      await setDoc(doc(db, "users", uid), { uid, displayName: nameTrim, photoURL: photoURL ?? null }, { merge: true });
      setToast("Perfil atualizado");
      window.setTimeout(() => setToast(null), 3000);
      setEditOpen(false);
    } catch {
      setToast("Não foi possível salvar.");
      window.setTimeout(() => setToast(null), 3000);
    } finally {
      setSavingProfile(false);
    }
  };

  const onPickAvatar = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setToast("Use JPEG, PNG ou WebP.");
      window.setTimeout(() => setToast(null), 3000);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setToast("Máximo 2 MB.");
      window.setTimeout(() => setToast(null), 3000);
      return;
    }
    setSavingProfile(true);
    try {
      const path = `avatars/${uid}/profile.jpg`;
      const sref = ref(storage, path);
      await uploadBytes(sref, file, { contentType: file.type });
      const url = await getDownloadURL(sref);
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { photoURL: url }).catch(() => {});
      }
      await setDoc(doc(db, "users", uid), { uid, photoURL: url }, { merge: true });
      setToast("Foto atualizada");
      window.setTimeout(() => setToast(null), 3000);
    } catch {
      setToast("Falha no envio da foto.");
      window.setTimeout(() => setToast(null), 3000);
    } finally {
      setSavingProfile(false);
    }
  };

  const myRowInGame = (players: GameHistoryRow["players"]) =>
    players.find((p) => p.uid === uid);

  const tabs: { id: AccountTab; label: string }[] = [
    { id: "estatisticas", label: "Estatísticas" },
    { id: "historico", label: "Histórico" },
    { id: "favoritos", label: "Favoritos" },
    { id: "ranking", label: "Ranking" },
  ];

  return (
    <div className="page page--account page--minha-conta">
      <div className="account-fixed-header">
        <div className="top-bar account-top-bar">
          <button type="button" className="back-link" onClick={onClose}>
            ← voltar
          </button>
          <span className="session-label">Minha conta</span>
          <button type="button" className="back-link account-signout" onClick={() => void onSignOut()}>
            Sair
          </button>
        </div>

        <div className="account-header-card">
          <div className="account-avatar-wrap">
            {photoURL ? (
              <img src={photoURL} alt="" className="account-avatar-img" />
            ) : (
              <span className="account-avatar-initials">{initialsFromUser(user)}</span>
            )}
            {isPremium && (
              <span className="account-premium-star" title="Premium">
                ★
              </span>
            )}
          </div>
          <div className="account-header-text">
            <div className="account-name-row">
              <h1 className="account-display-name">{displayName}</h1>
              {!editOpen && (
                <button type="button" className="account-edit-pencil" onClick={openEdit} aria-label="Editar perfil">
                  ✎
                </button>
              )}
            </div>
            {user.email && <p className="account-email muted">{user.email}</p>}
            {createdLabel && (
              <p className="account-since muted">Jogando desde {createdLabel}</p>
            )}
          </div>
        </div>

        {editOpen && (
          <div className="account-edit-panel">
            <label className="field-label" htmlFor="acc-name">
              Nome
            </label>
            <input
              id="acc-name"
              className="field-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={40}
            />
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)} />
            <button type="button" className="chip-btn" style={{ marginTop: 8 }} onClick={() => fileInputRef.current?.click()}>
              Trocar foto
            </button>
            <div className="account-edit-actions">
              <button type="button" className="chip-btn" onClick={cancelEdit} disabled={savingProfile}>
                Cancelar
              </button>
              <button type="button" className="primary-btn account-save-btn" onClick={() => void saveEdit()} disabled={savingProfile}>
                Guardar
              </button>
            </div>
          </div>
        )}

        <nav className="account-tabs" aria-label="Secções da conta">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tab ? "account-tab account-tab-active" : "account-tab"}
              onClick={() => navigateAccount(t.id, { replace: true })}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="account-scroll">
        {toast && <div className="account-toast">{toast}</div>}

        {tab === "estatisticas" && (
          <div className="account-panel">
            {profileLoading && <p className="muted">Carregando…</p>}
            {!profileLoading && !profile && (
              <p className="muted">Perfil ainda não criado. Jogue uma partida para começar.</p>
            )}
            <div className="account-stat-grid">
              <div className="account-stat-cell">
                <span className="account-stat-val">{Number(profile?.gamesPlayed ?? 0)}</span>
                <span className="account-stat-label">Partidas</span>
              </div>
              <div className="account-stat-cell">
                <span className="account-stat-val">{Number(profile?.gamesWon ?? 0)}</span>
                <span className="account-stat-label">Vitórias</span>
              </div>
              <div className="account-stat-cell">
                <span className="account-stat-val">{Number(profile?.podiumCount ?? 0)}</span>
                <span className="account-stat-label">Pódios</span>
              </div>
              <div className="account-stat-cell">
                <span className="account-stat-val">{Number(profile?.mvpCount ?? 0)}</span>
                <span className="account-stat-label">MVPs</span>
              </div>
            </div>
            <p className="account-rate muted">
              Taxa de vitória:{" "}
              {Number(profile?.gamesPlayed ?? 0) > 0
                ? `${((Number(profile?.gamesWon ?? 0) / Number(profile?.gamesPlayed ?? 1)) * 100).toFixed(0)}%`
                : "—"}
            </p>
            <div className="account-points-block">
              <p>
                <strong>{totalPts}</strong> pontos totais · melhor partida{" "}
                <strong>{Number(profile?.bestGame ?? 0)}</strong> pts
              </p>
              <div className="account-milestone-bar">
                <div className="account-milestone-fill" style={{ width: `${barPct}%` }} />
              </div>
              <p className="muted" style={{ fontSize: 12 }}>
                Próximo marco: {nextMilestone} pts
              </p>
            </div>
            <p>
              <strong>Papel favorito</strong> (automático):{" "}
              {profile?.favoriteRole
                ? ROLE_DISPLAY[profile.favoriteRole] ?? profile.favoriteRole
                : "—"}
            </p>
          </div>
        )}

        {tab === "historico" && (
          <div className="account-panel">
            {histError && <p className="error">{histError}</p>}
            {!histLoading && historyRows.length === 0 && !histError && (
              <div className="account-empty">
                <p className="muted">Ainda não há partidas no seu histórico.</p>
                <button type="button" className="primary-btn" onClick={onClose}>
                  Criar sala
                </button>
              </div>
            )}
            <ul className="account-history-list">
              {historyRows.map((g) => {
                const me = myRowInGame(g.players);
                if (!me) return null;
                const won = Boolean(me.collectiveWin);
                return (
                  <li key={g.id} className="account-history-item">
                    <div className="account-history-head">
                      <div>
                        <strong>{formatPlayedAt(g.playedAt)}</strong>
                        <span className="muted"> · sala {g.roomCode}</span>
                      </div>
                      <span className={won ? "account-badge account-badge-win" : "account-badge account-badge-loss"}>
                        {won ? "Vitória" : "Derrota"}
                      </span>
                    </div>
                    <p className="muted" style={{ margin: "6px 0" }}>
                      {ROLE_DISPLAY[me?.role ?? ""] ?? me?.role} · {sideLabel(String(me?.side ?? ""))} ·{" "}
                      {me?.points ?? 0} pts · #{me?.rank ?? "—"}
                      {me?.individualObjectiveMet ? " · objetivo pessoal ✓" : ""}
                    </p>
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() => setExpandedGameId((id) => (id === g.id ? null : g.id))}
                    >
                      {expandedGameId === g.id ? "Ocultar detalhes" : "Ver detalhes"}
                    </button>
                    {expandedGameId === g.id && (
                      <ul className="account-history-detail">
                        {g.players.map((p) => (
                          <li key={p.playerId}>
                            {p.displayName}: {ROLE_DISPLAY[p.role] ?? p.role} ({sideLabel(p.side)}) — {p.points} pts
                          </li>
                        ))}
                        <li className="muted">Rodadas: {g.rounds}</li>
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            {hasMore && (
              <button type="button" className="ghost-btn account-load-more" disabled={histLoading} onClick={() => loadMore()}>
                {histLoading ? "Carregando…" : "Carregar mais"}
              </button>
            )}
          </div>
        )}

        {tab === "favoritos" && (
          <div className="account-panel account-favorites-panel">
            {!isPremium && (
              <div className="account-favorites-lock">
                <p className="account-favorites-lock-title">Favoritos premium</p>
                <p className="muted">Escolha até 3 papéis para destacar no seu perfil.</p>
                <p className="account-price">Desbloquear — {premiumPrice}</p>
                {stripeUrl && (
                  <button type="button" className="primary-btn" onClick={() => { window.location.href = stripeUrl; }}>
                    Ir para pagamento
                  </button>
                )}
              </div>
            )}
            <div className={`account-role-grid${!isPremium ? " is-locked" : ""}`}>
              {ROLE_GRID.map((roleId) => {
                const sel = favLocal.includes(roleId);
                return (
                  <button
                    key={roleId}
                    type="button"
                    disabled={!isPremium}
                    className={sel ? "account-role-tile account-role-tile-selected" : "account-role-tile"}
                    onClick={() => toggleFavoriteRole(roleId)}
                  >
                    <span className="account-role-tile-label">{ROLE_DISPLAY[roleId] ?? roleId}</span>
                    {sel && <span className="account-role-star">★</span>}
                  </button>
                );
              })}
            </div>
            {isPremium && favSavedFlash && <p className="account-saved-hint muted">Salvo</p>}
          </div>
        )}

        {tab === "ranking" && (
          <div className="account-panel">
            {top.length < 3 ? (
              <p className="muted account-ranking-sparse">
                O ranking global ainda está vazio demais — convide amigos e jogue partidas para preencher o top.
              </p>
            ) : null}
            <strong className="folhetim-title">Top 20 — pontos totais</strong>
            <table className="mvp-table account-ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nome</th>
                  <th>Pts</th>
                  <th>Partidas</th>
                  <th>MVPs</th>
                </tr>
              </thead>
              <tbody>
                {top.map((r, i) => (
                  <tr
                    key={r.uid}
                    className={
                      r.uid === uid
                        ? i === 0
                          ? "mvp-table-you mvp-rank-1"
                          : i === 1
                            ? "mvp-table-you mvp-rank-2"
                            : i === 2
                              ? "mvp-table-you mvp-rank-3"
                              : "mvp-table-you"
                        : i === 0
                          ? "mvp-rank-1"
                          : i === 1
                            ? "mvp-rank-2"
                            : i === 2
                              ? "mvp-rank-3"
                              : undefined
                    }
                  >
                    <td>{i + 1}</td>
                    <td>{r.displayName}</td>
                    <td>{r.totalPoints}</td>
                    <td>{r.gamesPlayed}</td>
                    <td>{r.mvpCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mine && (myRank == null || myRank > 20) && (
              <p className="muted account-rank-outside" style={{ marginTop: "1rem" }}>
                Sua posição fora do top 20: <strong>{mine.displayName}</strong> — {mine.totalPoints} pts (partidas:{" "}
                {mine.gamesPlayed}, MVPs: {mine.mvpCount}).
              </p>
            )}
            {myRank != null && myRank <= 20 && (
              <p className="muted" style={{ marginTop: "0.5rem" }}>
                Você está no top 20 (posição {myRank}).
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
