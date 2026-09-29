"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Single shared <audio> element for every preview in the app (voice previews,
 * segment playback). Only one thing plays at a time.
 */
export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const onEnd = () => setPlayingId(null);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onEnd);
    return () => {
      audio.pause();
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onEnd);
      audioRef.current = null;
    };
  }, []);

  const play = useCallback((id: string, url: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === id) {
      audio.pause();
      audio.currentTime = 0;
      setPlayingId(null);
      return;
    }
    audio.src = url;
    audio.play().catch(() => setPlayingId(null));
    setPlayingId(id);
  }, [playingId]);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setPlayingId(null);
  }, []);

  return { playingId, play, stop };
}
