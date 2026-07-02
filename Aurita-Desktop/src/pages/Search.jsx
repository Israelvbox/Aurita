import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, ArrowLeft, Play } from 'lucide-react';
import { service } from '../api/service.js';
import { getSongsForGenre, warmGenreIndex } from '../api/genreIndex.js';
import { usePlayerStore, warmTrack } from '../store/playerStore.js';
import { jellyfin } from '../api/jellyfin.js';
import { registerInvalidator } from '../api/cacheManager.js';

const PALETTE = ['#5b2a86','#3b1f6b','#7c3aed','#9333ea','#6d28d9','#4c1d95','#8b5cf6','#a855f7','#581c87','#6b21a8','#7e22ce','#86198f','#701a75','#4338ca','#312e81'];
function colorFor(n) { let h=0; for(let i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))>>>0; return PALETTE[h%PALETTE.length]; }
function normalize(s='') { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

let genresCache = null;

// Registrar para que cacheManager invalide los géneros al detectar sync nueva
registerInvalidator('genres', () => { genresCache = null; });

export default function Search() {
  const navigate  = useNavigate();
  const playItem  = usePlayerStore((s) => s.playItem);
  const [genres,     setGenres]     = useState(genresCache || []);
  const [term,       setTerm]       = useState('');
  const [results,    setResults]    = useState(null);
  const [genreView,  setGenreView]  = useState(null);
  const [searching,  setSearching]  = useState(false);

  useEffect(() => {
    if (!genresCache) {
      service.getGenres().then(async (r) => {
        let items = r.Items || [];
        // Si el servidor no tiene datos aún (BD vacía recién desplegada),
        // pedimos los géneros directamente a Jellyfin como fallback
        if (items.length === 0) {
          try {
            const direct = await jellyfin.getGenres();
            items = direct.Items || [];
          } catch { /* sin fallback disponible */ }
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
    const h = setTimeout(async () => {
      setSearching(true);
      try {
        const res   = await service.searchItems(term.trim());
        const items = res.Items || [];
        const q     = normalize(term);
        const match = (i) => normalize(i.Name).includes(q) || normalize(i.AlbumArtist||'').includes(q);
        const pool  = items.filter(match).length > 0 ? items.filter(match) : items;
        setResults({ songs: pool.filter((i) => i.Type==='Audio'), artists: pool.filter((i) => i.Type==='MusicArtist') });
      } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(h);
  }, [term]);

  async function openGenre(g) {
    setTerm(''); setResults(null);
    setGenreView({ name: g.Name, loading: true, songs: [] });
    const songs = await getSongsForGenre(g.Name);
    setGenreView({ name: g.Name, loading: false, songs });
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
           <div key={s.Id} className="track-row" onClick={() => playItem(s, genreView.songs)}>
             <img src={jellyfin.imageUrl(s.AlbumId||s.Id,'Primary',56)} alt="" className="track-row__art" />
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
      <div className="search-input-wrap search-input-wrap--compact">
        <SearchIcon size={18} className="search-input__icon" />
        <input className="search-input" type="text" placeholder="Artistas, canciones…"
          value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>

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
                  <div className="artist-avatar">{a.Name[0]}</div>
                  <div className="track-row__info"><div className="track-row__name">{a.Name}</div></div>
                </div>
              ))}
            </div>
          )}
          {results.songs.length > 0 && (
            <div>
              <h2 className="section-title">Canciones</h2>
              {results.songs.map((s) => (
                <div key={s.Id} className="track-row" onClick={() => playItem(s, results.songs)} onTouchStart={() => warmTrack(s.Id)}>
                  <img src={jellyfin.imageUrl(s.AlbumId||s.Id,'Primary',56)} alt="" className="track-row__art" />
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
