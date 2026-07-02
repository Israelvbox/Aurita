import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1,
  ListMusic, Volume2, Heart, ListPlus,
} from 'lucide-react';
import { usePlayerStore } from '../store/playerStore.js';
import { useFavoritesStore } from '../store/favoritesStore.js';
import { usePlaylistMembershipStore } from '../store/playlistMembershipStore.js';
import { jellyfin } from '../api/jellyfin.js';
import QueuePanel from './QueuePanel.jsx';
import AddToPlaylistModal from './AddToPlaylistModal.jsx';

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function PlayerBar() {
  const navigate = useNavigate();
  const {
    queue, currentIndex, isPlaying, currentTime, duration, volume,
    repeatMode, shuffle, togglePlay, next, prev, seekTo, setVolume,
    toggleRepeat, toggleShuffle,
  } = usePlayerStore();

  const isFavorite = useFavoritesStore((s) => (queue[currentIndex] ? s.isFavorite(queue[currentIndex].Id) : false));
  const toggleFavoriteGlobal = useFavoritesStore((s) => s.toggle);
  const inAnyPlaylist = usePlaylistMembershipStore((s) =>
    queue[currentIndex] ? s.isInAnyPlaylist(queue[currentIndex].Id) : false
  );
  const refreshMembership = usePlaylistMembershipStore((s) => s.refresh);

  const [showQueue, setShowQueue] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const current = currentIndex >= 0 ? queue[currentIndex] : null;

  if (!current) return <div className="player-bar player-bar--empty" />;

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat;
  const artist = current.ArtistItems?.[0];

  return (
    <>
      {showQueue && <QueuePanel onClose={() => setShowQueue(false)} />}

      <div className="player-bar">
        <div className="player-bar__track">
          <img src={jellyfin.imageUrl(current.AlbumId || current.Id, 'Primary', 64, current.ImageTags?.Primary || current.AlbumPrimaryImageTag)} alt="" />
          <div className="player-bar__track-info">
            <div className="track-name">{current.Name}</div>
            {artist ? (
              <button className="track-artist track-artist--link" onClick={() => navigate(`/artist/${artist.Id}`, { state: { name: artist.Name } })}>
                {artist.Name}
              </button>
            ) : (
              <div className="track-artist">{current.AlbumArtist || (current.Artists || []).join(', ')}</div>
            )}
          </div>
          <button
            className={`icon-btn ${isFavorite ? 'icon-btn--accent' : ''}`}
            onClick={() => toggleFavoriteGlobal(current.Id).catch(() => {})}
            title="Me gusta"
          >
            <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            className={`icon-btn ${inAnyPlaylist ? 'icon-btn--accent' : ''}`}
            onClick={() => setShowAddMenu(true)}
            title={inAnyPlaylist ? 'Ya está en alguna playlist (añadir a otra)' : 'Añadir a una playlist'}
          >
            <ListPlus size={17} />
          </button>
        </div>

        {showAddMenu && (
          <AddToPlaylistModal
            track={current}
            onClose={() => setShowAddMenu(false)}
            onChanged={refreshMembership}
          />
        )}

        <div className="player-bar__center">
          <div className="player-bar__buttons">
            <button className={`icon-btn ${shuffle ? 'icon-btn--accent' : ''}`} onClick={toggleShuffle} title="Aleatorio">
              <Shuffle size={17} />
            </button>
            <button className="icon-btn" onClick={prev} title="Anterior">
              <SkipBack size={18} fill="currentColor" />
            </button>
            <button className="play-btn" onClick={togglePlay} title="Reproducir/Pausar">
              {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
            <button className="icon-btn" onClick={() => next(true)} title="Siguiente">
              <SkipForward size={18} fill="currentColor" />
            </button>
            <button
              className={`icon-btn ${repeatMode !== 'off' ? 'icon-btn--accent' : ''}`}
              onClick={toggleRepeat}
              title={`Repetir: ${repeatMode === 'off' ? 'desactivado' : repeatMode === 'all' ? 'todo' : 'una'}`}
            >
              <RepeatIcon size={17} />
            </button>
          </div>

          <div className="player-bar__progress">
            <span className="time">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="seek-bar"
              style={{ '--progress': `${progressPct}%` }}
            />
            <span className="time">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="player-bar__right">
          <button
            className={`icon-btn ${showQueue ? 'icon-btn--accent' : ''}`}
            onClick={() => setShowQueue((v) => !v)}
            title="Cola de reproducción"
          >
            <ListMusic size={18} />
          </button>
          <Volume2 size={17} className="volume-icon" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="volume-bar"
            style={{ '--progress': `${volume * 100}%` }}
          />
        </div>
      </div>
    </>
  );
}
