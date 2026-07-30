import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Trash2, Download, Music } from 'lucide-react';
import { registerPlugin } from '@capacitor/core';
const AuritaPlayer = registerPlugin('AuritaPlayer');
import { jellyfin } from '../api/jellyfin.js';
import { usePlayerStore, warmTrack } from '../store/playerStore.js';
import { useOfflineStore } from '../store/offlineStore.js';
import { searchLocal, isIndexReady } from '../api/localIndex.js';
import { getAllTracksLocal } from '../api/localIndex.js';
import CachedImage from '../components/CachedImage.jsx';
import { formatTotalDuration } from '../utils.js';

export default function Downloads() {
  const navigate = useNavigate();
  const playItem = usePlayerStore((s) => s.playItem);
  const currentId = usePlayerStore((s) => s.queue[s.currentIndex]?.Id);
  const downloadedIds = useOfflineStore((s) => s.downloadedIds);
  const downloading = useOfflineStore((s) => s.downloading);
  const downloadProgress = useOfflineStore((s) => s.downloadProgress);
  const deleteDownload = useOfflineStore((s) => s.deleteDownload);

  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadTracks = useCallback(() => {
    const ids = downloadedIds;
    if (ids.size === 0) { setTracks([]); setLoading(false); return; }
    if (isIndexReady()) {
      const all = getAllTracksLocal() || [];
      setTracks(all.filter((t) => ids.has(t.Id)));
      setLoading(false);
    } else {
      setTracks([]);
      setLoading(false);
    }
  }, [downloadedIds]);

  useEffect(() => { loadTracks(); }, [loadTracks]);

  const totalDuration = tracks.reduce((sum, t) => sum + ((t.RunTimeTicks || 0) / 10_000_000), 0);

  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} />
        </button>
        <h1 className="page-title">Descargas</h1>
      </div>

      {downloading.size > 0 && (
        <div className="settings-section" style={{ marginBottom: 8 }}>
          <h2 className="settings-section-title">Descargando…</h2>
          <div className="page-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...downloading].map((id) => (
              <div key={id} className="track-row" style={{ opacity: 0.7 }}>
                <Download size={18} />
                <div className="track-row__info">
                  <div className="track-row__name">{id.slice(0, 20)}…</div>
                  <div className="track-row__artist muted">
                    {downloadProgress[id] != null ? `${downloadProgress[id]}%` : 'Esperando…'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tracks.length > 0 && (
        <button className="play-all-btn" onClick={() => playItem(tracks[0], tracks, 'list')}>
          <Play size={18} fill="currentColor" /> Reproducir todo · {formatTotalDuration(totalDuration)}
        </button>
      )}

      {!loading && tracks.length === 0 && downloading.size === 0 && (
        <p className="muted page-pad">No hay canciones descargadas. Descarga canciones para escucharlas sin conexión.</p>
      )}

      {tracks.length > 0 && (
        <div className="track-list">
          {tracks.map((t) => (
            <div key={t.Id} className={`track-row ${t.Id === currentId ? 'track-row--active' : ''}`}
              onClick={() => playItem(t, tracks, 'list')} onTouchStart={() => warmTrack(t.Id)}>
              <CachedImage src={jellyfin.imageUrl(t.AlbumId || t.Id, 'Primary', 56)} alt="" className="track-row__art" />
              <div className="track-row__info">
                <div className="track-row__name">{t.Name}</div>
                <div className="track-row__artist muted">{t.AlbumArtist}</div>
              </div>
              <button className="track-row__action" onClick={(e) => { e.stopPropagation(); deleteDownload(t.Id); }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
