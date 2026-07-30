import { useEffect, useState } from 'react';
import { ListPlus, Plus } from 'lucide-react';
import { jellyfin } from '../api/jellyfin.js';
import { service } from '../api/service.js';
import { invalidateDetail } from '../api/detailCache.js';
import { onPlaylistCreated } from '../api/cacheManager.js';
import ConfirmModal from './ConfirmModal.jsx';

export default function SaveMixModal({ items, title, onClose }) {
  const [mode, setMode] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [pendingId, setPendingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (mode === 'existing') {
      service.getUserPlaylists().then((res) => {
        setPlaylists(res.Items || []);
      }).catch(() => {});
    }
  }, [mode]);

  async function handleCreate(name) {
    setError(null);
    try {
      await jellyfin.createPlaylist(name, items.map((i) => i.Id));
      onPlaylistCreated();
      setSuccess(`Playlist "${name}" creada.`);
    } catch (err) {
      setError(err.message || 'Error al crear playlist.');
    }
  }

  async function handleAdd(playlistId) {
    setError(null);
    setPendingId(playlistId);
    try {
      const existing = await service.getPlaylistItems(playlistId);
      const existingIds = new Set((existing.Items || []).map((i) => i.Id));
      const toAdd = items.filter((i) => !existingIds.has(i.Id)).map((i) => i.Id);
      if (toAdd.length === 0) {
        setSuccess('Todas las canciones ya están en esta playlist.');
        return;
      }
      await jellyfin.addToPlaylist(playlistId, toAdd);
      invalidateDetail(playlistId);
      onPlaylistCreated();
      setSuccess(`${toAdd.length} canciones añadidas.`);
    } catch (err) {
      setError(err.message || 'Error al añadir canciones.');
    } finally {
      setPendingId(null);
    }
  }

  function handleOverlay() {
    onClose();
  }

  if (success) {
    return (
      <div className="modal-overlay" onClick={handleOverlay}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <p style={{ margin: '1rem 0', textAlign: 'center' }}>{success}</p>
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={handleOverlay}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>
          <ListPlus size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
          Guardar mix
        </h2>
        <p className="muted small" style={{ marginBottom: '1rem' }}>{title} · {items.length} canciones</p>

        {mode === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <button className="primary-btn" onClick={() => setShowPrompt(true)}>
              <Plus size={16} style={{ marginRight: '0.4rem' }} />
              Crear nueva playlist
            </button>
            <button className="primary-btn" onClick={() => setMode('existing')}>
              <ListPlus size={16} style={{ marginRight: '0.4rem' }} />
              Añadir a playlist existente
            </button>
          </div>
        )}

        {showPrompt && (
          <ConfirmModal
            title="Nombre de la nueva playlist"
            mode="prompt"
            defaultValue={`${title} (mix)`}
            placeholder="Mi nueva playlist"
            confirmLabel="Crear"
            cancelLabel="Cancelar"
            onConfirm={handleCreate}
            onCancel={() => setShowPrompt(false)}
          />
        )}

        {mode === 'existing' && playlists.length === 0 && (
          <p className="muted small">No tienes playlists. Crea una nueva.</p>
        )}

        {mode === 'existing' && playlists.length > 0 && (
          <div className="add-to-playlist-list">
            {playlists.map((p) => (
              <button
                key={p.Id}
                className="add-to-playlist-menu__item"
                onClick={() => handleAdd(p.Id)}
                disabled={pendingId === p.Id}
              >
                <span>{p.Name}</span>
                {pendingId === p.Id ? (
                  <span className="muted small">Añadiendo…</span>
                ) : (
                  <Plus size={14} className="muted" />
                )}
              </button>
            ))}
          </div>
        )}

        {error && <p className="add-to-playlist-menu__error">{error}</p>}

        <div className="modal-actions" style={{ marginTop: '1rem' }}>
          <button type="button" className="secondary-btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
