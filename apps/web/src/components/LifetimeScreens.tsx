import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import type { User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase.js";

export type LeaderRow = {
  uid: string;
  displayName: string;
  totalPoints: number;
  gamesPlayed: number;
  mvpCount: number;
};

export function useLeaderboard(currentUid: string | undefined) {
  const [top, setTop] = useState<LeaderRow[]>([]);
  const [mine, setMine] = useState<LeaderRow | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);

  const qTop = useMemo(
    () => query(collection(db, "publicLeaderboard"), orderBy("totalPoints", "desc"), limit(20)),
    [],
  );

  useEffect(() => {
    const unsub = onSnapshot(qTop, (snap) => {
      const rows: LeaderRow[] = [];
      for (const d of snap.docs) {
        const x = d.data() as Record<string, unknown>;
        rows.push({
          uid: d.id,
          displayName: String(x.displayName ?? "Jogador"),
          totalPoints: Number(x.totalPoints ?? 0),
          gamesPlayed: Number(x.gamesPlayed ?? 0),
          mvpCount: Number(x.mvpCount ?? 0),
        });
      }
      setTop(rows);
    });
    return () => unsub();
  }, [qTop]);

  useEffect(() => {
    if (!currentUid) {
      setMine(null);
      setMyRank(null);
      return;
    }
    const ref = doc(db, "publicLeaderboard", currentUid);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setMine(null);
        return;
      }
      const x = snap.data() as Record<string, unknown>;
      setMine({
        uid: snap.id,
        displayName: String(x.displayName ?? "Jogador"),
        totalPoints: Number(x.totalPoints ?? 0),
        gamesPlayed: Number(x.gamesPlayed ?? 0),
        mvpCount: Number(x.mvpCount ?? 0),
      });
    });
    return () => unsub();
  }, [currentUid]);

  useEffect(() => {
    if (!currentUid) {
      setMyRank(null);
      return;
    }
    const idx = top.findIndex((r) => r.uid === currentUid);
    setMyRank(idx >= 0 ? idx + 1 : null);
  }, [currentUid, top]);

  return { top, mine, myRank };
}

export function RankingView(props: { user: User | null; onClose: () => void }) {
  const { top, mine, myRank } = useLeaderboard(props.user?.uid);
  const showMine = Boolean(props.user && mine && (myRank == null || myRank > 20));

  return (
    <div className="page page--account">
      <div className="top-bar">
        <button type="button" className="back-link" onClick={props.onClose}>
          ← voltar
        </button>
        <span className="session-label">Ranking</span>
      </div>
      <div className="game-card log-card" style={{ margin: "1rem" }}>
        <strong>Top 20 — pontos totais</strong>
        <table className="mvp-table">
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
              <tr key={r.uid} className={r.uid === props.user?.uid ? "mvp-table-you" : undefined}>
                <td>{i + 1}</td>
                <td>{r.displayName}</td>
                <td>{r.totalPoints}</td>
                <td>{r.gamesPlayed}</td>
                <td>{r.mvpCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {showMine && mine && (
          <p className="muted" style={{ marginTop: "1rem" }}>
            Sua posição fora do top 20: {mine.displayName} — {mine.totalPoints} pts (partidas: {mine.gamesPlayed},
            MVPs: {mine.mvpCount}).
          </p>
        )}
        {props.user && myRank && myRank <= 20 && (
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            Você está no top 20 (posição {myRank}).
          </p>
        )}
      </div>
    </div>
  );
}

export function AccountView(props: { user: User | null; onClose: () => void }) {
  const { mine } = useLeaderboard(props.user?.uid);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!props.user) {
      setProfile(null);
      return;
    }
    const ref = doc(db, "users", props.user.uid);
    getDoc(ref).then((s) => setProfile(s.exists() ? (s.data() as Record<string, unknown>) : null));
  }, [props.user]);

  return (
    <div className="page page--account">
      <div className="top-bar">
        <button type="button" className="back-link" onClick={props.onClose}>
          ← voltar
        </button>
        <span className="session-label">Minha conta</span>
      </div>
      <div className="game-card log-card" style={{ margin: "1rem" }}>
        {!props.user ? (
          <p className="muted">Entre para ver seu perfil.</p>
        ) : (
          <>
            <p>
              <strong>{props.user.displayName ?? "Jogador"}</strong>
            </p>
            <ul className="account-stats">
              <li>Pontos totais: {Number(profile?.totalPoints ?? mine?.totalPoints ?? 0)}</li>
              <li>Partidas jogadas: {Number(profile?.gamesPlayed ?? mine?.gamesPlayed ?? 0)}</li>
              <li>Vitórias coletivas: {Number(profile?.gamesWon ?? 0)}</li>
              <li>MVPs (1º lugar): {Number(profile?.mvpCount ?? mine?.mvpCount ?? 0)}</li>
              <li>Pódios (top 3): {Number(profile?.podiumCount ?? 0)}</li>
              <li>Melhor partida: {Number(profile?.bestGame ?? 0)} pts</li>
            </ul>
            <p className="muted" style={{ marginTop: "1rem" }}>
              <a href="#/ranking">Ver ranking global</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
