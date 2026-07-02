import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, ArrowLeft, Heart, Trash2, Pencil, X } from 'lucide-react';
import { jellyfin } from '../api/jellyfin.js';
import { fetchDetail, getCachedDetail, setDetailCache } from '../api/detailCache.js';
import { usePlayerStore, warmTrack, warmFirstTracks } from '../store/playerStore.js';
import { useFavoritesStore } from '../store/favoritesStore.js';
import { usePlaylistMembershipStore } from '../store/playlistMembershipStore.js';
import PlaylistFormModal from '../components/PlaylistFormModal.jsx';

export default function PlaylistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentTrackId   = usePlayerStore((s) => s.queue[s.currentIndex]?.Id);
  const playItem         = usePlayerStore((s) => s.playItem);
  // Se usan como funciones normales para evitar problemas de binding en el JSX.
  const favoriteIds      = useFavoritesStore((s) => s.ids);
  const toggleFavorite   = useFavoritesStore((s) => s.toggle);
  const refreshMembership = usePlaylistMembershipStore((s) => s.refresh);

  const [info, setInfo]       = useState(null);
  const [tracks, setTracks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  async function load({ forceFresh = false } = {}) {
    if (!forceFresh) {
      const cached = await getCachedDetail(id);
      if (cached) {
        setInfo(cached.info);
        setTracks(cached.tracks);
        setLoading(false);
        warmFirstTracks(cached.tracks);
        // Refresca en segundo plano para mantener el caché actualizado.
        fetchDetail(id).then((fresh) => {
          setInfo(fresh.info);
          setTracks(fresh.tracks);
          setDetailCache(id, fresh);
        }).catch(() => {});
        return;
      }
    }
    setLoading(true);
    const data = await fetchDetail(id);
    setInfo(data.info);
    setTracks(data.tracks);
    setLoading(false);
    setDetailCache(id, data);
    warmFirstTracks(data.tracks);
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRemoveTrack(track) {
    const entryId = track.PlaylistItemId;
    if (!entryId) return;
    const newTracks = tracks.filter((t) => t.PlaylistItemId !== entryId);
    setTracks(newTracks); // optimista
    try {
      await jellyfin.removeFromPlaylist(id, [entryId]);
      setDetailCache(id, { info, tracks: newTracks });
      refreshMembership();
    } catch {
      load({ forceFresh: true }); // revertir si falla
    }
  }

  async function handleDeletePlaylist() {
    if (!confirm(`¿Borrar la playlist "${info?.Name}"? Esta acción no se puede deshacer.`)) return;
    await jellyfin.deletePlaylist(id);
    refreshMembership();
    navigate('/biblioteca');
  }

  async function handleEdit({ name }) {
    if (name !== info?.Name) await jellyfin.renamePlaylist(id, name);
    await load({ forceFresh: true });
  }

  if (loading) return <div className="detail-page"><p className="muted">Cargando…</p></div>;

  const isPlaylist = info?.Type === 'Playlist';

  return (
    <div className="detail-page">
      <button className="back-btn" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> Volver
      </button>

      <div className="detail-header">
        <img
          src={jellyfin.imageUrl(id, 'Primary', 220, info?.ImageTags?.Primary)}
          alt=""
          className="detail-cover"
        />
        <div>
          <span className="detail-kind">{isPlaylist ? 'Playlist' : 'Álbum'}</span>
          <h1>{info?.Name}</h1>
          <p className="detail-meta">{tracks.length} canciones</p>
          <div className="detail-actions">
            {tracks.length > 0 && (
              <button className="play-circle" onClick={() => playItem(tracks[0], tracks)} title="Reproducir">
                <Play size={20} fill="currentColor" />
              </button>
            )}
            {isPlaylist && (
              <>
                <button className="icon-btn icon-btn--lg" onClick={() => setShowEdit(true)} title="Editar playlist">
                  <Pencil size={17} />
                </button>
                <button className="icon-btn icon-btn--lg icon-btn--danger" onClick={handleDeletePlaylist} title="Borrar playlist">
                  <Trash2 size={18} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="track-list">
        {tracks.length === 0 ? (
          <p className="muted">Todavía no hay canciones aquí.</p>
        ) : (
          tracks.map((t, i) => {
            const fav = favoriteIds.has(t.Id);
            return (
              <div
                key={t.PlaylistItemId || t.Id}
                className={`track-row ${t.Id === currentTrackId ? 'track-row--active' : ''}`}
              >
                <span className="track-row__index">{i + 1}</span>
                <button
                  className="track-row__main"
                  onClick={() => playItem(t, tracks)}
                  onMouseEnter={() => warmTrack(t.Id)}
                >
                  <div className="track-row__name">{t.Name}</div>
                  <div className="track-row__artist muted">{t.AlbumArtist}</div>
                </button>
                <button
                  className={`icon-btn ${fav ? 'icon-btn--accent' : ''}`}
                  title="Me gusta"
                  onClick={() => toggleFavorite(t.Id)}
                >
                  <Heart size={16} fill={fav ? 'currentColor' : 'none'} />
                </button>
                {isPlaylist && (
                  <button className="icon-btn" title="Quitar de la playlist" onClick={() => handleRemoveTrack(t)}>
                    <X size={16} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {showEdit && (
        <PlaylistFormModal
          mode="edit"
          initialName={info?.Name}
          onClose={() => setShowEdit(false)}
          onSubmit={handleEdit}
        />
      )}
    </div>
  );
}
