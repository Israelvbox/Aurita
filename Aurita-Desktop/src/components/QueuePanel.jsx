import { X, GripVertical } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore.js';
import { jellyfin } from '../api/jellyfin.js';

export default function QueuePanel({ onClose }) {
  const { queue, currentIndex, playFromQueueAt, removeFromQueue, moveInQueue, autoFilling } = usePlayerStore();
  const upcoming = queue.slice(currentIndex + 1);

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
    <div className="queue-panel">
      <div className="queue-panel__header">
        <h3>Cola</h3>
        <button className="icon-btn" onClick={onClose}><X size={16} /></button>
      </div>

      {currentIndex >= 0 && queue[currentIndex] && (
        <>
          <div className="queue-panel__label">Reproduciendo ahora</div>
          <div className="queue-item queue-item--current">
            <div className="queue-item__drag" />
            <img src={jellyfin.imageUrl(queue[currentIndex].AlbumId || queue[currentIndex].Id, 'Primary', 48)} alt="" />
            <div>
              <div className="queue-item__name">{queue[currentIndex].Name}</div>
              <div className="queue-item__artist">{queue[currentIndex].AlbumArtist}</div>
            </div>
          </div>
        </>
      )}

      <div className="queue-panel__label">A continuación</div>
      {upcoming.length === 0 ? (
        <p className="queue-panel__empty">
          {autoFilling ? 'Buscando canciones similares…' : 'No hay más canciones en cola.'}
        </p>
      ) : (
        <div className="queue-list">
          {upcoming.map((item, i) => {
            const realIndex = currentIndex + 1 + i;
            return (
              <div
                key={`${item.Id}-${realIndex}`}
                className="queue-item"
                draggable
                onDragStart={(e) => handleDragStart(e, realIndex)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, realIndex)}
              >
                <div className="queue-item__drag">
                  <GripVertical size={13} />
                </div>
                <img src={jellyfin.imageUrl(item.AlbumId || item.Id, 'Primary', 48)} alt="" />
                <button className="queue-item__main" onClick={() => playFromQueueAt(realIndex)}>
                  <div className="queue-item__name">{item.Name}</div>
                  <div className="queue-item__artist">{item.AlbumArtist}</div>
                </button>
                <button className="icon-btn" onClick={() => removeFromQueue(realIndex)} title="Quitar de la cola">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
