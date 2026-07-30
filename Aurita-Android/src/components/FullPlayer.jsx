import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, ListPlus, Shuffle, SkipBack, Play, Pause,
  SkipForward, Repeat, Repeat1, ListMusic, Settings, Timer, FileText, X,
} from 'lucide-react';
import { usePlayerStore } from '../store/playerStore.js';
import { useFavoritesStore } from '../store/favoritesStore.js';
import { usePlaylistMembershipStore } from '../store/playlistMembershipStore.js';
import { useSettingsStore } from '../store/settingsStore.js';
import { jellyfin } from '../api/jellyfin.js';
import CachedImage from './CachedImage.jsx';
import VinylRecord from './VinylRecord.jsx';
import AddToPlaylistModal from './AddToPlaylistModal.jsx';
import QueueSheet from './QueueSheet.jsx';
import LyricsDisplay from './LyricsDisplay.jsx';
import { formatDuration } from '../utils.js';

export default function FullPlayer({ visible, onClose }) {
  const navigate = useNavigate();
  const {
    queue, currentIndex, isPlaying, currentTime, duration,
    repeatMode, shuffle, sleepTimer,
    togglePlay, next, prev, seekTo,
    toggleRepeat, toggleShuffle, setSleepTimer,
  } = usePlayerStore();

  const favoriteIds    = useFavoritesStore((s) => s.ids);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const refreshMembership = usePlaylistMembershipStore((s) => s.refresh);
  const vinylMode = useSettingsStore((s) => s.vinylMode);

  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showQueue,   setShowQueue]   = useState(false);
  const [showLyricsOverlay, setShowLyricsOverlay] = useState(false);

  const touchStartY = useRef(null);
  const touchStartX = useRef(null);
  const current = currentIndex >= 0 ? queue[currentIndex] : null;

  function onTouchStart(e) { touchStartY.current = e.touches[0].clientY; }
  function onTouchEnd(e) {
    if (touchStartY.current === null) return;
    if (e.changedTouches[0].clientY - touchStartY.current > 80) onClose();
    touchStartY.current = null;
  }

  function onArtTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function onArtTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 60) {
      if (dx < 0) next(true);
      else prev();
    }
    touchStartX.current = null;
  }

  if (!current) return null;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat;
  const artist = current.ArtistItems?.[0];
  const artUrl = jellyfin.imageUrl(current.AlbumId || current.Id, 'Primary', 600);

  return (
    <>
      <div
        className={`full-player ${visible ? 'full-player--visible' : ''}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="full-player__handle-wrap" onClick={onClose}>
          <div className="full-player__handle" />
        </div>

        <div className="full-player__main">
          {/* Portada / Vinilo */}
          <div className="full-player__art-wrap"
            onTouchStart={onArtTouchStart}
            onTouchEnd={onArtTouchEnd}
          >
            {vinylMode ? (
              <VinylRecord albumArt={artUrl} alt={current.Name} />
            ) : (
              <CachedImage src={artUrl} alt="" className="full-player__art" />
            )}
          </div>

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
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(duration)}</span>
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
              <button className={`fp-btn ${showLyricsOverlay ? 'fp-btn--accent' : ''}`} onClick={() => setShowLyricsOverlay(true)}>
                <FileText size={20} />
              </button>
              <button className={`fp-btn ${showQueue ? 'fp-btn--accent' : ''}`} onClick={() => setShowQueue(true)}>
                <ListMusic size={22} />
              </button>
              <button className="fp-btn" onClick={() => { onClose(); navigate('/ajustes'); }}>
                <Settings size={20} />
              </button>
              <button className={`fp-btn ${sleepTimer > 0 ? 'fp-btn--accent' : ''}`}
                onClick={() => {
                  if (sleepTimer > 0) { setSleepTimer(0); return; }
                  const next = sleepTimer === 15 ? 30 : sleepTimer === 30 ? 60 : 15;
                  setSleepTimer(next);
                }}
                title={sleepTimer > 0 ? `${sleepTimer} min restantes` : 'Temporizador'}>
                <Timer size={18} />
                {sleepTimer > 0 && <span className="fp-btn__badge">{sleepTimer}</span>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showLyricsOverlay && (
        <div className="modal-overlay lyrics-overlay" onClick={() => setShowLyricsOverlay(false)}>
          <div className="lyrics-fullscreen" onClick={(e) => e.stopPropagation()}>
            <div className="lyrics-fullscreen__header">
              <h2 className="lyrics-fullscreen__title">{current.Name}</h2>
              <button className="lyrics-fullscreen__close" onClick={() => setShowLyricsOverlay(false)}>
                <X size={22} />
              </button>
            </div>
            <LyricsDisplay
              trackId={current.Id}
              trackName={current.Name}
              artistName={current.AlbumArtist || (current.Artists || [])[0] || ''}
              duration={duration}
              currentTime={currentTime}
              isPlaying={isPlaying}
              fullscreen
            />
          </div>
        </div>
      )}

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
