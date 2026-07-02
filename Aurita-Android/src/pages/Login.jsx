import { useState } from 'react';
import { useAuthStore } from '../store/authStore.js';
import logo from '../assets/logo.png';

export default function Login() {
  const { login, error } = useAuthStore();
  const [serverUrl, setServerUrl] = useState('');
  const [username,  setUsername]  = useState('');
  const [password,  setPassword]  = useState('');
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try { await login(serverUrl, username, password); }
    catch { /* error en el store */ }
    finally { setLoading(false); }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src={logo} alt="" className="login-icon" />
        <h1 className="login-logo">Aurita</h1>

        <form onSubmit={handleSubmit}>
          <label>
            URL del servidor Aurita
            <input type="text"
              placeholder="https://aurita.midominio.com"
              value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} required />
          </label>
          <label>
            Usuario
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            Contraseña
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
