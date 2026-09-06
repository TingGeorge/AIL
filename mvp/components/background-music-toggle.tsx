'use client';

import { Volume2, VolumeX } from 'lucide-react';

export function BackgroundMusicToggle({
  enabled,
  onToggle,
  className = '',
}: {
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const label = enabled ? '關閉背景音樂' : '開啟背景音樂';
  return (
    <button
      type="button"
      className={`icon-button music-toggle-button ${enabled ? 'active' : ''} ${className}`.trim()}
      onClick={onToggle}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      data-music-toggle
    >
      {enabled ? (
        <Volume2 aria-hidden="true" />
      ) : (
        <VolumeX aria-hidden="true" />
      )}
      <span className="sr-only">{label}</span>
    </button>
  );
}
