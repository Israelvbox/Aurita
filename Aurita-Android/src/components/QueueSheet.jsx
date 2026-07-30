import { X, GripVertical, Trash2 } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore.js';
import { jellyfin } from '../api/jellyfin.js';
import { useToastStore } from '../store/toastStore.js';
import { formatDuration, formatTotalDuration } from '../utils.js';

function totalDuration(queue, startIdx) {
  let total = 0;
  for (let i = startIdx; i < queue.length; i++) {
    const ticks = queue[i]?.RunTimeTicks;
    if (ticks) total += ticks / 10_000_000;
  }
  return total;
}

export default function QueueSheet({ visible, onClose }) {
  const { queue, currentIndex, playFromQueueAt, removeFromQueue, moveInQueue, clearQueue } = usePlayerStore();
  const toast = useToastStore((s) => s.show);
  const upcoming = queue.slice(currentIndex + 1);
  const elapsed = currentIndex >= 0 ? queue.slice(0, currentIndex + 1) : [];

  function handleClear() {
    clearQueue();
    toast('Cola limpiada', 'info');
  }

  function handleDragStart(e, idx) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e, toIdx) {
    e.preventDefault();
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(fromIdx) && fromIdx !== toIdx) {
      moveInQueue(fromIdx, toIdx);
    }
  }

  return (
    <div className={`bottom-sheet ${visible ? 'bottom-sheet--visible' : ''}`} onClick={onClose}>
      <div className="bottom-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="bottom-sheet__bar" onClick={onClose} />
        <div className="bottom-sheet__header">
          <h3>Cola de reproducción</h3>
          <div className="sheet-header-actions">
            <span className="sheet-duration">{formatTotalDuration(totalDuration(queue, currentIndex + 1))}</span>
            {queue.length > 0 && (
              <button className="sheet-btn sheet-btn--danger" onClick={handleClear} title="Limpiar cola">
                <Trash2 size={16} />
              </button>
            )}
            <button className="sheet-close" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        {currentIndex >= 0 && queue[currentIndex] && (
          <>
            <p className="sheet-label">Reproduciendo ahora</p>
            <div className="queue-item queue-item--current">
              <div className="queue-item__drag" />
              <img src={jellyfin.imageUrl(queue[currentIndex].AlbumId || queue[currentIndex].Id, 'Primary', 48)} alt="" />
              <div>
                <div className="queue-item__name">{queue[currentIndex].Name}</div>
                <div className="queue-item__artist">{queue[currentIndex].AlbumArtist}</div>
              </div>
              {queue[currentIndex].RunTimeTicks && (
                <span className="queue-item__time">{formatDuration(queue[currentIndex].RunTimeTicks / 10_000_000)}</span>
              )}
            </div>
          </>
        )}

        <p className="sheet-label">A continuación</p>
        {upcoming.length === 0 ? (
          <p className="muted sheet-empty">
            No hay más canciones en cola.
          </p>
        ) : (
          <div className="queue-list">
            {upcoming.map((item, i) => {
              const realIdx = currentIndex + 1 + i;
              return (
                <div
                  key={`${item.Id}-${realIdx}`}
                  className="queue-item"
                  draggable
                  onDragStart={(e) => handleDragStart(e, realIdx)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, realIdx)}
                >
                  <div className="queue-item__drag">
                    <GripVertical size={14} />
                  </div>
                  <img src={jellyfin.imageUrl(item.AlbumId || item.Id, 'Primary', 48)} alt="" />
                  <button className="queue-item__main" onClick={() => { playFromQueueAt(realIdx); onClose(); }}>
                    <div className="queue-item__name">{item.Name}</div>
                    <div className="queue-item__artist">{item.AlbumArtist}</div>
                  </button>
                  {item.RunTimeTicks && (
                    <span className="queue-item__time">{formatDuration(item.RunTimeTicks / 10_000_000)}</span>
                  )}
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
