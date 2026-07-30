import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search as SearchIcon, ArrowLeft, Play, Clock } from 'lucide-react';
import { service } from '../api/service.js';
import { getSongsForGenre, warmGenreIndex } from '../api/genreIndex.js';
import { usePlayerStore, warmTrack } from '../store/playerStore.js';
import { jellyfin } from '../api/jellyfin.js';
import { registerInvalidator } from '../api/cacheManager.js';
import CachedImage from '../components/CachedImage.jsx';
import { PALETTE, colorFor, normalize } from '../utils.js';

const HISTORY_KEY = 'aurita_search_history';
const MAX_HISTORY = 5;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveHistory(h) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); }
  catch {}
}

let genresCache = null;
let _searchCache = new Map();

registerInvalidator('genres', () => { genresCache = null; });

export default function Search() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const playItem  = usePlayerStore((s) => s.playItem);
  const [genres,     setGenres]     = useState(genresCache || []);
  const [term,       setTerm]       = useState('');
  const [results,    setResults]    = useState(null);
  const [genreView,  setGenreView]  = useState(null);
  const [searching,  setSearching]  = useState(false);
  const [history,    setHistory]    = useState(() => loadHistory());

  useEffect(() => {
    const openGenreName = location.state?.openGenre;
    if (openGenreName && genres.length > 0) {
      const g = genres.find(g => g.Name === openGenreName);
      if (g) openGenre(g);
      window.history.replaceState({}, '');
    }
  }, [location.state?.openGenre, genres]);

  useEffect(() => {
    if (!genresCache) {
      service.getGenres().then(async (r) => {
        let items = r.Items || [];
        if (items.length === 0) {
          try {
            const direct = await jellyfin.getGenres();
            items = direct.Items || [];
          } catch {}
        }
        genresCache = items;
        setGenres(genresCache);
      });
    }
    warmGenreIndex();
  }, []);

  useEffect(() => {
    if (!term.trim()) { setResults(null); return; }
    setGenreView(null);
    const q = term.trim();
    const cached = _searchCache.get(q.toLowerCase());
    if (cached) { setResults(cached); return; }
    const h = setTimeout(async () => {
      setSearching(true);
      try {
        const res   = await service.searchItems(q);
        const items = res.Items || [];
        const nq    = normalize(q);
        const match = (i) => normalize(i.Name).includes(nq) || normalize(i.AlbumArtist||'').includes(nq);
        const pool  = items.filter(match).length > 0 ? items.filter(match) : items;
        const result = { songs: pool.filter((i) => i.Type==='Audio'), artists: pool.filter((i) => i.Type==='MusicArtist') };
        _searchCache.set(nq, result);
        if (_searchCache.size > 20) {
          const first = _searchCache.keys().next().value;
          _searchCache.delete(first);
        }
        setResults(result);
        // Add to history
        setHistory(prev => {
          const next = [q, ...prev.filter(h => h !== q)].slice(0, MAX_HISTORY);
          saveHistory(next);
          return next;
        });
      } finally { setSearching(false); }
    }, 150);
    return () => clearTimeout(h);
  }, [term]);

  async function openGenre(g) {
    setTerm(''); setResults(null);
    setGenreView({ name: g.Name, loading: true, songs: [] });
    const songs = await getSongsForGenre(g.Name);
    setGenreView({ name: g.Name, loading: false, songs });
  }

  function handleHistoryClick(h) {
    setTerm(h);
  }

  function clearHistory() {
    setHistory([]);
    saveHistory([]);
  }

  if (genreView) return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => setGenreView(null)}><ArrowLeft size={22} /></button>
        <h1 className="page-title">{genreView.name}</h1>
      </div>
      {genreView.loading ? <p className="muted page-pad">Cargando…</p> :
       genreView.songs.length === 0 ? <p className="muted page-pad">No hay canciones.</p> :
       <div className="track-list">
         {genreView.songs.map((s) => (
           <div key={s.Id} className="track-row" onClick={() => playItem(s, null, 'random')}>
              <CachedImage src={jellyfin.imageUrl(s.AlbumId||s.Id,'Primary',56)} alt="" className="track-row__art" />
              <div className="track-row__info">
                <div className="track-row__name">{s.Name}</div>
                <div className="track-row__artist muted">{s.AlbumArtist}</div>
              </div>
              <Play size={16} className="track-row__play-icon" />
           </div>
         ))}
       </div>
      }
    </div>
  );

  return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Buscar</h1></div>
      <div className="search-wrap">
        <SearchIcon size={18} className="search-icon" />
        <input className="search-input" type="text" placeholder="Artistas, canciones…"
          value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>

      {!results && history.length > 0 && (
        <div className="search-history">
          <div className="search-history__header">
            <h2 className="section-title">Búsquedas recientes</h2>
            <button className="search-history__clear" onClick={clearHistory}>Borrar</button>
          </div>
          <div className="search-history__chips">
            {history.map((h) => (
              <button key={h} className="chip" onClick={() => handleHistoryClick(h)}>
                <Clock size={14} />
                {h}
              </button>
            ))}
          </div>
        </div>
      )}

      {!results && (
        <>
          <h2 className="section-title">Géneros</h2>
          <div className="genre-grid">
            {genres.length === 0
              ? <p className="muted" style={{padding:'0 4px'}}>Cargando géneros…</p>
              : genres.map((g) =>
                g ? (
                  <button key={g.Id} className="genre-card" style={{background:colorFor(g.Name)}} onClick={() => openGenre(g)}>
                    <span className="genre-card__name">{g.Name}</span>
                  </button>
                ) : null
            )}
          </div>
        </>
      )}

      {results && (
        <div>
          {searching && <p className="muted page-pad">Buscando…</p>}
          {results.artists.length > 0 && (
            <div>
              <h2 className="section-title">Artistas</h2>
              {results.artists.map((a) => (
                <div key={a.Id} className="track-row" onClick={() => navigate(`/artist/${a.Id}`, { state: { name: a.Name } })}>
                  <CachedImage src={jellyfin.imageUrl(a.Id, 'Primary', 56)} alt="" className="track-row__art" />
                  <div className="track-row__info"><div className="track-row__name">{a.Name}</div></div>
                </div>
              ))}
            </div>
          )}
          {results.songs.length > 0 && (
            <div>
              <h2 className="section-title">Canciones</h2>
              {results.songs.map((s) => (
                <div key={s.Id} className="track-row" onClick={() => playItem(s, null, 'random')} onTouchStart={() => warmTrack(s.Id)}>
                  <CachedImage src={jellyfin.imageUrl(s.AlbumId||s.Id,'Primary',56)} alt="" className="track-row__art" />
                  <div className="track-row__info">
                    <div className="track-row__name">{s.Name}</div>
                    <div className="track-row__artist muted">{s.AlbumArtist}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!searching && results.songs.length===0 && results.artists.length===0 &&
            <p className="muted page-pad">Sin resultados para "{term}".</p>}
        </div>
      )}
    </div>
  );
}
