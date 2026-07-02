import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search as SearchIcon, Trash2 } from 'lucide-react';
import { jellyfin } from '../api/jellyfin.js';
import { service } from '../api/service.js';
import { prefetchDetail } from '../api/detailCache.js';
import { registerInvalidator, onPlaylistCreated, onPlaylistDeleted } from '../api/cacheManager.js';
import CachedImage from '../components/CachedImage.jsx';
import PlaylistFormModal from '../components/PlaylistFormModal.jsx';

function normalize(s='') { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

let _playlistsCache = [];

// Registrar para que cacheManager invalide Library cuando haga falta
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

  // Detectar si cacheManager vació la caché mientras Library está montado
  useEffect(() => {
    if (_playlistsCache.length === 0 && playlists.length > 0) {
      load();
    }
  });

  const filtered = useMemo(() => {
    if (!term.trim()) return playlists;
    const q = normalize(term);
    return playlists.filter((p) => normalize(p.Name).includes(q));
  }, [playlists, term]);

  async function handleCreate({ name }) {
    await jellyfin.createPlaylist(name);
    onPlaylistCreated(); // invalida Home + Library en cacheManager
    await load();        // refresca la lista inmediatamente
  }

  async function handleDelete(e, id, name) {
    e.stopPropagation();
    if (!confirm(`¿Borrar "${name}"?`)) return;
    await jellyfin.deletePlaylist(id);
    onPlaylistDeleted(id); // invalida Home + Library + detail de esa playlist
    setPlaylists((p) => p.filter((x) => x.Id !== id));
    _playlistsCache = _playlistsCache.filter((x) => x.Id !== id);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Biblioteca</h1>
        <button className="fab-small" onClick={() => setShowModal(true)}><Plus size={20} /></button>
      </div>
      <div className="search-wrap">
        <SearchIcon size={16} className="search-icon" />
        <input className="search-input" type="text" placeholder="Buscar playlists…"
          value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      {loading ? <p className="muted page-pad">Cargando…</p> : filtered.length === 0 ?
        <p className="muted page-pad">{term ? `Sin resultados.` : 'Aún no tienes playlists.'}</p> :
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
