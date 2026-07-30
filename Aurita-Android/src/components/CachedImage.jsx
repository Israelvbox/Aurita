import { useState, useEffect, useRef } from 'react';
import { fetchCachedImage } from '../api/imageCache.js';

function isBlobUrl(u) { return u?.startsWith('blob:'); }

export default function CachedImage({ src, onError, className, style, ...props }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [fetchDone, setFetchDone] = useState(false);
  const prevSrc = useRef(null);
  const prevBlobUrl = useRef(null);

  useEffect(() => {
    if (prevBlobUrl.current && isBlobUrl(prevBlobUrl.current)) {
      URL.revokeObjectURL(prevBlobUrl.current);
    }
    setBlobUrl(null);
    setFetchDone(false);
    if (!src || src === prevSrc.current) return;
    prevSrc.current = src;
    let cancelled = false;
    fetchCachedImage(src).then((url) => {
      if (!cancelled) {
        prevBlobUrl.current = url;
        setBlobUrl(url);
        setFetchDone(true);
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

  if (blobUrl) {
    return <img src={blobUrl} className={className} style={style} onError={onError} {...props} />;
  }

  if (fetchDone) {
    return <div className={`cached-image-placeholder ${className || ''}`} style={style} {...props} />;
  }

  return null;
}
