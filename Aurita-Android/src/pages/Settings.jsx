import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Disc3, Music, DiscAlbum, LogOut } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore.js';
import { useAuthStore } from '../store/authStore.js';

export default function Settings() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const {
    vinylMode, showLyrics,
    setVinylMode, setShowLyrics,
  } = useSettingsStore();

  return (
    <div className="page">
      <div className="settings-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} />
        </button>
        <h1 className="settings-title">Ajustes</h1>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">Reproducción</h2>

        <label className="settings-row">
          <div className="settings-row__info">
            <Disc3 size={20} />
            <span>Modo vinilo</span>
          </div>
          <input
            type="checkbox"
            className="settings-toggle"
            checked={vinylMode}
            onChange={(e) => setVinylMode(e.target.checked)}
          />
        </label>

        <label className="settings-row">
          <div className="settings-row__info">
            <Music size={20} />
            <span>Letras sincronizadas</span>
          </div>
          <input
            type="checkbox"
            className="settings-toggle"
            checked={showLyrics}
            onChange={(e) => setShowLyrics(e.target.checked)}
          />
        </label>

      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">Apariencia</h2>
        <div className="settings-row settings-row--info">
          <div className="settings-row__info">
            <DiscAlbum size={20} />
            <span>Carátula</span>
          </div>
          <span className="settings-value">
            {vinylMode ? 'Vinilo animado' : 'Cuadrada'}
          </span>
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">Cuenta</h2>
        {user && (
          <div className="settings-row settings-row--info">
            <div className="settings-row__info">
              <div className="user-avatar" style={{ width: 32, height: 32, fontSize: '.8rem' }}>
                {(user.Name || 'U')[0].toUpperCase()}
              </div>
              <span>{user.Name}</span>
            </div>
          </div>
        )}
        <button className="settings-row" onClick={() => { logout(); navigate('/'); }}>
          <div className="settings-row__info" style={{ color: 'var(--danger)' }}>
            <LogOut size={20} />
            <span>Cerrar sesión</span>
          </div>
        </button>
      </div>

      <div className="settings-footer">
        <p className="muted small">Aurita v0.1.0</p>
      </div>
    </div>
  );
}
