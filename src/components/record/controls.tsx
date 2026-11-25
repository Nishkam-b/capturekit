"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, CameraOff, Mic, MicOff, Pause, Play, Square, Aperture, ZoomIn } from "lucide-react";
import type { RecordingSession, SessionState } from "@/engines/recorder";
import { formatDuration } from "@/engines/shared/format";
import { cx } from "../ui";

/**
 * Elapsed recording time, ticking on the given window's clock. Passing the
 * pop-out window keeps the timer smooth while the main tab is in the background.
 */
export function useElapsed(session: RecordingSession | null, win: Window | null): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!session || !win) return;
    const tick = () => setMs(session.elapsedMs());
    tick();
    const id = win.setInterval(tick, 250);
    return () => win.clearInterval(id);
  }, [session, win]);
  return ms;
}

export interface ControlsProps {
  state: SessionState;
  elapsedMs: number;
  hasMic: boolean;
  micMuted: boolean;
  hasCamera: boolean;
  screenshots: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onScreenshot: () => void;
  /** Marks "zoom here" at the current moment. */
  onZoomMarker: () => void;
  zoomMarkers: number;
  onToggleMic: () => void;
  compact?: boolean;
}

export function RecordingControls(p: ControlsProps) {
  const paused = p.state === "paused";
  const stopping = p.state === "stopping";
  const btn = cx(
    "grid place-items-center rounded-full transition-colors disabled:opacity-50",
    p.compact ? "size-10" : "size-12",
  );
  return (
    <div className={cx("flex items-center gap-2", p.compact ? "px-3" : "rounded-full border border-line bg-white px-3 py-2 shadow-float")}>
      <div className="flex min-w-[104px] items-center gap-2 px-2" aria-live="polite">
        <span className={cx("size-2.5 rounded-full", paused ? "bg-amber-500" : "bg-danger ck-pulse")} />
        <span className="text-sm font-semibold tabular-nums" data-testid="timer">
          {formatDuration(p.elapsedMs)}
        </span>
        <span className="sr-only">{paused ? "Paused" : "Recording"}</span>
      </div>

      <button
        type="button"
        className={cx(btn, "bg-subtle text-ink hover:bg-slate-200")}
        onClick={paused ? p.onResume : p.onPause}
        disabled={stopping}
        aria-label={paused ? "Resume recording" : "Pause recording"}
        title={paused ? "Resume (Alt+Shift+P)" : "Pause (Alt+Shift+P)"}
      >
        {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
      </button>

      <button
        type="button"
        className={cx(btn, "bg-danger text-white hover:bg-red-600")}
        onClick={p.onStop}
        disabled={stopping}
        aria-label="Stop recording"
        title="Stop and save (Alt+Shift+S)"
      >
        <Square className="size-4 fill-current" />
      </button>

      <span className="mx-1 h-6 w-px bg-line" />

      <button
        type="button"
        className={cx(btn, "relative text-muted hover:bg-subtle hover:text-ink")}
        onClick={p.onScreenshot}
        disabled={stopping}
        aria-label="Take screenshot"
        title="Take screenshot (Alt+Shift+C)"
      >
        <Aperture className="size-5" />
        {p.screenshots > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-white">
            {p.screenshots}
          </span>
        )}
      </button>

      <button
        type="button"
        className={cx(btn, "relative text-muted hover:bg-subtle hover:text-ink")}
        onClick={p.onZoomMarker}
        disabled={stopping || paused}
        aria-label="Zoom in here"
        title="Zoom in here: adds a zoom at this moment (Alt+Shift+Z)"
        data-testid="zoom-marker"
      >
        <ZoomIn className="size-5" />
        {p.zoomMarkers > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-white">
            {p.zoomMarkers}
          </span>
        )}
      </button>

      {p.hasMic && (
        <button
          type="button"
          className={cx(btn, p.micMuted ? "bg-danger-light text-red-700" : "text-muted hover:bg-subtle hover:text-ink")}
          onClick={p.onToggleMic}
          aria-pressed={p.micMuted}
          aria-label={p.micMuted ? "Unmute microphone" : "Mute microphone"}
          title={p.micMuted ? "Microphone muted" : "Microphone on"}
        >
          {p.micMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
        </button>
      )}

      <span
        className={cx(btn, "pointer-events-none", p.hasCamera ? "text-primary" : "text-faint")}
        title={p.hasCamera ? "Webcam is recording" : "Webcam off"}
        aria-label={p.hasCamera ? "Webcam is recording" : "Webcam off"}
      >
        {p.hasCamera ? <Camera className="size-5" /> : <CameraOff className="size-5" />}
      </span>
    </div>
  );
}

type DocumentPiP = { requestWindow(opts: { width: number; height: number }): Promise<Window> };

/** Opens a floating always-on-top window (Chrome/Edge 116+) with our styles copied in. */
export async function openPipWindow(): Promise<Window | null> {
  const dpip = (window as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture;
  if (!dpip) return null;
  const pip = await dpip.requestWindow({ width: 480, height: 72 });
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = pip.document.createElement("style");
      style.textContent = Array.from(sheet.cssRules, (r) => r.cssText).join("\n");
      pip.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = pip.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        pip.document.head.appendChild(link);
      }
    }
  }
  pip.document.title = "CaptureKit controls";
  pip.document.documentElement.className = document.documentElement.className;
  pip.document.body.className = "bg-white text-ink m-0 h-screen grid place-items-center overflow-hidden";
  return pip;
}

export function PipPortal({ win, children }: { win: Window; children: React.ReactNode }) {
  return createPortal(children, win.document.body);
}
