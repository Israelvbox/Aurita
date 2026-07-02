import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { usePlayerStore } from '../store/playerStore.js';
import { service } from '../api/service.js';
import { getWeeklyMixes, getRecommendedPlaylists } from '../store/mixEngine.js';
import { registerInvalidator } from '../api/cacheManager.js';
import Row from '../components/Row.jsx';
import logo from '../assets/logo.png';

// TTL reducido a 5 minutos: si el usuario crea una playlist,
// la verá en Home en menos de 5min sin tener que salir y volver.
const REFRESH_MS = 5 * 60 * 1000;
let homeCache = { playlists: null, mixes: null, recommended: null, fetchedAt: 0 };

// Expuesto para App.jsx (precarga con datos del /startup)
export function setHomeCache(playlists) {
  homeCache.playlists = playlists;
  homeCache.fetchedAt = Date.now();
}

// Registrar el invalidador para que cacheManager lo llame cuando haga falta
registerInvalidator('home', () => {
  homeCache = { playlists: null, mixes: null, recommended: null, fetchedAt: 0 };
});

export default function Home() {
  const navigate  = useNavigate();
  const { user, logout } = useAuthStore();
  const playItem  = usePlayerStore((s) => s.playItem);
  const isFresh   = Date.now() - homeCache.fetchedAt < REFRESH_MS;

  const [playlists,   setPlaylists]   = useState({ items: isFresh ? homeCache.playlists   || [] : [], loading: !isFresh });
  const [mixes,       setMixes]       = useState({ items: isFresh ? homeCache.mixes       || [] : [], loading: !isFresh });
  const [recommended, setRecommended] = useState({ items: isFresh ? homeCache.recommended || [] : [], loading: !isFresh });

  useEffect(() => {
    if (isFresh && homeCache.playlists) return;
    let cancelled = false;

    service.getRecentPlaylists(6).then((res) => {
      if (cancelled) return;
      homeCache.playlists = res.Items || [];
      homeCache.fetchedAt = Date.now();
      setPlaylists({ items: homeCache.playlists, loading: false });
    });
    getWeeklyMixes().then((w) => {
      if (cancelled) return;
      const items = w.map((m) => ({ Id: m.genre, Name: m.title, _mixItems: m.items }));
      homeCache.mixes = items;
      setMixes({ items, loading: false });
    });
    getRecommendedPlaylists().then((r) => {
      if (cancelled) return;
      const items = r.map((m) => ({ Id: m.genre, Name: m.title, _mixItems: m.items }));
      homeCache.recommended = items;
      setRecommended({ items, loading: false });
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  // Cuando cacheManager invalida 'home' mientras el componente está montado,
  // el useEffect no se re-ejecuta (deps vacías). Observamos homeCache.fetchedAt
  // para detectar la invalidación y recargar.
  useEffect(() => {
    if (homeCache.fetchedAt === 0 && (playlists.items.length > 0 || !playlists.loading)) {
      // La caché fue vaciada externamente — recargar en segundo plano
      service.getRecentPlaylists(6).then((res) => {
        homeCache.playlists = res.Items || [];
        homeCache.fetchedAt = Date.now();
        setPlaylists({ items: homeCache.playlists, loading: false });
      }).catch(() => {});
    }
  }); // sin deps: corre en cada render, pero el if lo hace muy barato

  function handlePlayMix(m) {
    const q = m._mixItems || [];
    if (q.length > 0) playItem(q[0], q);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header__logo">
          <img src={logo} alt="" style={{ width: 28, height: 28, borderRadius: 8 }} />
          <span>Aurita</span>
        </div>
        <button className="user-avatar"
          onClick={() => { if (confirm('¿Cerrar sesión?')) logout(); }}
          title="Cerrar sesión">
          {(user?.Name || 'U')[0].toUpperCase()}
        </button>
      </div>

      <Row title="Tus playlists recientes" items={playlists.items} loading={playlists.loading}
        onItemClick={(p) => navigate(`/playlist/${p.Id}`)} />
      <Row title="Tu mix de hoy" items={mixes.items} loading={mixes.loading}
        kind="mix" onItemClick={handlePlayMix} />
      <Row title="Recomendados" items={recommended.items} loading={recommended.loading}
        kind="mix" onItemClick={handlePlayMix} />
    </div>
  );
}
