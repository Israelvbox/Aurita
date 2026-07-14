import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore.js';
import { jellyfin } from '../api/jellyfin.js';
import { useFavoritesStore } from '../store/favoritesStore.js';
import CachedImage from '../components/CachedImage.jsx';

export default function MixDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { title, items } = location.state || {};
  const playItem = usePlayerStore((s) => s.playItem);
  const currentId = usePlayerStore((s) => s.queue[s.currentIndex]?.Id);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);

  if (!items || items.length === 0) {
    return (
      <div className="page">
        <div className="settings-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={24} />
          </button>
          <h1 className="settings-title">Mix vacío</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="settings-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} />
        </button>
        <h1 className="settings-title">{title || 'Mix'}</h1>
      </div>

      {items.length > 0 && (
        <button
          className="play-all-btn"
          onClick={() => playItem(items[0], items)}
        >
          <Play size={18} fill="currentColor" />
          Reproducir todo
        </button>
      )}

      <div className="track-list">
        {items.map((t, i) => {
          const artist = t.ArtistItems?.[0];
          const isActive = t.Id === currentId;
          return (
            <div
              key={t.Id}
              className={`track-row ${isActive ? 'track-row--active' : ''}`}
            >
              <span className="track-row__idx">{i + 1}</span>
              <CachedImage
                src={jellyfin.imageUrl(t.AlbumId || t.Id, 'Primary', 56)}
                alt="" className="track-row__art"
              />
              <button
                className="track-row__info"
                onClick={() => playItem(t, items, 'list')}
              >
                <div className={`track-row__name ${isActive ? '' : ''}`}>{t.Name}</div>
                <div className="track-row__artist muted">{artist?.Name || t.AlbumArtist}</div>
              </button>
              <button
                className={`track-row__heart ${favoriteIds.has(t.Id) ? 'track-row__heart--active' : ''}`}
                onClick={() => toggleFavorite(t.Id)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={favoriteIds.has(t.Id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
