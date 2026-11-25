"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, LoaderCircle, X } from "lucide-react";
import {
  availableFormats,
  estimateBytes,
  exportVideo,
  type ExportFormat,
  type ExportProgress,
  type ExportResult,
} from "@/engines/editor/export";
import type { CursorBundle } from "@/engines/cursor/path";
import { outputSize, type BackgroundImage, type ResolutionPreset } from "@/engines/editor/layout";
import { GIF_FPS, estimateGifBytes, exportGif, gifSize, type GifSize } from "@/engines/editor/gif-export";
import type { EditProject } from "@/engines/editor/project";
import { totalDuration } from "@/engines/editor/timeline";
import { extensionForMime, formatBytes, formatDuration, toFileStem } from "@/engines/shared/format";
import { Button, Notice, cx } from "../ui";

interface Props {
  project: EditProject;
  name: string;
  screen: Blob;
  camera: Blob | null;
  hasAudio: boolean;
  srcW: number;
  srcH: number;
  cursor: CursorBundle | null;
  backgroundImage: BackgroundImage | null;
  overlayImages: ReadonlyMap<string, CanvasImageSource>;
  audioFiles: ReadonlyMap<string, Blob>;
  onClose: () => void;
}

type Phase = { kind: "setup" } | { kind: "running"; progress: ExportProgress; startedAt: number } | { kind: "done"; result: ExportResult; url: string } | { kind: "error"; message: string };

const STATUS_TEXT: Record<ExportProgress["status"], string> = {
  preparing: "Preparing…",
  rendering: "Rendering video…",
  "paused-hidden": "Paused — come back to this tab to continue",
  finalizing: "Finishing file…",
};

export function ExportDialog({ project, name, screen, camera, hasAudio, srcW, srcH, cursor, backgroundImage, overlayImages, audioFiles, onClose }: Props) {
  const formats = useMemo(() => availableFormats(), []);
  const [format, setFormat] = useState<ExportFormat | "gif">(formats[0] ?? "webm");
  const [gifSizePreset, setGifSizePreset] = useState<GifSize>("medium");
  const [gifFps, setGifFps] = useState<number>(15);
  const [gifLoop, setGifLoop] = useState(true);
  const isGif = format === "gif";
  const [resolution, setResolution] = useState<ResolutionPreset>("1080p");
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const abort = useRef<AbortController | null>(null);
  const [now, setNow] = useState(0);

  const durationMs = totalDuration(project.clips);
  const sizes = useMemo(
    () => ({
      original: outputSize(project, srcW, srcH, "original"),
      "1080p": outputSize(project, srcW, srcH, "1080p"),
      "720p": outputSize(project, srcW, srcH, "720p"),
    }),
    [project, srcW, srcH],
  );
  const audible = (hasAudio && !project.audio.muted && project.audio.volume > 0) || (project.audioTracks ?? []).some((t) => audioFiles.has(t.id));
  const gifDims = useMemo(
    () => ({ small: gifSize(project, srcW, srcH, "small"), medium: gifSize(project, srcW, srcH, "medium"), large: gifSize(project, srcW, srcH, "large") }),
    [project, srcW, srcH],
  );
  const dims = isGif ? gifDims[gifSizePreset] : sizes[resolution as keyof typeof sizes];
  const estimate = isGif ? estimateGifBytes(dims.w, dims.h, durationMs, gifFps) : estimateBytes(dims.w, dims.h, durationMs, audible);

  // Clean up on close.
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );
  const doneUrl = phase.kind === "done" ? phase.url : null;
  useEffect(() => () => void (doneUrl && URL.revokeObjectURL(doneUrl)), [doneUrl]);

  // Tick for elapsed/remaining while running.
  const running = phase.kind === "running";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(performance.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  // Warn before closing the tab mid-export.
  useEffect(() => {
    if (!running) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [running]);

  const start = async () => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    const startedAt = performance.now();
    setNow(startedAt);
    setPhase({ kind: "running", progress: { status: "preparing", fraction: 0 }, startedAt });
    try {
      const onProgress = (progress: ExportProgress) => setPhase((p) => (p.kind === "running" ? { ...p, progress } : p));
      const result =
        format === "gif"
          ? await exportGif({ project, screen, camera, cursor, backgroundImage, overlayImages, size: gifSizePreset, fps: gifFps, loop: gifLoop }, onProgress, ctrl.signal)
          : await exportVideo({ project, screen, camera, hasAudio, format, resolution, cursor, backgroundImage, overlayImages, audioFiles }, onProgress, ctrl.signal);
      setPhase({ kind: "done", result, url: URL.createObjectURL(result.blob) });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") setPhase({ kind: "setup" });
      else setPhase({ kind: "error", message: err instanceof Error ? err.message : "Export failed." });
    } finally {
      abort.current = null;
    }
  };

  const cancel = () => abort.current?.abort();
  const close = () => {
    if (running && !window.confirm("Cancel the export in progress?")) return;
    cancel();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal aria-labelledby="export-title">
      <div className="w-full max-w-md rounded-card bg-white p-5 shadow-float">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="export-title" className="text-lg font-semibold">
            Export
          </h2>
          <button type="button" onClick={close} aria-label="Close" className="grid size-8 place-items-center rounded-chip text-muted hover:bg-subtle">
            <X className="size-4" />
          </button>
        </div>

        {phase.kind === "setup" && (
          <div className="space-y-4">
            <Field label="Format">
              <Options
                label="Format"
                value={format}
                onPick={setFormat}
                options={[...formats.map((f) => [f, f === "mp4" ? "MP4" : "WebM"] as [ExportFormat, string]), ["gif", "GIF (no sound)"] as ["gif", string]]}
              />
              <p className="mt-1.5 text-xs text-muted">
                {format === "gif"
                  ? "Animated GIF for docs, READMEs and chats. Best for short clips; long ones get big."
                  : format === "mp4"
                    ? "MP4 plays almost everywhere, including phones and social apps."
                    : "WebM plays in Chrome, Edge, Firefox and VLC."}
                {!formats.includes("mp4") && " This browser can't encode MP4."}
              </p>
            </Field>
            {isGif ? (
              <>
                <Field label="Size">
                  <Options
                    label="GIF size"
                    value={gifSizePreset}
                    onPick={setGifSizePreset}
                    options={(["small", "medium", "large"] as const).map((k) => [k, `${k[0].toUpperCase()}${k.slice(1)} · ${gifDims[k].w}×${gifDims[k].h}`] as [GifSize, string])}
                  />
                </Field>
                <Field label="Frame rate">
                  <Options
                    label="GIF frame rate"
                    value={String(gifFps)}
                    onPick={(v) => setGifFps(Number(v))}
                    options={GIF_FPS.map((f) => [String(f), `${f} fps`] as [string, string])}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={gifLoop} onChange={(e) => setGifLoop(e.target.checked)} className="size-4 accent-primary" />
                  Loop forever
                </label>
              </>
            ) : (
              <Field label="Resolution">
                <Options
                  label="Resolution"
                  value={resolution}
                  onPick={setResolution}
                  options={[
                    ["1080p", `1080p · ${sizes["1080p"].w}×${sizes["1080p"].h}`],
                    ["720p", `720p · ${sizes["720p"].w}×${sizes["720p"].h}`],
                    ["original", `Original · ${sizes.original.w}×${sizes.original.h}`],
                  ]}
                />
              </Field>
            )}
            <div className="rounded-control bg-subtle px-3 py-2.5 text-xs text-muted">
              Length <b className="text-ink">{formatDuration(durationMs)}</b> · estimated size <b className="text-ink">~{formatBytes(estimate)}</b>
              <br />
              {isGif
                ? "GIFs are rendered frame by frame. Keep this tab open and visible."
                : "Exporting takes about as long as the video. Keep this tab open and visible — it pauses if you switch away."}
            </div>
            <Button className="w-full" onClick={() => void start()}>
              Export {format === "mp4" ? "MP4" : format === "gif" ? "GIF" : "WebM"}
            </Button>
          </div>
        )}

        {phase.kind === "running" && (
          <div className="space-y-3" aria-live="polite">
            <p className="flex items-center gap-2 text-sm font-medium">
              <LoaderCircle className="size-4 animate-spin text-primary" />
              {STATUS_TEXT[phase.progress.status]}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(phase.progress.fraction * 100)}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${phase.progress.fraction * 100}%` }} />
            </div>
            <p className="flex justify-between text-xs text-muted tabular-nums">
              <span data-testid="export-percent">{Math.round(phase.progress.fraction * 100)}%</span>
              <span>
                {formatDuration(now - phase.startedAt)} elapsed
                {phase.progress.fraction > 0.05 &&
                  ` · ~${formatDuration(((now - phase.startedAt) / phase.progress.fraction) * (1 - phase.progress.fraction))} left`}
              </span>
            </p>
            <Button variant="secondary" className="w-full" onClick={cancel}>
              Cancel export
            </Button>
          </div>
        )}

        {phase.kind === "done" && (
          <div className="space-y-3">
            {phase.result.mimeType === "image/gif" ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob URL
              <img src={phase.url} alt="Exported GIF" data-testid="export-result" className="max-h-64 w-full rounded-control bg-ink object-contain" />
            ) : (
              <video src={phase.url} controls playsInline data-testid="export-result" className="max-h-64 w-full rounded-control bg-ink object-contain" />
            )}
            <p className="text-xs text-muted">
              {phase.result.width}×{phase.result.height} · {formatDuration(phase.result.durationMs)} · {formatBytes(phase.result.blob.size)}
            </p>
            <a
              href={phase.url}
              download={`${toFileStem(name)}-edit.${extensionForMime(phase.result.mimeType)}`}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-control bg-primary text-sm font-semibold text-white hover:bg-primary-hover"
            >
              <Download className="size-4" /> Download {extensionForMime(phase.result.mimeType).toUpperCase()}
            </a>
            <Button variant="ghost" className="w-full" onClick={() => setPhase({ kind: "setup" })}>
              Export again with other settings
            </Button>
          </div>
        )}

        {phase.kind === "error" && (
          <div className="space-y-3">
            <Notice tone="error" title="Export failed">
              {phase.message}
            </Notice>
            <Button variant="secondary" className="w-full" onClick={() => setPhase({ kind: "setup" })}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted">{label}</p>
      {children}
    </div>
  );
}

function Options<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          onClick={() => onPick(v)}
          className={cx(
            "flex h-10 items-center rounded-control border px-3 text-left text-sm",
            v === value ? "border-primary bg-primary-surface font-semibold text-primary-strong" : "border-line hover:bg-subtle",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
