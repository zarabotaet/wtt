'use client';
import { useEffect, useState } from 'react';

const ZOOM_KEY = 'wtt_card_min';
const DEFAULT_MIN = 280;

export function ZoomSlider() {
  const [value, setValue] = useState(DEFAULT_MIN);

  useEffect(() => {
    const saved = localStorage.getItem(ZOOM_KEY);
    if (saved) {
      setValue(Number(saved));
      document.documentElement.style.setProperty('--card-min', `${saved}px`);
    }
  }, []);

  function apply(v: number) {
    setValue(v);
    document.documentElement.style.setProperty('--card-min', `${v}px`);
  }

  return (
    <div className="zoom-ctrl">
      <label htmlFor="zoomSlider">Card size</label>
      <input
        id="zoomSlider"
        aria-label="Card size"
        type="range"
        min={220}
        max={440}
        step={10}
        value={value}
        onChange={(e) => apply(Number(e.target.value))}
        onMouseUp={(e) => localStorage.setItem(ZOOM_KEY, (e.target as HTMLInputElement).value)}
        onTouchEnd={(e) => localStorage.setItem(ZOOM_KEY, (e.target as HTMLInputElement).value)}
      />
    </div>
  );
}
