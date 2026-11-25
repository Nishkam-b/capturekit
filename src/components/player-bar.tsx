"use client";

import { useEffect, useState, type RefObject } from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { formatDuration } from "@/engines/shared/format";

/**
 * Playback controls rendered below the video, so overlays (webcam bubble)
 * never cover them.
 */
export function PlayerBar({
  videoRef,
  frameRef,
  fallbackDurationMs,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  frameRef: RefObject<HTMLElement | null>;
  fallbackDurationMs: number;
}) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(fallbackDurationMs / 1000);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setTime(v.currentTime);
    const onDur = () => Number.isFinite(v.duration) && v.duration > 0 && setDuration(v.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVol = () => setMuted(v.muted);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onPause);
    v.addEventListener("volumechange", onVol);
    onDur();
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
      v.removeEventListener("loadedmetadata", onDur);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onPause);
      v.removeEventListener("volumechange", onVol);
    };
  }, [videoRef]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };

  return (
    <div className="mt-3 flex items-center gap-3 rounded-control border border-line bg-white px-3 py-2">
      <button
        type="button"
        onClick={toggle}
        className="grid size-9 place-items-center rounded-full bg-primary text-white hover:bg-primary-hover"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
      </button>
      <span className="w-24 shrink-0 text-xs text-muted tabular-nums">
        {formatDuration(time * 1000)} / {formatDuration(duration * 1000)}
      </span>
      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={duration || 0}
        step={0.01}
        value={Math.min(time, duration || 0)}
        onChange={(e) => {
          const v = videoRef.current;
          if (v) v.currentTime = Number(e.target.value);
        }}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--color-primary)]"
      />
      <button
        type="button"
        onClick={() => {
          const v = videoRef.current;
          if (v) v.muted = !v.muted;
        }}
        className="grid size-9 place-items-center rounded-full text-muted hover:bg-subtle hover:text-ink"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>
      <button
        type="button"
        onClick={() => void frameRef.current?.requestFullscreen?.().catch(() => undefined)}
        className="grid size-9 place-items-center rounded-full text-muted hover:bg-subtle hover:text-ink"
        aria-label="Full screen"
      >
        <Maximize className="size-4" />
      </button>
    </div>
  );
}
