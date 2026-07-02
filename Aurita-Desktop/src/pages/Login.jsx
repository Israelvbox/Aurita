import { useState } from 'react';
import { useAuthStore } from '../store/authStore.js';
import logo from '../assets/logo.png';

export default function Login() {
  const { login, error } = useAuthStore();
  const [serverUrl, setServerUrl] = useState('');
  const [username,  setUsername]  = useState('');
  const [password,  setPassword]  = useState('');
  const [mode,      setMode]      = useState('direct');
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(serverUrl, username, password, mode);
    } catch {
      // el error queda en el store
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src={logo} alt="" className="login-icon" />
        <h1 className="login-logo">Aurita</h1>

        <div className="login-mode">
          <button
            type="button"
            className={`login-mode__btn ${mode === 'direct' ? 'login-mode__btn--active' : ''}`}
            onClick={() => setMode('direct')}
          >
            Jellyfin
          </button>
          <button
            type="button"
            className={`login-mode__btn ${mode === 'service' ? 'login-mode__btn--active' : ''}`}
            onClick={() => setMode('service')}
          >
            Aurita Server
          </button>
        </div>
        <p className="login-mode__hint">
          {mode === 'direct'
            ? 'Conexión directa a Jellyfin.'
            : 'Velocidad máxima con el servidor Aurita.'}
        </p>

        <form onSubmit={handleSubmit}>
          <label>
            URL del servidor
            <input
              type="text"
              placeholder={
                mode === 'direct'
                  ? 'https://jellyfin.midominio.com'
                  : 'https://aurita.midominio.com'
              }
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              required
            />
          </label>
          <label>
            Usuario
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Conectando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
