import { jellyfin } from '../api/jellyfin.js';
import { prefetchDetail } from '../api/detailCache.js';
import CachedImage from './CachedImage.jsx';

export default function Row({ title, items, loading, onItemClick, kind = 'album' }) {
  return (
    <section className="row">
      <h2 className="row__title">{title}</h2>
      {loading ? (
        <div className="row__scroll">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card card--skeleton" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="row__empty muted">Sin contenido todavía.</p>
      ) : (
        <div className="row__scroll">
          {items.map((item) => (
            <button
              key={item.Id}
              className="card"
              onClick={() => onItemClick?.(item)}
              onTouchStart={() => kind === 'album' && prefetchDetail(item.Id)}
            >
              <CachedImage src={kind === 'mix'
                  ? jellyfin.imageUrl(item._mixItems?.[0]?.AlbumId || item._mixItems?.[0]?.Id, 'Primary', 300)
                  : jellyfin.imageUrl(item.Id, 'Primary', 300)} alt={item.Name} loading="lazy"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
              <div className="card__title">{item.Name}</div>
              {kind === 'album' && (
                <div className="card__subtitle">
                  {item.AlbumArtist || (item.Artists || []).join(', ')}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
