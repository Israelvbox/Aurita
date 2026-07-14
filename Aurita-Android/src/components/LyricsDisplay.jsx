import { useState, useEffect } from 'react';

function parseLRC(lrcText) {
  const lines = lrcText.split('\n');
  const result = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
  for (const line of lines) {
    const m = line.match(regex);
    if (m) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const ms = parseInt(m[3].padEnd(3, '0'), 10);
      const time = min * 60 + sec + ms / 1000;
      const text = m[4].trim();
      if (text) result.push({ time, text });
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

export default function LyricsDisplay({ trackId, trackName, artistName, currentTime }) {
  const [lyrics, setLyrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [noLyrics, setNoLyrics] = useState(false);

  useEffect(() => {
    if (!trackName || !artistName) return;
    let cancelled = false;

    async function fetchLyrics() {
      setLoading(true);
      setNoLyrics(false);
      setLyrics(null);
      try {
        const q = `${encodeURIComponent(artistName)} ${encodeURIComponent(trackName)}`;
        const searchRes = await fetch(`https://lrclib.net/api/search?q=${q}`, {
          headers: { 'User-Agent': 'Aurita/1.0' },
        });
        if (cancelled) return;
        if (!searchRes.ok) throw new Error();

        const results = await searchRes.json();
        if (!results?.length) {
          if (!cancelled) { setNoLyrics(true); setLoading(false); }
          return;
        }

        const best = results[0];
        const lrcRes = await fetch(`https://lrclib.net/api/get/${best.id}`, {
          headers: { 'User-Agent': 'Aurita/1.0' },
        });
        if (cancelled) return;
        if (!lrcRes.ok) throw new Error();

        const data = await lrcRes.json();
        const synced = data.syncedLyrics || data.plainLyrics || '';
        if (!synced) {
          if (!cancelled) { setNoLyrics(true); setLoading(false); }
          return;
        }

        const parsed = data.syncedLyrics ? parseLRC(data.syncedLyrics) : null;
        if (!cancelled) {
          setLyrics(parsed || [{ time: 0, text: data.plainLyrics }]);
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setNoLyrics(true); setLoading(false); }
      }
    }

    fetchLyrics();
    return () => { cancelled = true; };
  }, [trackId, trackName, artistName]);

  if (loading) {
    return (
      <div className="lyrics-peek">
        <div className="lyrics-peek__placeholder">Buscando letras…</div>
      </div>
    );
  }

  if (noLyrics || !lyrics || !Array.isArray(lyrics) || !lyrics.length) {
    return (
      <div className="lyrics-peek">
        <div className="lyrics-peek__placeholder">Letras no disponibles</div>
      </div>
    );
  }

  const isPlain = !lyrics[0]?.time;

  if (isPlain) {
    return (
      <div className="lyrics-peek">
        <div className="lyrics-peek__line lyrics-peek__line--active">{lyrics[0].text}</div>
      </div>
    );
  }

  let activeIndex = -1;
  for (let i = 0; i < lyrics.length; i++) {
    const next = lyrics[i + 1];
    if (currentTime >= lyrics[i].time && (!next || currentTime < next.time)) {
      activeIndex = i;
      break;
    }
  }

  let prevLine = '';
  let activeLine = '';
  let nextLine = '';
  let activeKey = 0;

  if (activeIndex >= 0) {
    prevLine = activeIndex > 0 ? lyrics[activeIndex - 1].text : '';
    activeLine = lyrics[activeIndex].text;
    nextLine = activeIndex < lyrics.length - 1 ? lyrics[activeIndex + 1].text : '';
    activeKey = activeIndex;
  } else {
    prevLine = '';
    activeLine = lyrics[0]?.text || '';
    nextLine = lyrics[1]?.text || '';
    activeKey = 0;
  }

  return (
    <div className="lyrics-peek">
      <div className="lyrics-peek__line lyrics-peek__line--dim" key={`prev-${activeKey}`}>
        {prevLine || '\u00A0'}
      </div>
      <div className="lyrics-peek__line lyrics-peek__line--active" key={`act-${activeKey}`}>
        {activeLine}
      </div>
      <div className="lyrics-peek__line lyrics-peek__line--dim" key={`next-${activeKey}`}>
        {nextLine || '\u00A0'}
      </div>
    </div>
  );
}
