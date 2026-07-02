import { X } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore.js';
import { jellyfin } from '../api/jellyfin.js';

export default function QueueSheet({ visible, onClose }) {
  const { queue, currentIndex, playFromQueueAt, removeFromQueue, autoFilling } = usePlayerStore();
  const upcoming = queue.slice(currentIndex + 1);

  return (
    <div className={`bottom-sheet ${visible ? 'bottom-sheet--visible' : ''}`} onClick={onClose}>
      <div className="bottom-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="bottom-sheet__bar" onClick={onClose} />
        <div className="bottom-sheet__header">
          <h3>Cola de reproducción</h3>
          <button className="sheet-close" onClick={onClose}><X size={20} /></button>
        </div>

        {currentIndex >= 0 && queue[currentIndex] && (
          <>
            <p className="sheet-label">Reproduciendo ahora</p>
            <div className="queue-item queue-item--current">
              <img src={jellyfin.imageUrl(queue[currentIndex].AlbumId || queue[currentIndex].Id, 'Primary', 48)} alt="" />
              <div>
                <div className="queue-item__name">{queue[currentIndex].Name}</div>
                <div className="queue-item__artist">{queue[currentIndex].AlbumArtist}</div>
              </div>
            </div>
          </>
        )}

        <p className="sheet-label">A continuación</p>
        {upcoming.length === 0 ? (
          <p className="muted sheet-empty">
            {autoFilling ? 'Buscando canciones similares…' : 'No hay más canciones en cola.'}
          </p>
        ) : (
          <div className="queue-list">
            {upcoming.map((item, i) => {
              const realIdx = currentIndex + 1 + i;
              return (
                <div key={`${item.Id}-${realIdx}`} className="queue-item">
                  <img src={jellyfin.imageUrl(item.AlbumId || item.Id, 'Primary', 48)} alt="" />
                  <button className="queue-item__main" onClick={() => { playFromQueueAt(realIdx); onClose(); }}>
                    <div className="queue-item__name">{item.Name}</div>
                    <div className="queue-item__artist">{item.AlbumArtist}</div>
                  </button>
                  <button className="sheet-close" onClick={() => removeFromQueue(realIdx)}>
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
