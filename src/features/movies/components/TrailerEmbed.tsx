'use client';

import React, { useState } from 'react';

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
    if (/(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname)) {
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
      return u.searchParams.get('v');
    }
  } catch {}
  return null;
}

/**
 * Click-to-play trailer. YouTube's player is ~900 KB of script and sets
 * third-party cookies, so it only loads once someone actually presses play.
 */
export default function TrailerEmbed({ url, title }: { url: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const id = youtubeId(url);
  const frameStyle: React.CSSProperties = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 };

  if (!id || playing) {
    const src = id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0` : url;
    return (
      <iframe
        src={src}
        title={`${title} Trailer`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        style={frameStyle}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play ${title} trailer`}
      style={{ ...frameStyle, padding: 0, cursor: 'pointer', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <img
        src={`https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        decoding="async"
        // Removed or private videos have no thumbnail: show just the play button
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
        style={{ ...frameStyle, objectFit: 'cover', opacity: 0.85 }}
      />
      <span aria-hidden="true" style={{
        position: 'relative', width: '72px', height: '72px', borderRadius: '50%',
        backgroundColor: 'var(--accent)', color: 'var(--on-accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 3 }}><path d="M8 5.5v13l11-6.5z" /></svg>
      </span>
    </button>
  );
}
