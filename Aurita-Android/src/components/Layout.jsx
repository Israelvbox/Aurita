import { useState } from 'react';
import BottomNav from './BottomNav.jsx';
import MiniPlayer from './MiniPlayer.jsx';
import FullPlayer from './FullPlayer.jsx';

export default function Layout({ children }) {
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="app-shell">
      <main className="content">{children}</main>

      <div className="bottom-area">
        <MiniPlayer onExpand={() => setShowFull(true)} />
        <BottomNav />
      </div>

      <FullPlayer visible={showFull} onClose={() => setShowFull(false)} />
    </div>
  );
}
