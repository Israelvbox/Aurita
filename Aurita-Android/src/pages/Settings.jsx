import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, Disc3, DiscAlbum, LogOut, Wifi, Signal, Trash2, Download } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore.js';
import { useAuthStore } from '../store/authStore.js';
import { useNetworkStatsStore, formatBytes } from '../store/networkStatsStore.js';
import ConfirmModal from '../components/ConfirmModal.jsx';

const BITRATE_LABELS = {
  0: 'Original',
  320000: '320 kbps',
  192000: '192 kbps',
  128000: '128 kbps',
  96000: '96 kbps',
  64000: '64 kbps',
  48000: '48 kbps',
  32000: '32 kbps',
};

export default function Settings() {
  const navigate = useNavigate();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showBitratePicker, setShowBitratePicker] = useState(false);
  const [showDownloadBitratePicker, setShowDownloadBitratePicker] = useState(false);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const {
    vinylMode, audioBitrate, downloadBitrate,
    setVinylMode, setAudioBitrate, setDownloadBitrate,
  } = useSettingsStore();
  const daily = useNetworkStatsStore((s) => s.daily);
  const resetAll = useNetworkStatsStore((s) => s.resetAll);

  const today = new Date().toISOString().slice(0, 10);
  const todayStats = daily[today] || { wifi: 0, cellular: 0, unknown: 0 };
  const totalToday = todayStats.wifi + todayStats.cellular + todayStats.unknown;

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

        <div className="settings-row" onClick={() => setShowBitratePicker(true)}>
          <div className="settings-row__info">
            <DiscAlbum size={20} />
            <span>Calidad de streaming</span>
          </div>
          <span className="settings-value">{BITRATE_LABELS[audioBitrate] || 'Original'}</span>
        </div>

        <div className="settings-row" onClick={() => setShowDownloadBitratePicker(true)}>
          <div className="settings-row__info">
            <Download size={20} />
            <span>Calidad de descarga</span>
          </div>
          <span className="settings-value">{BITRATE_LABELS[downloadBitrate] || '64 kbps'}</span>
        </div>

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
        <h2 className="settings-section-title">Consumo de datos</h2>
        <div className="settings-row settings-row--info">
          <div className="settings-row__info">
            <Wifi size={20} />
            <span>WiFi hoy</span>
          </div>
          <span className="settings-value">{formatBytes(todayStats.wifi)}</span>
        </div>
        <div className="settings-row settings-row--info">
          <div className="settings-row__info">
            <Signal size={20} />
            <span>Datos móviles hoy</span>
          </div>
          <span className="settings-value">{formatBytes(todayStats.cellular)}</span>
        </div>
        <div className="settings-row settings-row--info">
          <div className="settings-row__info">
            <span style={{ fontWeight: 600 }}>Total hoy</span>
          </div>
          <span className="settings-value">{formatBytes(totalToday)}</span>
        </div>
        <button className="settings-row" onClick={() => setShowResetConfirm(true)}>
          <div className="settings-row__info" style={{ color: 'var(--danger)' }}>
            <Trash2 size={20} />
            <span>Restablecer estadísticas</span>
          </div>
        </button>
      </div>

      {showResetConfirm && (
        <ConfirmModal
          title="Restablecer estadísticas"
          message="¿Borrar todo el historial de consumo de datos?"
          confirmLabel="Borrar"
          cancelLabel="Cancelar"
          confirmDanger
          onConfirm={() => { resetAll(); setShowResetConfirm(false); }}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {showBitratePicker && (
        <div className="modal-overlay" onClick={() => setShowBitratePicker(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Calidad de streaming</h2>
            <p className="muted small" style={{ marginBottom: 12 }}>Más calidad = más datos móviles</p>
            <div className="bitrate-picker-list">
              {[0, 320000, 192000, 128000].map((v) => (
                <button
                  key={v}
                  className={`bitrate-picker-option ${audioBitrate === v ? 'bitrate-picker-option--active' : ''}`}
                  onClick={() => { setAudioBitrate(v); setShowBitratePicker(false); }}
                >
                  {BITRATE_LABELS[v]}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowBitratePicker(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {showDownloadBitratePicker && (
        <div className="modal-overlay" onClick={() => setShowDownloadBitratePicker(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Calidad de descarga</h2>
            <p className="muted small" style={{ marginBottom: 12 }}>Menos calidad = ocupan menos espacio</p>
            <div className="bitrate-picker-list">
              {[64000, 48000, 32000].map((v) => (
                <button
                  key={v}
                  className={`bitrate-picker-option ${downloadBitrate === v ? 'bitrate-picker-option--active' : ''}`}
                  onClick={() => { setDownloadBitrate(v); setShowDownloadBitratePicker(false); }}
                >
                  {BITRATE_LABELS[v]}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowDownloadBitratePicker(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

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
