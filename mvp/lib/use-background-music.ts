'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const BACKGROUND_MUSIC_FILE = '/audio/all-in-life-light-theme.wav';
const preferenceKey = 'all-in-life:background-music-enabled';

export function useBackgroundMusic() {
  const [musicEnabled, setMusicEnabledState] = useState(true);
  const enabledRef = useRef(true);
  const unlockedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !enabledRef.current || document.hidden) return;
    void audio.play().catch(() => {});
  }, []);

  const setMusicEnabled = useCallback(
    (next: boolean) => {
      enabledRef.current = next;
      setMusicEnabledState(next);
      try {
        window.localStorage.setItem(preferenceKey, String(next));
      } catch {}
      if (!next) {
        audioRef.current?.pause();
        return;
      }
      unlockedRef.current = true;
      playMusic();
    },
    [playMusic],
  );

  useEffect(() => {
    let disposed = false;
    let initialEnabled = true;
    try {
      const stored = window.localStorage.getItem(preferenceKey);
      if (stored !== null) initialEnabled = stored === 'true';
    } catch {}
    enabledRef.current = initialEnabled;
    window.queueMicrotask(() => {
      if (!disposed) setMusicEnabledState(initialEnabled);
    });

    const audio = new Audio(BACKGROUND_MUSIC_FILE);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.14;
    audioRef.current = audio;

    const unlock = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-music-toggle]'))
        return;
      unlockedRef.current = true;
      playMusic();
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    const onVisibilityChange = () => {
      if (document.hidden) audio.pause();
      else if (unlockedRef.current) playMusic();
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', onVisibilityChange);
    playMusic();

    return () => {
      disposed = true;
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      audio.pause();
      audio.src = '';
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [playMusic]);

  return { musicEnabled, setMusicEnabled };
}
