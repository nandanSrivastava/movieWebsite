'use client';

import React, { useState } from 'react';
import { MapPin } from 'lucide-react';

// Google's map adds about 430 KB of scripts, so it loads only for someone who wants it.
export default function MapEmbed({ location, title }: { location: string; title: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: '100%', height: '100%', minHeight: 300, border: 0, borderRadius: 0 }}
        onClick={() => setOpen(true)}
      >
        <MapPin aria-hidden />Show map
      </button>
    );
  }

  return (
    <iframe
      src={`https://maps.google.com/maps?q=${location}&hl=en&z=15&output=embed`}
      allowFullScreen={false}
      referrerPolicy="no-referrer-when-downgrade"
      title={title}
    />
  );
}
