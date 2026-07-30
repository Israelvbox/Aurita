import { Component } from 'react';
import { ArrowLeft } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.warn('[Aurita] Error capturado:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--accent)', margin: 0 }}>Algo salió mal</h2>
          <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>{this.state.error.message}</p>
          <button className="primary-btn" onClick={() => { this.setState({ error: null }); window.location.hash = '#/'; }}>
            <ArrowLeft size={16} style={{ marginRight: 6 }} />
            Volver al inicio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
