'use client';

import { Volume2, VolumeX } from 'lucide-react';

export function BackgroundMusicToggle({
  enabled,
  onToggle,
  disabled = false,
  className = '',
}: {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const title = enabled ? '關閉背景音樂' : '開啟背景音樂';
  return (
    <button
      type="button"
      className={`icon-button music-toggle-button ${enabled ? 'active' : ''} ${className}`.trim()}
      onClick={onToggle}
      disabled={disabled}
      aria-label="背景音樂"
      aria-pressed={enabled}
      title={title}
      data-music-toggle
    >
      {enabled ? (
        <Volume2 aria-hidden="true" />
      ) : (
        <VolumeX aria-hidden="true" />
      )}
    </button>
  );
}
