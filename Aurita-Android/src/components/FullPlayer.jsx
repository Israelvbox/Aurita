import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, ListPlus, Shuffle, SkipBack, Play, Pause,
  SkipForward, Repeat, Repeat1, ListMusic,
} from 'lucide-react';
import { usePlayerStore } from '../store/playerStore.js';
import { useFavoritesStore } from '../store/favoritesStore.js';
import { usePlaylistMembershipStore } from '../store/playlistMembershipStore.js';
import { jellyfin } from '../api/jellyfin.js';
import CachedImage from './CachedImage.jsx';
import AddToPlaylistModal from './AddToPlaylistModal.jsx';
import QueueSheet from './QueueSheet.jsx';

function formatTime(s) {
  if (!s || Number.isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

export default function FullPlayer({ visible, onClose }) {
  const navigate = useNavigate();
  const {
    queue, currentIndex, isPlaying, currentTime, duration,
    repeatMode, shuffle,
    togglePlay, next, prev, seekTo,
    toggleRepeat, toggleShuffle,
  } = usePlayerStore();

  const favoriteIds    = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const refreshMembership = usePlaylistMembershipStore((s) => s.refresh);

  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showQueue,   setShowQueue]   = useState(false);

  const touchStartY = useRef(null);
  const current = currentIndex >= 0 ? queue[currentIndex] : null;

  // Gesto swipe-down para cerrar
  function onTouchStart(e) { touchStartY.current = e.touches[0].clientY; }
  function onTouchEnd(e) {
    if (touchStartY.current === null) return;
    if (e.changedTouches[0].clientY - touchStartY.current > 80) onClose();
    touchStartY.current = null;
  }

  if (!current) return null;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat;
  const artist = current.ArtistItems?.[0];

  return (
    <>
      <div
        className={`full-player ${visible ? 'full-player--visible' : ''}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Handle para arrastrar */}
        <div className="full-player__handle-wrap" onClick={onClose}>
          <div className="full-player__handle" />
        </div>

        {/* Portada */}
        <div className="full-player__art-wrap">
          <CachedImage src={jellyfin.imageUrl(current.AlbumId || current.Id, 'Primary', 600)} alt="" className="full-player__art" />
        </div>

        {/* Bloque inferior: info + barra + botones */}
        <div className="full-player__bottom">
          <div className="full-player__info-row">
            <div className="full-player__meta">
              <div className="full-player__title">{current.Name}</div>
              {artist ? (
                <button className="full-player__artist full-player__artist--link"
                  onClick={() => { onClose(); navigate(`/artist/${artist.Id}`, { state: { name: artist.Name } }); }}>
                  {artist.Name}
                </button>
              ) : (
                <div className="full-player__artist">{current.AlbumArtist}</div>
              )}
            </div>
            <button
              className={`fp-btn ${favoriteIds.has(current.Id) ? 'fp-btn--accent' : ''}`}
              onClick={() => toggleFavorite(current.Id)}
            >
              <Heart size={24} fill={favoriteIds.has(current.Id) ? 'currentColor' : 'none'} />
            </button>
          </div>

          <div className="full-player__progress">
            <input
              type="range" min={0} max={duration || 0} value={currentTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="fp-seek" style={{ '--p': `${pct}%` }}
            />
            <div className="full-player__times">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="full-player__controls">
            <button className={`fp-btn ${shuffle ? 'fp-btn--accent' : ''}`} onClick={toggleShuffle}>
              <Shuffle size={20} />
            </button>
            <button className="fp-btn" onClick={prev}>
              <SkipBack size={28} fill="currentColor" />
            </button>
            <button className="fp-play" onClick={togglePlay}>
              {isPlaying
                ? <Pause size={28} fill="currentColor" />
                : <Play size={28} fill="currentColor" />}
            </button>
            <button className="fp-btn" onClick={() => next(true)}>
              <SkipForward size={28} fill="currentColor" />
            </button>
            <button className={`fp-btn ${repeatMode !== 'off' ? 'fp-btn--accent' : ''}`} onClick={toggleRepeat}>
              <RepeatIcon size={20} />
            </button>
          </div>

          <div className="full-player__actions">
            <button className="fp-btn" onClick={() => setShowAddMenu(true)}>
              <ListPlus size={22} />
            </button>
            <button className={`fp-btn ${showQueue ? 'fp-btn--accent' : ''}`} onClick={() => setShowQueue(true)}>
              <ListMusic size={22} />
            </button>
          </div>
        </div>
      </div>

      {showAddMenu && (
        <AddToPlaylistModal
          track={current}
          onClose={() => setShowAddMenu(false)}
          onChanged={refreshMembership}
        />
      )}

      <QueueSheet visible={showQueue} onClose={() => setShowQueue(false)} />
    </>
  );
}
