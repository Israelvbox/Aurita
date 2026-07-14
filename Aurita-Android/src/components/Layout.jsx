import { useState } from 'react';
import BottomNav from './BottomNav.jsx';
import MiniPlayer from './MiniPlayer.jsx';
import FullPlayer from './FullPlayer.jsx';
import { useOfflineStore } from '../store/offlineStore.js';

export default function Layout({ children }) {
  const [showFull, setShowFull] = useState(false);
  const isOffline = useOfflineStore((s) => s.isOffline);

  return (
    <div className="app-shell">
      <main className="content">{children}</main>

      <div className="bottom-area">
        {isOffline && <div className="offline-banner">Sin conexión</div>}
        <MiniPlayer onExpand={() => setShowFull(true)} />
        <BottomNav />
      </div>

      <FullPlayer visible={showFull} onClose={() => setShowFull(false)} />
    </div>
  );
}
