import { Play, Pause, SkipForward, Heart } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore.js';
import { useFavoritesStore } from '../store/favoritesStore.js';
import { jellyfin } from '../api/jellyfin.js';
import CachedImage from './CachedImage.jsx';

export default function MiniPlayer({ onExpand }) {
  const { queue, currentIndex, isPlaying, togglePlay, next } = usePlayerStore();
  const favoriteIds     = useFavoritesStore((s) => s.ids);
  const toggleFavorite  = useFavoritesStore((s) => s.toggle);

  const current = currentIndex >= 0 ? queue[currentIndex] : null;
  if (!current) return null;

  const isFav = favoriteIds.has(current.Id);

  return (
    <div className="mini-player" onClick={onExpand}>
      <div className="mini-player__track">
        <CachedImage src={jellyfin.imageUrl(current.AlbumId || current.Id, 'Primary', 56)} alt="" className="mini-player__art" />
        <div className="mini-player__info">
          <span className="mini-player__name">{current.Name}</span>
          <span className="mini-player__artist">{current.AlbumArtist}</span>
        </div>
      </div>

      <div className="mini-player__controls" onClick={(e) => e.stopPropagation()}>
        <button
          className={`mini-icon-btn ${isFav ? 'mini-icon-btn--accent' : ''}`}
          onClick={() => toggleFavorite(current.Id)}
        >
          <Heart size={20} fill={isFav ? 'currentColor' : 'none'} />
        </button>
        <button className="mini-icon-btn" onClick={togglePlay}>
          {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
        </button>
        <button className="mini-icon-btn" onClick={() => next(true)}>
          <SkipForward size={22} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
