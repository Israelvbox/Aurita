import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search as SearchIcon, Trash2, Download, Music } from 'lucide-react';
import { jellyfin } from '../api/jellyfin.js';
import { service } from '../api/service.js';
import { prefetchDetail, prefetchDetails } from '../api/detailCache.js';
import { registerInvalidator, onPlaylistCreated, onPlaylistDeleted } from '../api/cacheManager.js';
import CachedImage from '../components/CachedImage.jsx';
import PlaylistFormModal from '../components/PlaylistFormModal.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { cacheStore } from '../db/storage.js';
import { useOfflineStore } from '../store/offlineStore.js';
import { useToastStore } from '../store/toastStore.js';
import { normalize } from '../utils.js';

let _playlistsCache = [];

registerInvalidator('library', () => { _playlistsCache = []; });

export function Library() {
  const navigate = useNavigate();
  const isOffline = useOfflineStore((s) => s.isOffline);
  const downloadedCount = useOfflineStore((s) => s.downloadedIds.size);
  const toast = useToastStore((s) => s.show);
  const [playlists, setPlaylists] = useState(_playlistsCache);
  const [loading,   setLoading]   = useState(_playlistsCache.length === 0);
  const [term,      setTerm]      = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [downloads, setDownloads] = useState(null);

  async function load() {
    if (_playlistsCache.length === 0) setLoading(true);
    try {
      const res = await service.getUserPlaylists();
      _playlistsCache = res.Items || [];
      setPlaylists(_playlistsCache);
      setLoading(false);
      setTimeout(() => {
        prefetchDetails(_playlistsCache.slice(0, 5).map((p) => p.Id)).catch(() => {});
      }, 200);
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
      const list = await cacheStore.get('offline_playlist', 'list') || [];
      setDownloads(list);
    } catch {
      setDownloads([]);
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
    toast('Playlist creada', 'success');
    await load();
  }

  async function handleDelete(e, id, name) {
    e.stopPropagation();
    setDeleteTarget({ id, name });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await jellyfin.deletePlaylist(deleteTarget.id);
    toast('Playlist eliminada', 'error');
    onPlaylistDeleted(deleteTarget.id);
    _playlistsCache = [];
    setPlaylists([]);
    setLoading(true);
    setDeleteTarget(null);
    await load();
  }

  return (
    <div className="page" style={{ paddingBottom: 'calc(var(--bottom-area-h) + 60px)' }}>
      <div className="page-header">
        <h1 className="page-title">{isOffline ? 'Sin conexión' : 'Biblioteca'}</h1>
        <div className="page-header__actions">
          {downloadedCount > 0 && (
            <button className="fab-small" onClick={() => navigate('/descargas')} title="Descargas">
              <Download size={18} />
            </button>
          )}
          {!isOffline && <button className="fab-small" onClick={() => setShowModal(true)}><Plus size={20} /></button>}
        </div>
      </div>
      <div className="search-wrap">
        <SearchIcon size={16} className="search-icon" />
        <input className="search-input" type="text" placeholder="Buscar playlists…"
          value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>

      {isOffline && downloads && downloads.length > 0 && (
        <>
          <h2 className="page-section-title">
            <Download size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Descargadas ({downloads.length})
          </h2>
          <div className="list-view" style={{ marginBottom: 16 }}>
            {downloads.map((p) => (
              <div key={p.Id} className="list-item" onClick={() => navigate(`/playlist/${p.Id}`)}>
                <CachedImage src={jellyfin.imageUrl(p.Id,'Primary',56,p.ImageTags?.Primary)} alt="" className="list-item__art" />
                <div className="list-item__info">
                  <div className="list-item__name">{p.Name}</div>
                  <div className="list-item__sub muted">
                    <Music size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    Playlist descargada
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {isOffline && (!downloads || downloads.length === 0) && (
        <p className="muted page-pad" style={{ marginTop: 12 }}>
          No hay playlists descargadas. Conectate a internet, descargá una playlist y volvé.
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
      {deleteTarget && (
        <ConfirmModal
          title="Borrar playlist"
          message={`¿Borrar "${deleteTarget.name}"?`}
          confirmLabel="Borrar"
          cancelLabel="Cancelar"
          confirmDanger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default Library;
