import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shuffle } from 'lucide-react';
import { useAuthStore } from '../store/authStore.js';
import { jellyfin } from '../api/jellyfin.js';
import { getDailyMixes, getWeeklyMixes, getRecommendedPlaylists } from '../store/mixEngine.js';
import { registerInvalidator } from '../api/cacheManager.js';
import { prefetchDetails } from '../api/detailCache.js';
import { historyStore, cacheStore } from '../db/storage.js';
import { usePlayerStore } from '../store/playerStore.js';
import { useToastStore } from '../store/toastStore.js';
import Row from '../components/Row.jsx';
import { PALETTE, colorFor } from '../utils.js';
import logo from '../assets/logo.png';

const REFRESH_MS = 5 * 60 * 1000;
let homeCache = { playlists: null, dailyMixes: null, weeklyMixes: null, recommended: null, genres: null, topTracks: null, fetchedAt: 0 };

export function setHomeCache(playlists, genres) {
  homeCache.playlists = playlists;
  if (genres) homeCache.genres = genres;
  homeCache.fetchedAt = Date.now();
}

registerInvalidator('home', () => {
  homeCache = { playlists: null, dailyMixes: null, weeklyMixes: null, recommended: null, genres: null, topTracks: null, fetchedAt: 0 };
  cacheStore.delete('mix', 'daily').catch(() => {});
  cacheStore.delete('mix', 'weekly').catch(() => {});
  cacheStore.delete('mix', 'recommended').catch(() => {});
});

export default function Home() {
  const navigate  = useNavigate();
  const { user } = useAuthStore();
  const playItem  = usePlayerStore((s) => s.playItem);
  const toast     = useToastStore((s) => s.show);
  const isFresh   = Date.now() - homeCache.fetchedAt < REFRESH_MS;

  const [playlists,   setPlaylists]   = useState({ items: isFresh ? homeCache.playlists   || [] : [], loading: !isFresh });
  const [dailyMixes,  setDailyMixes]  = useState({ items: isFresh ? homeCache.dailyMixes  || [] : [], loading: !isFresh });
  const [weeklyMixes, setWeeklyMixes] = useState({ items: isFresh ? homeCache.weeklyMixes || [] : [], loading: !isFresh });
  const [recommended, setRecommended] = useState({ items: isFresh ? homeCache.recommended || [] : [], loading: !isFresh });
  const [genres,      setGenres]      = useState({ items: isFresh ? homeCache.genres      || [] : [], loading: !isFresh });
  const [topTracks,   setTopTracks]   = useState({ items: isFresh ? homeCache.topTracks   || [] : [], loading: !isFresh });
  const [refreshing,  setRefreshing]  = useState(false);

  const pullY = useRef(0);
  const pullStartY = useRef(0);

  function handleTouchStart(e) {
    if (window.scrollY > 10) return;
    pullStartY.current = e.touches[0].clientY;
    pullY.current = 0;
  }

  function handleTouchMove(e) {
    if (window.scrollY > 10) return;
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 80 && !refreshing) {
      pullY.current = dy;
    }
  }

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    homeCache.fetchedAt = 0;
    cacheStore.delete('mix', 'daily').catch(() => {});
    cacheStore.delete('mix', 'weekly').catch(() => {});
    cacheStore.delete('mix', 'recommended').catch(() => {});
    const cancelled = { current: false };
    Promise.all([
      jellyfin.getPlaylists().then(res => {
        if (cancelled.current) return;
        homeCache.playlists = res.Items || [];
        setPlaylists({ items: homeCache.playlists, loading: false });
        setTimeout(() => prefetchDetails(homeCache.playlists.slice(0, 5).map(p => p.Id)).catch(() => {}), 100);
      }).catch(() => {}),
      jellyfin.getGenres().then(res => {
        if (cancelled.current) return;
        const items = (res.Items || []).slice(0, 12);
        homeCache.genres = items;
        setGenres({ items, loading: false });
      }).catch(() => {}),
      historyStore.getTopTracks(10).then(list => {
        if (cancelled.current) return;
        const items = list.map(t => ({
          Id: t.itemId, Name: t.name, AlbumArtist: t.artist,
          AlbumId: t.albumId || '', ImageTags: t.imageTag ? { Primary: t.imageTag } : {},
        }));
        homeCache.topTracks = items;
        setTopTracks({ items, loading: false });
      }).catch(() => {}),
    ]).then(() => {
      if (cancelled.current) return;
      setTimeout(() => {
        getDailyMixes().then(w => {
          if (cancelled.current) return;
          const items = w.map(m => ({ Id: m.genre, Name: m.title, _mixItems: m.items }));
          homeCache.dailyMixes = items;
          setDailyMixes({ items, loading: false });
        });
        getWeeklyMixes().then(w => {
          if (cancelled.current) return;
          const items = w.map(m => ({ Id: m.genre, Name: m.title, _mixItems: m.items }));
          homeCache.weeklyMixes = items;
          setWeeklyMixes({ items, loading: false });
        });
        getRecommendedPlaylists().then(r => {
          if (cancelled.current) return;
          const items = r.map(m => ({ Id: m.genre, Name: m.title, _mixItems: m.items }));
          homeCache.recommended = items;
          setRecommended({ items, loading: false });
        });
        homeCache.fetchedAt = Date.now();
        setRefreshing(false);
        toast('Actualizado', 'success');
      }, 300);
    });
  }, [refreshing, toast]);

  useEffect(() => {
    if (isFresh && homeCache.playlists) return;
    let cancelled = false;

    const genresPromise = homeCache.genres
      ? Promise.resolve(homeCache.genres)
      : jellyfin.getGenres().then(res => {
          const items = (res.Items || []).slice(0, 12);
          homeCache.genres = items;
          return items;
        });

    // Primero: datos rápidos (playlists, géneros, top tracks)
    Promise.all([
      homeCache.playlists
        ? Promise.resolve(homeCache.playlists)
        : jellyfin.getPlaylists().then(res => {
            if (cancelled) return [];
            homeCache.playlists = res.Items || [];
            setPlaylists({ items: homeCache.playlists, loading: false });
            setTimeout(() => {
              prefetchDetails(homeCache.playlists.slice(0, 5).map(p => p.Id)).catch(() => {});
            }, 100);
            return homeCache.playlists;
          }).catch(() => []),
      genresPromise.then(items => { if (!cancelled) setGenres({ items, loading: false }); }),
      historyStore.getTopTracks(10).then(list => {
        if (cancelled) return;
        const items = list.map(t => ({
          Id: t.itemId,
          Name: t.name,
          AlbumArtist: t.artist,
          AlbumId: t.albumId || '',
          ImageTags: t.imageTag ? { Primary: t.imageTag } : {},
        }));
        homeCache.topTracks = items;
        setTopTracks({ items, loading: false });
      }).catch(() => {}),
    ]).then(() => {
      if (cancelled) return;
      // Segundo: mixes (pesados) con un pequeño retraso
      setTimeout(() => {
        if (cancelled) return;
        getDailyMixes().then(w => {
          if (cancelled) return;
          const items = w.map(m => ({ Id: m.genre, Name: m.title, _mixItems: m.items }));
          homeCache.dailyMixes = items;
          setDailyMixes({ items, loading: false });
        });
        getWeeklyMixes().then(w => {
          if (cancelled) return;
          const items = w.map(m => ({ Id: m.genre, Name: m.title, _mixItems: m.items }));
          homeCache.weeklyMixes = items;
          setWeeklyMixes({ items, loading: false });
        });
        getRecommendedPlaylists().then(r => {
          if (cancelled) return;
          const items = r.map(m => ({ Id: m.genre, Name: m.title, _mixItems: m.items }));
          homeCache.recommended = items;
          setRecommended({ items, loading: false });
        });
        if (!cancelled) homeCache.fetchedAt = Date.now();
      }, 300);
    });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  useEffect(() => {
    if (homeCache.fetchedAt === 0 && (playlists.items.length > 0 || !playlists.loading)) {
      jellyfin.getPlaylists().then(res => {
        homeCache.playlists = res.Items || [];
        homeCache.fetchedAt = Date.now();
        setPlaylists({ items: homeCache.playlists, loading: false });
        setTimeout(() => {
          prefetchDetails(homeCache.playlists.slice(0, 5).map(p => p.Id)).catch(() => {});
        }, 100);
      }).catch(() => {});
    }
  });

  function handlePlayMix(m) {
    navigate('/mix', {
      state: {
        title: m.Name || 'Mix',
        items: m._mixItems || [],
      },
    });
  }

  function handlePlayTop(t) {
    playItem(t, null, 'random');
  }

  function handleOpenGenre(g) {
    navigate('/buscar', { state: { openGenre: g.Name } });
  }

  async function handleFeelingLucky() {
    try {
      const res = await jellyfin.request(`/Users/${jellyfin.userId}/Items`, {
        query: {
          IncludeItemTypes: 'Audio', Recursive: true,
          SortBy: 'Random', Limit: 1,
          Fields: 'Genres,AlbumArtist,ArtistItems,UserData,RunTimeTicks',
        },
      });
      const track = res.Items?.[0];
      if (track) {
        playItem(track, null, 'random');
        toast(`Reproduciendo: ${track.Name}`, 'info');
      } else {
        toast('No hay canciones disponibles', 'error');
      }
    } catch {
      toast('Error al buscar canción aleatoria', 'error');
    }
  }

  return (
    <div className="page"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => { if (pullY.current > 80) handleRefresh(); pullY.current = 0; }}>
      <div className="page-header">
        <div className="page-header__logo">
          <img src={logo} alt="" style={{ width: 28, height: 28, borderRadius: 8 }} />
          <span>Aurita</span>
        </div>
        <div className="page-header__actions">
          {refreshing && <span className="muted" style={{ fontSize: '.75rem' }}>Actualizando…</span>}
          <button className="header-icon-btn" onClick={handleFeelingLucky} title="Me siento con suerte">
            <Shuffle size={18} />
          </button>
          <button className="user-avatar"
            onClick={() => navigate('/ajustes')}
            title="Ajustes">
            {(user?.Name || 'U')[0].toUpperCase()}
          </button>
        </div>
      </div>

      <Row title="Tus playlists" items={playlists.items} loading={playlists.loading}
        onItemClick={(p) => navigate(`/playlist/${p.Id}`)} />

      <Row title="Mix diario" items={dailyMixes.items} loading={dailyMixes.loading}
        kind="mix" onItemClick={handlePlayMix} />

      <Row title="Mix semanal" items={weeklyMixes.items} loading={weeklyMixes.loading}
        kind="mix" onItemClick={handlePlayMix} />

      <Row title="Recomendados" items={recommended.items} loading={recommended.loading}
        kind="mix" onItemClick={handlePlayMix} />

      {genres.items.length > 0 && (
        <section className="row">
          <h2 className="row__title">Explorar por género</h2>
          {genres.loading ? (
            <div className="row__scroll">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card card--skeleton" />
              ))}
            </div>
          ) : (
            <div className="row__scroll">
              {genres.items.map((g) => (
                <button key={g.Id || g.Name} className="genre-card" style={{ background: colorFor(g.Name), minWidth: 120, height: 80, border: 'none', borderRadius: 12, display: 'flex', alignItems: 'flex-end', padding: 10, cursor: 'pointer' }}
                  onClick={() => handleOpenGenre(g)}>
                  <span className="genre-card__name" style={{ color: '#fff', fontWeight: 600, fontSize: '.9rem' }}>{g.Name}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <Row title="Más escuchadas" items={topTracks.items} loading={topTracks.loading}
        onItemClick={handlePlayTop} emptyMessage="Todavía no hay suficientes reproducciones." />
    </div>
  );
}
