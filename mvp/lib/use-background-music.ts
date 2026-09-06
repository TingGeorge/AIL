'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const BACKGROUND_MUSIC_FILE = '/audio/all-in-life-light-theme.wav';
const preferenceKey = 'all-in-life:background-music-enabled';

export function useBackgroundMusic() {
  const [musicEnabled, setMusicEnabledState] = useState(false);
  const preferredEnabledRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playRequestRef = useRef(0);

  const rememberPreference = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(preferenceKey, String(next));
    } catch {}
  }, []);

  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio(BACKGROUND_MUSIC_FILE);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.14;
    audioRef.current = audio;
    return audio;
  }, []);

  const playMusic = useCallback(
    (clearPreferenceOnFailure: boolean) => {
      if (!preferredEnabledRef.current) return;

      const audio = ensureAudio();
      const request = ++playRequestRef.current;
      const fail = () => {
        if (request !== playRequestRef.current || audioRef.current !== audio)
          return;
        setMusicEnabledState(false);
        if (clearPreferenceOnFailure) {
          preferredEnabledRef.current = false;
          rememberPreference(false);
        }
      };

      try {
        // Keep play() inside the originating click gesture. Its promise only
        // confirms the state after the browser has accepted playback.
        const playback = audio.play();
        void Promise.resolve(playback).then(() => {
          if (
            request !== playRequestRef.current ||
            audioRef.current !== audio ||
            !preferredEnabledRef.current
          ) {
            fail();
            return;
          }
          setMusicEnabledState(true);
          rememberPreference(true);
        }, fail);
      } catch {
        fail();
      }
    },
    [ensureAudio, rememberPreference],
  );

  const setMusicEnabled = useCallback(
    (next: boolean) => {
      if (!next) {
        preferredEnabledRef.current = false;
        playRequestRef.current += 1;
        rememberPreference(false);
        audioRef.current?.pause();
        setMusicEnabledState(false);
        return;
      }

      preferredEnabledRef.current = true;
      playMusic(true);
    },
    [playMusic, rememberPreference],
  );

  useEffect(() => {
    const audio = ensureAudio();
    try {
      preferredEnabledRef.current =
        window.localStorage.getItem(preferenceKey) === 'true';
    } catch {
      preferredEnabledRef.current = false;
    }

    const onPlaying = () => {
      if (audioRef.current === audio && preferredEnabledRef.current) {
        setMusicEnabledState(true);
        rememberPreference(true);
      }
    };
    const onStopped = () => {
      if (audioRef.current === audio) setMusicEnabledState(false);
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        playRequestRef.current += 1;
        audio.pause();
        setMusicEnabledState(false);
      } else if (preferredEnabledRef.current) {
        playMusic(false);
      }
    };

    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onStopped);
    audio.addEventListener('ended', onStopped);
    audio.addEventListener('error', onStopped);
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!document.hidden) playMusic(false);

    return () => {
      playRequestRef.current += 1;
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onStopped);
      audio.removeEventListener('ended', onStopped);
      audio.removeEventListener('error', onStopped);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      audio.pause();
      audio.src = '';
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [ensureAudio, playMusic, rememberPreference]);

  return { musicEnabled, setMusicEnabled };
}
