import { useState, useEffect, useRef } from 'react';
import { fetchCachedImage } from '../api/imageCache.js';

function isBlobUrl(u) { return u?.startsWith('blob:'); }

export default function CachedImage({ src, ...props }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const prevSrc = useRef(null);
  const prevBlobUrl = useRef(null);

  useEffect(() => {
    if (prevBlobUrl.current && isBlobUrl(prevBlobUrl.current)) {
      URL.revokeObjectURL(prevBlobUrl.current);
    }
    setBlobUrl(null);
    if (!src) return;
    if (src === prevSrc.current) return;
    prevSrc.current = src;
    let cancelled = false;
    fetchCachedImage(src).then((url) => {
      if (!cancelled) {
        prevBlobUrl.current = url;
        setBlobUrl(url || src);
      }
    });
    return () => {
      cancelled = true;
      if (isBlobUrl(prevBlobUrl.current)) {
        URL.revokeObjectURL(prevBlobUrl.current);
        prevBlobUrl.current = null;
      }
    };
  }, [src]);

  if (!src) return null;

  return <img src={blobUrl || undefined} {...props} />;
}
