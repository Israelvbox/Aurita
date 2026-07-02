import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Play, Heart, Trash2, Pencil, X, Shuffle } from 'lucide-react';
import { jellyfin } from '../api/jellyfin.js';
import { service } from '../api/service.js';
import { fetchDetail, getCachedDetail, getCachedDetailSync, setDetailCache, invalidateDetail } from '../api/detailCache.js';
import { onPlaylistDeleted, onPlaylistCreated } from '../api/cacheManager.js';
import { usePlayerStore, warmTrack } from '../store/playerStore.js';
import { useFavoritesStore } from '../store/favoritesStore.js';
import { usePlaylistMembershipStore } from '../store/playlistMembershipStore.js';
import PlaylistFormModal from '../components/PlaylistFormModal.jsx';
import CachedImage from '../components/CachedImage.jsx';
import { fetchCachedImage } from '../api/imageCache.js';

// ── Favoritos ────────────────────────────────────────────────
export function Favorites() {
  const currentId   = usePlayerStore((s) => s.queue[s.currentIndex]?.Id);
  const playItem    = usePlayerStore((s) => s.playItem);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFav   = useFavoritesStore((s) => s.toggle);
  const getCached   = useFavoritesStore((s) => s.getCachedItems);
  const revalidate  = useFavoritesStore((s) => s.revalidate);

  // Datos inmediatos desde el store (ya precargados en startup o hydrate).
  // Si no hay nada, useState([]) muestra la pantalla vacía momentáneamente
  // mientras la revalidación trae los datos — sin spinner.
  const [allTracks, setAllTracks] = useState(() => getCached());

  useEffect(() => {
    const cached = getCached();
    if (cached.length > 0) {
      // Ya tenemos datos: mostrar al instante y revalidar en fondo
      setAllTracks(cached);
      revalidate().then(() => setAllTracks(getCached())).catch(() => {});
    } else {
      // Primera visita sin caché: fetch normal
      service.getFavoriteSongs().then((r) => setAllTracks(r.Items || [])).catch(() => {});
    }
  }, []); // eslint-disable-line

  // Sincronizar si el store cambia (toggle de favorito)
  useEffect(() => {
    setAllTracks(getCached());
  }, [favoriteIds]); // eslint-disable-line

  const tracks = allTracks.filter((t) => favoriteIds.has(t.Id));

  return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Me gusta</h1></div>
      {tracks.length > 0 && (
        <button className="play-all-btn" onClick={() => playItem(tracks[0], tracks, 'list')}>
          <Play size={18} fill="currentColor" /> Reproducir todo
        </button>
      )}
      {tracks.length === 0 ? <p className="muted page-pad">Marca canciones con el corazón y aparecerán aquí.</p> :
       <div className="track-list">
         {tracks.map((t) => (
           <div key={t.Id} className={`track-row ${t.Id===currentId?'track-row--active':''}`}
             onClick={() => playItem(t, tracks, 'list')} onTouchStart={() => warmTrack(t.Id)}>
              <CachedImage src={jellyfin.imageUrl(t.AlbumId||t.Id,'Primary',56)} alt="" className="track-row__art" />
              <div className="track-row__info">
                <div className="track-row__name">{t.Name}</div>
                <div className="track-row__artist muted">{t.AlbumArtist}</div>
              </div>
              <button className="track-row__heart track-row__heart--active" onClick={(e)=>{e.stopPropagation();toggleFav(t.Id);}}>
               <Heart size={18} fill="currentColor" />
             </button>
           </div>
         ))}
       </div>
      }
    </div>
  );
}

// ── Detalle de Playlist / Álbum ───────────────────────────────
export function PlaylistDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const currentId = usePlayerStore((s) => s.queue[s.currentIndex]?.Id);
  const playItem  = usePlayerStore((s) => s.playItem);
  const favoriteIds    = useFavoritesStore((s) => s.ids);
  const toggleFav      = useFavoritesStore((s) => s.toggle);
  const refreshMembership = usePlaylistMembershipStore((s) => s.refresh);

  const [info,     setInfo]     = useState(() => getCachedDetailSync(id)?.info  ?? null);
  const [tracks,   setTracks]   = useState(() => getCachedDetailSync(id)?.tracks ?? []);
  const [loading,  setLoading]  = useState(() => !getCachedDetailSync(id));
  const [showEdit, setShowEdit] = useState(false);

  async function load({ forceFresh=false }={}) {
    if (!forceFresh) {
      const cached = await getCachedDetail(id);
      if (cached) {
        setInfo(cached.info); setTracks(cached.tracks); setLoading(false);
        fetchDetail(id).then((f) => { setInfo(f.info); setTracks(f.tracks); setDetailCache(id, f); }).catch(()=>{});
        return;
      }
    }
    setLoading(true);
    const data = await fetchDetail(id);
    setInfo(data.info); setTracks(data.tracks); setLoading(false); setDetailCache(id, data);
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line

  async function handleRemove(t) {
    if (!t.PlaylistItemId) return;
    const nt = tracks.filter((x) => x.PlaylistItemId !== t.PlaylistItemId);
    setTracks(nt);
    jellyfin.removeFromPlaylist(id, [t.PlaylistItemId]).then(() => {
      setDetailCache(id, {info, tracks: nt});
      refreshMembership();
      invalidateDetail(id); // notifica al cacheManager
    }).catch(() => load({forceFresh:true}));
  }

  async function handleEdit({ name }) {
    if (name !== info?.Name) await jellyfin.renamePlaylist(id, name);
    invalidateDetail(id);
    onPlaylistCreated(); // invalida Home y Library (el nombre cambió)
    await load({ forceFresh: true });
  }

  if (loading) return <div className="page"><p className="muted page-pad">Cargando…</p></div>;
  const isPlaylist = info?.Type === 'Playlist';

  return (
    <div className="page">
      <div className="detail-hero">
        <button className="back-btn back-btn--overlay" onClick={() => navigate(-1)}><ArrowLeft size={22} /></button>
        <CachedImage src={jellyfin.imageUrl(id,'Primary',400,info?.ImageTags?.Primary)} alt="" className="detail-hero__img" />
        <div className="detail-hero__overlay">
          <span className="detail-kind">{isPlaylist ? 'Playlist' : 'Álbum'}</span>
          <h1 className="detail-hero__title">{info?.Name}</h1>
          <p className="muted">{tracks.length} canciones</p>
        </div>
      </div>

      <div className="detail-actions-bar">
        {tracks.length > 0 && (
            <button className="fab" onClick={() => playItem(tracks[0], tracks, 'list')}><Play size={22} fill="currentColor" /></button>
        )}
        {isPlaylist && (
          <>
            <button className="icon-pill" onClick={() => setShowEdit(true)}><Pencil size={18}/></button>
            <button className="icon-pill icon-pill--danger" onClick={async () => {
              if (!confirm(`¿Borrar "${info?.Name}"?`)) return;
              await jellyfin.deletePlaylist(id); refreshMembership(); onPlaylistDeleted(id); navigate('/biblioteca');
            }}><Trash2 size={18}/></button>
          </>
        )}
      </div>

      <div className="track-list">
        {tracks.map((t, i) => {
          const fav = favoriteIds.has(t.Id);
          return (
            <div key={t.PlaylistItemId||t.Id} className={`track-row ${t.Id===currentId?'track-row--active':''}`}
              onClick={() => playItem(t, tracks, 'list')} onTouchStart={() => warmTrack(t.Id)}>
              <span className="track-row__idx">{i+1}</span>
              <div className="track-row__info">
                <div className="track-row__name">{t.Name}</div>
                <div className="track-row__artist muted">{t.AlbumArtist}</div>
              </div>
              <button className={`track-row__heart ${fav?'track-row__heart--active':''}`}
                onClick={(e)=>{e.stopPropagation();toggleFav(t.Id);}}>
                <Heart size={18} fill={fav?'currentColor':'none'} />
              </button>
              {isPlaylist && (
                <button className="track-row__remove" onClick={(e)=>{e.stopPropagation();handleRemove(t);}}>
                  <X size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showEdit && (
        <PlaylistFormModal mode="edit" initialName={info?.Name}
          onClose={() => setShowEdit(false)} onSubmit={handleEdit} />
      )}
    </div>
  );
}

// ── Perfil de artista ─────────────────────────────────────────
export function ArtistDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const location  = useLocation();
  const currentId = usePlayerStore((s) => s.queue[s.currentIndex]?.Id);
  const playItem  = usePlayerStore((s) => s.playItem);

  const [name,      setName]      = useState(location.state?.name || null);
  const [albums,    setAlbums]    = useState([]);
  const [topSongs,  setTopSongs]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [backdrop,  setBackdrop]  = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      location.state?.name ? Promise.resolve(null) : service.getItemInfo(id),
      service.getArtistAlbums(id, 20),
      service.getArtistTopSongs(id, 10),
    ]).then(([info, albumsRes, songsRes]) => {
      if (cancelled) return;
      if (info?.Name) setName(info.Name);
      setAlbums(albumsRes.Items || []);
      setTopSongs(songsRes.Items || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line

  const backdropUrl = jellyfin.imageUrl(id, 'Backdrop', 800);
  useEffect(() => {
    let cancelled = false;
    fetchCachedImage(backdropUrl).then((url) => {
      if (!cancelled && url) setBackdrop(url);
    });
    return () => { cancelled = true; };
  }, [backdropUrl]); // eslint-disable-line

  return (
    <div className="page">
      <div className="detail-hero detail-hero--artist"
        style={{ backgroundImage: backdrop ? `url(${backdrop})` : `url(${backdropUrl})` }}>
        <button className="back-btn back-btn--overlay" onClick={() => navigate(-1)}><ArrowLeft size={22} /></button>
        <div className="detail-hero__overlay">
          <h1 className="detail-hero__title detail-hero__title--big">{name || ' '}</h1>
        </div>
      </div>

      <div className="detail-actions-bar">
        {topSongs.length > 0 && (
          <>
            <button className="fab" onClick={() => playItem(topSongs[0], topSongs)}><Play size={22} fill="currentColor" /></button>
            <button className="icon-pill" onClick={() => {
              const s = [...topSongs].sort(()=>Math.random()-.5);
              playItem(s[0], s);
            }}><Shuffle size={18}/></button>
          </>
        )}
      </div>

      {loading && topSongs.length === 0 ? <p className="muted page-pad">Cargando…</p> : (
        <>
          <h2 className="section-title">Populares</h2>
          <div className="track-list">
            {topSongs.map((t, i) => (
              <div key={t.Id} className={`track-row ${t.Id===currentId?'track-row--active':''}`}
                onClick={() => playItem(t, topSongs)} onTouchStart={() => warmTrack(t.Id)}>
                <span className="track-row__idx">{i+1}</span>
                <div className="track-row__info">
                  <div className="track-row__name">{t.Name}</div>
                </div>
              </div>
            ))}
          </div>

          {albums.length > 0 && (
            <>
              <h2 className="section-title">Álbumes</h2>
              <div className="album-grid">
                {albums.map((al) => (
                  <button key={al.Id} className="album-card" onClick={() => navigate(`/playlist/${al.Id}`)}>
                    <CachedImage src={jellyfin.imageUrl(al.Id,'Primary',220)} alt="" />
                    <div className="album-card__name">{al.Name}</div>
                    <div className="album-card__year muted">{al.ProductionYear}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
