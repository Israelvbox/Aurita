import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search as SearchIcon, Trash2 } from 'lucide-react';
import { jellyfin } from '../api/jellyfin.js';
import { service } from '../api/service.js';
import { prefetchDetail } from '../api/detailCache.js';
import { registerInvalidator, onPlaylistCreated, onPlaylistDeleted } from '../api/cacheManager.js';
import PlaylistFormModal from '../components/PlaylistFormModal.jsx';

function normalize(s='') { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

let _playlistsCache = [];

registerInvalidator('library', () => { _playlistsCache = []; });

export function Library() {
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState(_playlistsCache);
  const [loading,   setLoading]   = useState(_playlistsCache.length === 0);
  const [term,      setTerm]      = useState('');
  const [showModal, setShowModal] = useState(false);

  async function load() {
    if (_playlistsCache.length === 0) setLoading(true);
    const res = await service.getUserPlaylists();
    _playlistsCache = res.Items || [];
    setPlaylists(_playlistsCache);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (_playlistsCache.length === 0 && playlists.length > 0) load();
  });

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
    setPlaylists((p) => p.filter((x) => x.Id !== id));
    _playlistsCache = _playlistsCache.filter((x) => x.Id !== id);
  }

  return (
    <div className="page">
      <div className="library-header">
        <h1>Biblioteca</h1>
        <button className="icon-btn" onClick={() => setShowModal(true)} title="Nueva playlist">
          <Plus size={20} />
        </button>
      </div>
      <div className="search-input-wrap search-input-wrap--compact">
        <SearchIcon size={16} className="search-input__icon" />
        <input className="search-input" type="text" placeholder="Buscar playlists…"
          value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      {loading ? <p className="muted page-pad">Cargando…</p> : filtered.length === 0 ?
        <p className="muted page-pad">{term ? 'Sin resultados.' : 'Aún no tienes playlists.'}</p> :
        <div className="playlist-grid">
          {filtered.map((p) => (
            <button key={p.Id} className="card card--playlist" onClick={() => navigate(`/playlist/${p.Id}`)}
              onMouseEnter={() => prefetchDetail(p.Id)}>
              <img src={jellyfin.imageUrl(p.Id, 'Primary', 300, p.ImageTags?.Primary)} alt="" />
              <div className="card__title">{p.Name}</div>
              <div className="card__subtitle">Playlist</div>
              <button className="card__delete" title="Borrar"
                onClick={(e) => { e.stopPropagation(); handleDelete(e, p.Id, p.Name); }}>
                <Trash2 size={14} />
              </button>
            </button>
          ))}
        </div>
      }
      {showModal && <PlaylistFormModal onClose={() => setShowModal(false)} onSubmit={handleCreate} />}
    </div>
  );
}

export default Library;
