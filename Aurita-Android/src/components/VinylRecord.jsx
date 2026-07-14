import { useRef, useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore.js';

export default function VinylRecord({ albumArt, alt, className }) {
  const discRef = useRef(null);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  useEffect(() => {
    const el = discRef.current;
    if (!el) return;
    el.style.animationPlayState = isPlaying ? 'running' : 'paused';
  }, [isPlaying]);

  return (
    <div className={`vinyl ${className || ''}`}>
      <div className={`vinyl__tonearm ${isPlaying ? 'vinyl__tonearm--down' : 'vinyl__tonearm--up'}`}>
        <svg viewBox="0 0 130 150" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="108" cy="18" r="12" fill="#555" />
          <circle cx="108" cy="18" r="6" fill="#333" />
          <circle cx="108" cy="18" r="2" fill="#888" />
          <path d="M108 18 C108 18, 90 25, 72 48 L58 70 C52 80, 46 90, 42 100"
            stroke="#aaa" strokeWidth="4" strokeLinecap="round" fill="none" />
          <rect x="38" y="96" width="10" height="24" rx="3" fill="#777" />
          <path d="M43 120 L43 130" stroke="#999" strokeWidth="2" strokeLinecap="round" />
          <circle cx="43" cy="131" r="2.5" fill="#aaa" />
          <circle cx="125" cy="30" r="5" fill="#666" />
        </svg>
      </div>
      <div className="vinyl__disc" ref={discRef}>
        <div className="vinyl__art">
          {albumArt ? (
            <img src={albumArt} alt={alt || ''} className="vinyl__art-img" />
          ) : (
            <div className="vinyl__art-placeholder" />
          )}
        </div>
        <div className="vinyl__grooves" />
        <div className="vinyl__label" />
      </div>
    </div>
  );
}
