import { useEffect, useState } from 'react';
import { Heart, Play } from 'lucide-react';
import { service } from '../api/service.js';
import { usePlayerStore, warmTrack, warmFirstTracks } from '../store/playerStore.js';
import { useFavoritesStore } from '../store/favoritesStore.js';

export default function Favorites() {
  const currentTrackId  = usePlayerStore((s) => s.queue[s.currentIndex]?.Id);
  const playItem        = usePlayerStore((s) => s.playItem);
  const favoriteIds     = useFavoritesStore((s) => s.ids);
  const toggleFavorite  = useFavoritesStore((s) => s.toggle);

  const [allTracks, setAllTracks] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    service.getFavoriteSongs().then((res) => {
      const items = res.Items || [];
      setAllTracks(items);
      setLoading(false);
      warmFirstTracks(items);
    });
  }, []);

  // La lista visible se filtra por el store global: refleja cambios hechos
  // desde el reproductor o cualquier otra pantalla sin recargar.
  const tracks = allTracks.filter((t) => favoriteIds.has(t.Id));

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div className="favorites-cover">
          <Heart size={56} fill="currentColor" />
        </div>
        <div>
          <span className="detail-kind">Tu colección</span>
          <h1>Me gusta</h1>
          <p className="detail-meta">{tracks.length} canciones</p>
          {tracks.length > 0 && (
            <button className="play-circle" onClick={() => playItem(tracks[0], tracks)} title="Reproducir">
              <Play size={20} fill="currentColor" />
            </button>
          )}
        </div>
      </div>

      <div className="track-list">
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : tracks.length === 0 ? (
          <p className="muted">Las canciones que marques con el corazón aparecerán aquí.</p>
        ) : (
          tracks.map((t, i) => (
            <div key={t.Id} className={`track-row ${t.Id === currentTrackId ? 'track-row--active' : ''}`}>
              <span className="track-row__index">{i + 1}</span>
              <button
                className="track-row__main"
                onClick={() => playItem(t, tracks)}
                onMouseEnter={() => warmTrack(t.Id)}
              >
                <div className="track-row__name">{t.Name}</div>
                <div className="track-row__artist muted">{t.AlbumArtist}</div>
              </button>
              <button
                className="icon-btn icon-btn--accent"
                title="Quitar de Me gusta"
                onClick={() => toggleFavorite(t.Id)}
              >
                <Heart size={16} fill="currentColor" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
