import { useParams, useNavigate } from 'react-router-dom';
import { Play, ArrowLeft, Heart, Shuffle } from 'lucide-react';
import { jellyfin } from '../api/jellyfin.js';
import { usePlayerStore, warmTrack } from '../store/playerStore.js';
import { useFavoritesStore } from '../store/favoritesStore.js';
import { useMixViewStore } from '../store/mixViewStore.js';

export default function MixView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const playItem = usePlayerStore((s) => s.playItem);
  const currentTrackId = usePlayerStore((s) => s.queue[s.currentIndex]?.Id);
  const favoriteIds    = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);

  const mix = useMixViewStore((s) => s.get(id));

  if (!mix) {
    // El usuario llegó aquí sin pasar por Home (p.ej. recargó la página).
    // No tenemos forma de recuperar este mix concreto, así que volvemos.
    return (
      <div className="detail-page">
        <button className="back-btn" onClick={() => navigate('/')}><ArrowLeft size={16} /> Volver</button>
        <p className="muted">Este mix ya no está disponible. Vuelve al inicio para generarlo de nuevo.</p>
      </div>
    );
  }

  const { title, items } = mix;

  function handleShuffle() {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    playItem(shuffled[0], shuffled);
  }

  return (
    <div className="detail-page">
      <button className="back-btn" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Volver</button>

      <div className="detail-header">
        <img src={jellyfin.imageUrl(items[0]?.AlbumId || items[0]?.Id, 'Primary', 220)} alt="" className="detail-cover" />
        <div>
          <span className="detail-kind">Mix</span>
          <h1>{title}</h1>
          <p className="detail-meta">{items.length} canciones</p>
          <div className="detail-actions">
            <button className="play-circle" onClick={() => playItem(items[0], items)} title="Reproducir">
              <Play size={20} fill="currentColor" />
            </button>
            <button className="icon-btn icon-btn--lg" onClick={handleShuffle} title="Aleatorio">
              <Shuffle size={17} />
            </button>
          </div>
        </div>
      </div>

      <div className="track-list">
        {items.map((t, i) => {
          const fav = favoriteIds.has(t.Id);
          return (
            <div key={t.Id} className={`track-row ${t.Id === currentTrackId ? 'track-row--active' : ''}`}>
              <span className="track-row__index">{i + 1}</span>
              <button className="track-row__main" onClick={() => playItem(t, items)} onMouseEnter={() => warmTrack(t.Id)}>
                <div className="track-row__name">{t.Name}</div>
                <div className="track-row__artist muted">{t.AlbumArtist}</div>
              </button>
              <button className={`icon-btn ${fav ? 'icon-btn--accent' : ''}`} onClick={() => toggleFavorite(t.Id)}>
                <Heart size={16} fill={fav ? 'currentColor' : 'none'} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
