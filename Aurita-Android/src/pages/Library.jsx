import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search as SearchIcon, Trash2, Download } from 'lucide-react';
import { registerPlugin } from '@capacitor/core';
import { jellyfin } from '../api/jellyfin.js';
import { service } from '../api/service.js';
import { prefetchDetail } from '../api/detailCache.js';
import { registerInvalidator, onPlaylistCreated, onPlaylistDeleted } from '../api/cacheManager.js';
import CachedImage from '../components/CachedImage.jsx';
import PlaylistFormModal from '../components/PlaylistFormModal.jsx';
import { cacheStore } from '../db/storage.js';
import { useOfflineStore } from '../store/offlineStore.js';
import { usePlayerStore } from '../store/playerStore.js';
import { getAllTracksLocal } from '../api/localIndex.js';

const AuritaPlayer = registerPlugin('AuritaPlayer');

function normalize(s='') { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

let _playlistsCache = [];

registerInvalidator('library', () => { _playlistsCache = []; });

export function Library() {
  const navigate = useNavigate();
  const isOffline = useOfflineStore((s) => s.isOffline);
  const playItem  = usePlayerStore((s) => s.playItem);
  const [playlists, setPlaylists] = useState(_playlistsCache);
  const [loading,   setLoading]   = useState(_playlistsCache.length === 0);
  const [term,      setTerm]      = useState('');
  const [showModal, setShowModal] = useState(false);
  const [downloads, setDownloads] = useState(null);

  async function load() {
    if (_playlistsCache.length === 0) setLoading(true);
    try {
      const res = await service.getUserPlaylists();
      _playlistsCache = res.Items || [];
      setPlaylists(_playlistsCache);
      setLoading(false);
    } catch {
      const offlineList = await cacheStore.get('offline_playlist', 'list') || [];
      if (offlineList.length > 0) {
        _playlistsCache = offlineList;
        setPlaylists(offlineList);
      }
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (isOffline) loadDownloads();
  }, [isOffline]); // eslint-disable-line

  useEffect(() => {
    if (_playlistsCache.length === 0 && playlists.length > 0) {
      load();
    }
  });

  async function loadDownloads() {
    try {
      const result = await AuritaPlayer.getDownloadedIds();
      const ids = result.ids || [];
      const allTracks = getAllTracksLocal() || [];
      const downloaded = allTracks.filter((t) => ids.includes(t.Id));
      setDownloads({ ids, tracks: downloaded, count: downloaded.length });
    } catch {
      setDownloads({ ids: [], tracks: [], count: 0 });
    }
  }

  const filtered = useMemo(() => {
    if (!term.trim()) return playlists;
    const q = normalize(term);
    return playlists.filter((p) => normalize(p.Name).includes(q));
  }, [playlists, term]);

  async function handleCreate({ name }) {
    await jellyfin.createPlaylist(name);
    onPlaylistCreated();
    await load();
  }

  async function handleDelete(e, id, name) {
    e.stopPropagation();
    if (!confirm(`¿Borrar "${name}"?`)) return;
    await jellyfin.deletePlaylist(id);
    onPlaylistDeleted(id);
    _playlistsCache = [];
    setPlaylists([]);
    setLoading(true);
    await load();
  }

  function handlePlayDownloaded(track) {
    playItem(track, [track]);
  }

  return (
    <div className="page" style={{ paddingBottom: 'calc(var(--bottom-area-h) + 60px)' }}>
      <div className="page-header">
        <h1 className="page-title">{isOffline ? 'Sin conexión' : 'Biblioteca'}</h1>
        {!isOffline && <button className="fab-small" onClick={() => setShowModal(true)}><Plus size={20} /></button>}
      </div>
      <div className="search-wrap">
        <SearchIcon size={16} className="search-icon" />
        <input className="search-input" type="text" placeholder="Buscar playlists…"
          value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>

      {isOffline && downloads && downloads.count > 0 && (
        <>
          <h2 className="page-section-title">
            <Download size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Descargadas ({downloads.count})
          </h2>
          <div className="list-view" style={{ marginBottom: 16 }}>
            {downloads.tracks.slice(0, 20).map((t) => (
              <div key={t.Id} className="list-item" onClick={() => handlePlayDownloaded(t)}>
                <CachedImage src={jellyfin.imageUrl(t.AlbumId || t.Id, 'Primary', 56, t.ImageTags?.Primary)} alt="" className="list-item__art" />
                <div className="list-item__info">
                  <div className="list-item__name">{t.Name}</div>
                  <div className="list-item__sub muted">{t.AlbumArtist}</div>
                </div>
              </div>
            ))}
            {downloads.count > 20 && (
              <div className="list-item" onClick={() => navigate('/search')}>
                <div className="list-item__info">
                  <div className="list-item__name" style={{ color: 'var(--accent)' }}>
                    Ver todas ({downloads.count}) →
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {isOffline && (!downloads || downloads.count === 0) && (
        <p className="muted page-pad" style={{ marginTop: 12 }}>
          No hay canciones descargadas. Conectate a internet, descargá algunas y volvé.
        </p>
      )}

      {loading ? <p className="muted page-pad">Cargando…</p> : filtered.length === 0 ?
        <p className="muted page-pad">{term ? 'Sin resultados.' : 'Aún no tenés playlists.'}</p> :
        <div className="list-view">
          {filtered.map((p) => (
            <div key={p.Id} className="list-item" onClick={() => navigate(`/playlist/${p.Id}`)}
              onTouchStart={() => prefetchDetail(p.Id)}>
              <CachedImage src={jellyfin.imageUrl(p.Id,'Primary',56,p.ImageTags?.Primary)} alt="" className="list-item__art" />
              <div className="list-item__info">
                <div className="list-item__name">{p.Name}</div>
                <div className="list-item__sub muted">Playlist</div>
              </div>
              <button className="list-item__action" onClick={(e) => handleDelete(e, p.Id, p.Name)}>
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      }
      {showModal && <PlaylistFormModal onClose={() => setShowModal(false)} onSubmit={handleCreate} />}
    </div>
  );
}

export default Library;
