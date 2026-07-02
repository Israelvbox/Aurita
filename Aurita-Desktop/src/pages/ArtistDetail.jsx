import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Play, ArrowLeft, Shuffle } from 'lucide-react';
import { jellyfin } from '../api/jellyfin.js';
import { service } from '../api/service.js';
import { cacheStore } from '../db/storage.js';
import { usePlayerStore, warmTrack } from '../store/playerStore.js';
import Row from '../components/Row.jsx';

const ARTIST_CACHE_TTL = 10 * 60 * 1000;

export default function ArtistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const currentTrackId = usePlayerStore((s) => s.queue[s.currentIndex]?.Id);
  const playItem = usePlayerStore((s) => s.playItem);

  // Si venimos de un click en el buscador, ya sabemos el nombre: se pinta
  // el hero al instante sin esperar respuesta del servidor.
  const [name, setName] = useState(location.state?.name || null);
  const [albums, setAlbums] = useState([]);
  const [topSongs, setTopSongs] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingDetails(true);

    cacheStore.get('artist', id).then((cached) => {
      if (cached && !cancelled) {
        setName(cached.name);
        setAlbums(cached.albums);
        setTopSongs(cached.topSongs);
        setLoadingDetails(false);
      }
    });

    const infoPromise = location.state?.name ? Promise.resolve(null) : service.getItemInfo(id);

    Promise.all([infoPromise, service.getArtistAlbums(id, 20), service.getArtistTopSongs(id, 10)]).then(
      ([artistInfo, albumsRes, songsRes]) => {
        if (cancelled) return;
        const finalName = artistInfo?.Name || location.state?.name || name;
        const albumsData = albumsRes.Items || [];
        const songsData = songsRes.Items || [];
        setName(finalName);
        setAlbums(albumsData);
        setTopSongs(songsData);
        setLoadingDetails(false);
        cacheStore.set('artist', id, { name: finalName, albums: albumsData, topSongs: songsData }, ARTIST_CACHE_TTL);
      }
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function playShuffled() {
    if (topSongs.length === 0) return;
    const shuffled = [...topSongs].sort(() => Math.random() - 0.5);
    playItem(shuffled[0], shuffled);
  }

  return (
    <div className="detail-page">
      <button className="back-btn" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> Volver
      </button>

      <div className="artist-hero" style={{ backgroundImage: `url(${jellyfin.imageUrl(id, 'Backdrop', 800)})` }}>
        <h1 className="artist-hero__name">{name || '\u00A0'}</h1>
      </div>

      <div className="artist-actions">
        <button
          className="play-circle"
          onClick={() => topSongs.length > 0 && playItem(topSongs[0], topSongs)}
          title="Reproducir"
          disabled={topSongs.length === 0}
        >
          <Play size={20} fill="currentColor" />
        </button>
        <button className="icon-btn icon-btn--lg" onClick={playShuffled} title="Aleatorio" disabled={topSongs.length === 0}>
          <Shuffle size={20} />
        </button>
      </div>

      <section>
        <h3>Populares</h3>
        {loadingDetails && topSongs.length === 0 ? (
          <p className="muted">Cargando…</p>
        ) : (
          <div className="track-list">
            {topSongs.map((t, i) => (
              <div key={t.Id} className={`track-row ${t.Id === currentTrackId ? 'track-row--active' : ''}`}>
                <span className="track-row__index">{i + 1}</span>
                <button className="track-row__main" onClick={() => playItem(t, topSongs)} onMouseEnter={() => warmTrack(t.Id)}>
                  <div className="track-row__name">{t.Name}</div>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {(albums.length > 0 || loadingDetails) && (
        <Row
          title="Álbumes"
          items={albums}
          loading={loadingDetails && albums.length === 0}
          kind="album"
          onItemClick={(al) => navigate(`/playlist/${al.Id}`)}
        />
      )}
    </div>
  );
}
