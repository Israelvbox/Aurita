import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useAuthStore } from '../store/authStore.js';
import { useSettingsStore } from '../store/settingsStore.js';

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { showLyrics, toggleLyrics } = useSettingsStore();

  return (
    <div className="page">
      <div className="settings-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1>Ajustes</h1>
      </div>

      <div className="settings-section">
        <p className="settings-section-title">Reproducción</p>
        <label className="settings-row">
          <span className="settings-row__info">Mostrar letras</span>
          <input type="checkbox" className="settings-toggle" checked={showLyrics} onChange={toggleLyrics} />
        </label>
      </div>

      <div className="settings-section">
        <p className="settings-section-title">Cuenta</p>
        <div className="settings-row">
          <span className="settings-row__info">
            {user?.Name || 'Usuario'}
          </span>
        </div>
        <button className="settings-row" onClick={logout} style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', color: 'var(--danger)', fontSize: '.9rem' }}>
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>

      <div className="settings-footer">
        Aurita v0.1.0
      </div>
    </div>
  );
}
