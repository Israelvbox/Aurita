import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { jellyfin } from '../api/jellyfin.js';
import { prefetchDetail } from '../api/detailCache.js';

const PAGE_SIZE = 5;

const MIX_COLORS = ['#5b2a86', '#3b1f6b', '#7c3aed', '#9333ea', '#6d28d9', '#4c1d95', '#8b5cf6', '#a855f7'];
function colorFor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return MIX_COLORS[h % MIX_COLORS.length];
}

export default function Row({ title, items, loading, onItemClick, kind = 'album' }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const visible = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    for (const item of visible) {
      const src = kind === 'mix'
        ? jellyfin.imageUrl(item._mixItems?.[0]?.AlbumId || item._mixItems?.[0]?.Id, 'Primary', 220)
        : jellyfin.imageUrl(item.Id, 'Primary', 220);
      fetch(src, { priority: 'low', signal: AbortSignal.timeout(5000) }).catch(() => {});
    }
  }, [visible]);

  return (
    <section className="row">
      <div className="row__header">
        <h2>{title}</h2>
        {!loading && totalPages > 1 && (
          <div className="row__pager">
            <button
              className="icon-btn"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              title="Anteriores"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-btn"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              title="Siguientes"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="row__grid">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="card card--skeleton" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="row__empty">Sin contenido todavía.</p>
      ) : (
        <div className="row__grid">
          {visible.map((item) => {
            const mixCover = kind === 'mix' ? item._mixItems?.[0] : null;
            const imgSrc = kind === 'mix'
              ? jellyfin.imageUrl(mixCover?.AlbumId || mixCover?.Id, 'Primary', 220)
              : jellyfin.imageUrl(item.Id, 'Primary', 220);
            return (
              <button
                key={item.Id}
                className="card"
                onClick={() => onItemClick?.(item)}
                onMouseEnter={() => kind === 'album' && prefetchDetail(item.Id)}
                title={item.Name}
              >
                <img
                  src={imgSrc}
                  alt={item.Name}
                  loading="lazy"
                  style={kind === 'mix' ? { backgroundColor: colorFor(item.Name) } : undefined}
                  onError={(e) => {
                    if (kind === 'mix') e.currentTarget.style.opacity = '0';
                    else e.currentTarget.style.visibility = 'hidden';
                  }}
                />
                <div className="card__title">{item.Name}</div>
                {kind === 'album' && (
                  <div className="card__subtitle">
                    {item.AlbumArtist || (item.Artists || []).join(', ')}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
