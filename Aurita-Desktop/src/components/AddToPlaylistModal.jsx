import { useEffect, useState } from 'react';
import { ListPlus, Check, Plus } from 'lucide-react';
import { jellyfin } from '../api/jellyfin.js';
import { service } from '../api/service.js';

export default function AddToPlaylistModal({ track, onClose, onChanged }) {
  const [playlists, setPlaylists] = useState([]);
  const [containing, setContaining] = useState(new Set()); // playlists que YA tienen esta canción
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState(null);
  const [error, setError] = useState(null);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await service.getUserPlaylists();
        const lists = res.Items || [];
        if (cancelled) return;
        setPlaylists(lists);

        // Para saber cuáles ya tienen la canción, miramos el contenido de
        // cada una. Con el número de playlists típico de uso personal esto
        // es rápido y se hace en paralelo.
        const itemsLists = await Promise.all(
          lists.map((p) => service.getPlaylistItems(p.Id).catch(() => ({ Items: [] })))
        );
        if (cancelled) return;
        const already = new Set();
        lists.forEach((p, i) => {
          if ((itemsLists[i].Items || []).some((it) => it.Id === track.Id)) already.add(p.Id);
        });
        setContaining(already);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [track.Id]);

  function handleClose() {
    if (changed) onChanged?.();
    onClose();
  }

  async function handleAdd(playlistId) {
    setError(null);
    setPendingId(playlistId);
    try {
      await jellyfin.addToPlaylist(playlistId, [track.Id]);
      setContaining((prev) => new Set(prev).add(playlistId));
      setChanged(true);
    } catch (err) {
      setError(err.message || 'No se pudo añadir la canción.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>
          <ListPlus size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
          Añadir a una playlist
        </h2>
        <p className="muted small" style={{ marginBottom: '1rem' }}>{track?.Name}</p>

        {loading ? (
          <p className="muted small">Cargando tus playlists…</p>
        ) : playlists.length === 0 ? (
          <p className="muted small">No tienes playlists todavía. Crea una desde Biblioteca.</p>
        ) : (
          <div className="add-to-playlist-list">
            {playlists.map((p) => {
              const already = containing.has(p.Id);
              return (
                <button
                  key={p.Id}
                  className="add-to-playlist-menu__item"
                  onClick={() => !already && handleAdd(p.Id)}
                  disabled={pendingId === p.Id || already}
                >
                  <span>{p.Name}</span>
                  {already ? (
                    <Check size={14} className="icon-btn--accent" />
                  ) : pendingId === p.Id ? (
                    <span className="muted small">Añadiendo…</span>
                  ) : (
                    <Plus size={14} className="muted" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="add-to-playlist-menu__error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={handleClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
