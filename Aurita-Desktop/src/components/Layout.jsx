import { useState, useRef, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { Home as HomeIcon, Search as SearchIcon, Library as LibraryIcon, Heart, Settings as SettingsIcon, LogOut, RefreshCw, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../store/authStore.js';
import { usePlayerStore } from '../store/playerStore.js';
import PlayerBar from './PlayerBar.jsx';
import logo from '../assets/logo.png';

export default function Layout({ children }) {
  const { user, logout, reconnect } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectMsg, setReconnectMsg] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKey(e) {
      const st = usePlayerStore.getState();
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (st.currentIndex < 0) return;

      if (e.code === 'Space') {
        e.preventDefault();
        st.togglePlay();
      } else if (e.code === 'ArrowRight' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        st.seekTo(Math.min(st.currentTime + 10, st.duration || 0));
      } else if (e.code === 'ArrowLeft' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        st.seekTo(Math.max(st.currentTime - 10, 0));
      } else if (e.code === 'ArrowRight' && e.ctrlKey) {
        e.preventDefault();
        st.next(true);
      } else if (e.code === 'ArrowLeft' && e.ctrlKey) {
        e.preventDefault();
        st.prev();
      } else if (e.code === 'ArrowUp' && e.ctrlKey) {
        e.preventDefault();
        st.setVolume(Math.min(1, st.volume + 0.05));
      } else if (e.code === 'ArrowDown' && e.ctrlKey) {
        e.preventDefault();
        st.setVolume(Math.max(0, st.volume - 0.05));
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  async function handleReconnect() {
    setReconnecting(true);
    setReconnectMsg(null);
    const ok = await reconnect();
    setReconnectMsg(ok ? 'Conectado correctamente.' : 'No se pudo reconectar.');
    setReconnecting(false);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <img src={logo} alt="" className="logo__icon" />
          Aurita
        </div>
        <nav>
          <NavLink to="/" end>
            <HomeIcon size={18} /> <span>Inicio</span>
          </NavLink>
          <NavLink to="/buscar">
            <SearchIcon size={18} /> <span>Buscador</span>
          </NavLink>
          <NavLink to="/biblioteca">
            <LibraryIcon size={18} /> <span>Biblioteca</span>
          </NavLink>
          <NavLink to="/favoritos">
            <Heart size={18} /> <span>Me gusta</span>
          </NavLink>
        </nav>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div />
          <div className="user-panel" ref={menuRef}>
            <button className="user-menu" onClick={() => setOpen((v) => !v)}>
              <span>{user?.Name || 'Usuario'}</span>
              <ChevronDown size={14} />
            </button>

            {open && (
              <div className="user-dropdown">
                <button className="user-dropdown__item" onClick={handleReconnect} disabled={reconnecting}>
                  <RefreshCw size={15} className={reconnecting ? 'spin' : ''} />
                  {reconnecting ? 'Reconectando…' : 'Reconectar con el servidor'}
                </button>
                {reconnectMsg && <p className="user-dropdown__msg">{reconnectMsg}</p>}
                <div className="user-dropdown__divider" />
                <button className="user-dropdown__item" onClick={() => { setOpen(false); navigate('/ajustes'); }}>
                  <SettingsIcon size={15} /> Ajustes
                </button>
                <div className="user-dropdown__divider" />
                <button className="user-dropdown__item user-dropdown__item--danger" onClick={logout}>
                  <LogOut size={15} /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="content">{children}</main>

        <PlayerBar />
      </div>
    </div>
  );
}
