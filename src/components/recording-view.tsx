"use client";

/* eslint-disable react-hooks/set-state-in-effect -- loading from IndexedDB */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, Download, Eye, EyeOff, Mic, Pencil, Scissors, Trash2, Volume2 } from "lucide-react";
import { extensionForMime, formatBytes, formatDuration, toFileStem } from "@/engines/shared/format";
import type { RecordingMeta, ScreenshotMeta, WebcamLayout } from "@/engines/shared/types";
import { deleteRecording, getRecording, updateRecordingMeta } from "@/engines/storage/db";
import { useMediaUrl } from "@/hooks/use-recordings";
import { createScreenshotFromBlob } from "@/lib/screenshots";
import { MediaFrame, WebcamBubble } from "./media-frame";
import { PlayerBar } from "./player-bar";
import { Badge, Button, Card, Notice, cx } from "./ui";

export function RecordingView() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const [meta, setMeta] = useState<RecordingMeta | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setMeta(null);
      return;
    }
    let cancelled = false;
    getRecording(id)
      .then((m) => !cancelled && setMeta(m))
      .catch((e: unknown) => !cancelled && (setError(e instanceof Error ? e.message : "Couldn't load."), setMeta(null)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (meta === undefined) return <div className="p-10 text-sm text-muted">Loading recording…</div>;
  if (!meta) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-10">
        <Notice tone="error" title="Recording not found">
          {error ?? "It may have been deleted, or it was recorded in a different browser."}
        </Notice>
        <Link href="/recordings" className="text-sm font-semibold text-primary-strong hover:underline">
          ← All recordings
        </Link>
      </div>
    );
  }

  return (
    <RecordingDetail
      meta={meta}
      onChange={setMeta}
      onDeleted={() => router.push("/recordings")}
    />
  );
}

function RecordingDetail({
  meta,
  onChange,
  onDeleted,
}: {
  meta: RecordingMeta;
  onChange: (m: RecordingMeta) => void;
  onDeleted: () => void;
}) {
  const screen = useMediaUrl(meta.id, "screen");
  const camera = useMediaUrl(meta.id, meta.camera ? "camera" : null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const camRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [showCam, setShowCam] = useState(true);
  const [aspect, setAspect] = useState(meta.screen.width && meta.screen.height ? meta.screen.width / meta.screen.height : 16 / 9);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Keep the webcam video in lock-step with the screen video.
  useEffect(() => {
    const s = screenRef.current;
    const c = camRef.current;
    if (!s || !c || !camera.url) return;
    c.src = camera.url;
    const sync = () => {
      if (Math.abs(c.currentTime - s.currentTime) > 0.15) c.currentTime = s.currentTime;
    };
    const onPlay = () => {
      sync();
      void c.play().catch(() => undefined);
    };
    const onPause = () => c.pause();
    const onRate = () => (c.playbackRate = s.playbackRate);
    s.addEventListener("play", onPlay);
    s.addEventListener("pause", onPause);
    s.addEventListener("seeked", sync);
    s.addEventListener("timeupdate", sync);
    s.addEventListener("ratechange", onRate);
    return () => {
      s.removeEventListener("play", onPlay);
      s.removeEventListener("pause", onPause);
      s.removeEventListener("seeked", sync);
      s.removeEventListener("timeupdate", sync);
      s.removeEventListener("ratechange", onRate);
    };
  }, [camera.url, screen.url]);

  const save = async (patch: Partial<RecordingMeta>) => {
    try {
      setSaveError(null);
      onChange(await updateRecordingMeta(meta.id, patch));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save the change.");
    }
  };

  const setLayout = (patch: Partial<WebcamLayout>) => {
    if (meta.camera) void save({ camera: { ...meta.camera, layout: { ...meta.camera.layout, ...patch } } });
  };

  const stem = toFileStem(meta.name);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <Link href="/recordings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All recordings
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <EditableName name={meta.name} onSave={(name) => void save({ name })} />
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{new Date(meta.createdAt).toLocaleString()}</span>
            {meta.screen.displaySurface && <span data-testid="surface">{SURFACE_LABEL[meta.screen.displaySurface] ?? meta.screen.displaySurface}</span>}
            <span>{formatDuration(meta.durationMs)}</span>
            <span>{formatBytes(meta.size)}</span>
            {meta.screen.width > 0 && (
              <span>
                {meta.screen.width}×{meta.screen.height}
              </span>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {meta.camera && (
              <Badge tone="green">
                <Camera className="size-3" /> Webcam
              </Badge>
            )}
            {meta.audio.mic && (
              <Badge tone="green">
                <Mic className="size-3" /> Microphone
              </Badge>
            )}
            {meta.audio.system && (
              <Badge tone="green">
                <Volume2 className="size-3" /> System audio
              </Badge>
            )}
            {!meta.audio.mic && !meta.audio.system && <Badge>No audio</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/editor?id=${encodeURIComponent(meta.id)}`}
            className="inline-flex h-11 items-center gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
          >
            <Scissors className="size-4" /> Edit &amp; export
          </Link>
          <Button
            variant="ghost"
            onClick={async () => {
              if (window.confirm(`Delete "${meta.name}"? This permanently removes it from this device.`)) {
                await deleteRecording(meta.id);
                onDeleted();
              }
            }}
            aria-label="Delete recording"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {meta.warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {meta.warnings.map((w) => (
            <Notice key={w} tone="warn">
              {w}
            </Notice>
          ))}
        </div>
      )}
      {saveError && (
        <div className="mt-4">
          <Notice tone="error">{saveError}</Notice>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          <div ref={frameRef} className="[&:fullscreen]:grid [&:fullscreen]:place-items-center [&:fullscreen]:bg-black">
          <MediaFrame aspect={aspect} maxHeight="64vh">
            {screen.url ? (
              <video
                ref={screenRef}
                src={screen.url}
                playsInline
                onClick={(e) => (e.currentTarget.paused ? void e.currentTarget.play() : e.currentTarget.pause())}
                className="size-full cursor-pointer object-contain"
                data-testid="preview-video"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
                }}
              />
            ) : (
              <div className="grid size-full place-items-center text-sm text-white/70">
                {screen.loading ? "Loading video…" : "Video data is missing."}
              </div>
            )}
            {meta.camera && camera.url && (
              <WebcamBubble
                layout={meta.camera.layout}
                videoRef={camRef}
                className={cx("pointer-events-none transition-opacity", !showCam && "opacity-0")}
              />
            )}
          </MediaFrame>
          </div>
          {screen.url && (
            <PlayerBar key={screen.url} videoRef={screenRef} frameRef={frameRef} fallbackDurationMs={meta.durationMs} />
          )}
          {meta.camera && (
            <p className="mt-2 text-xs text-muted">
              The webcam is a separate file here. Use <b>Edit &amp; export</b> to combine screen and webcam into one video.
            </p>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <p className="text-sm font-semibold">Download</p>
            <div className="mt-3 space-y-2">
              {screen.url && (
                <DownloadLink
                  href={screen.url}
                  file={`${stem}.${extensionForMime(meta.screen.mimeType)}`}
                  label="Screen recording"
                  detail={`${extensionForMime(meta.screen.mimeType).toUpperCase()} · ${formatBytes(meta.screen.size)}`}
                  primary
                />
              )}
              {meta.camera && camera.url && (
                <DownloadLink
                  href={camera.url}
                  file={`${stem}-webcam.${extensionForMime(meta.camera.mimeType)}`}
                  label="Webcam"
                  detail={`${extensionForMime(meta.camera.mimeType).toUpperCase()} · ${formatBytes(meta.camera.size)}`}
                />
              )}
            </div>
            {extensionForMime(meta.screen.mimeType) === "webm" && (
              <p className="mt-3 text-xs text-muted">
                WebM plays in Chrome, Edge, Firefox and VLC. MP4 export is planned once it&apos;s tested.
              </p>
            )}
          </Card>

          {meta.camera && (
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Webcam layout</p>
                <button
                  type="button"
                  onClick={() => setShowCam((v) => !v)}
                  className="text-muted hover:text-ink"
                  aria-label={showCam ? "Hide webcam in preview" : "Show webcam in preview"}
                >
                  {showCam ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </button>
              </div>
              <ChipRow
                label="Position"
                value={meta.camera.layout.position}
                options={[
                  ["top-left", "↖"],
                  ["top-right", "↗"],
                  ["bottom-left", "↙"],
                  ["bottom-right", "↘"],
                ]}
                onPick={(position) => setLayout({ position })}
              />
              <ChipRow
                label="Size"
                value={meta.camera.layout.size}
                options={[
                  ["small", "S"],
                  ["medium", "M"],
                  ["large", "L"],
                ]}
                onPick={(size) => setLayout({ size })}
              />
              <ChipRow
                label="Shape"
                value={meta.camera.layout.shape}
                options={[
                  ["circle", "Circle"],
                  ["rounded", "Rounded"],
                ]}
                onPick={(shape) => setLayout({ shape })}
              />
            </Card>
          )}

          {meta.screenshots.length > 0 && <Screenshots id={meta.id} shots={meta.screenshots} stem={stem} />}
        </aside>
      </div>
    </div>
  );
}

function ChipRow<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex rounded-chip bg-subtle p-0.5" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={v === value}
            aria-label={`${label}: ${v}`}
            onClick={() => onPick(v)}
            className={cx(
              "min-w-9 rounded-[6px] px-2 py-1 text-xs font-medium",
              v === value ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function DownloadLink({ href, file, label, detail, primary }: { href: string; file: string; label: string; detail: string; primary?: boolean }) {
  return (
    <a
      href={href}
      download={file}
      className={cx(
        "flex items-center gap-3 rounded-control border px-3 py-2.5 transition-colors",
        primary ? "border-primary bg-primary text-white hover:bg-primary-hover" : "border-line bg-white hover:bg-subtle",
      )}
    >
      <Download className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className={cx("block text-xs", primary ? "text-white/80" : "text-muted")}>{detail}</span>
      </span>
    </a>
  );
}

function EditableName({ name, onSave }: { name: string; onSave: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  if (!editing) {
    return (
      <button type="button" className="group flex items-center gap-2 text-left" onClick={() => (setValue(name), setEditing(true))}>
        <h1 className="truncate text-2xl font-bold tracking-tight">{name}</h1>
        <Pencil className="size-4 text-faint group-hover:text-ink" aria-label="Rename" />
      </button>
    );
  }
  const commit = () => {
    const v = value.trim();
    if (v && v !== name) onSave(v.slice(0, 120));
    setEditing(false);
  };
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input
        autoFocus
        aria-label="Recording name"
        value={value}
        maxLength={120}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        className="h-10 w-full max-w-md rounded-chip border border-line px-3 text-lg font-semibold"
      />
      <Button type="submit" size="sm" aria-label="Save name">
        <Check className="size-4" />
      </Button>
    </form>
  );
}

function Screenshots({ id, shots, stem }: { id: string; shots: ScreenshotMeta[]; stem: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold">Screenshots ({shots.length})</p>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {shots.map((s) => (
          <ScreenshotItem key={s.id} id={id} shot={s} stem={stem} />
        ))}
      </ul>
    </Card>
  );
}

function ScreenshotItem({ id, shot, stem }: { id: string; shot: ScreenshotMeta; stem: string }) {
  const { url, blob } = useMediaUrl(id, `shot/${shot.id}`);
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  if (!url) return <li className="aspect-video animate-pulse rounded-chip bg-subtle" />;
  return (
    <li>
      <a
        href={url}
        download={`${stem}-screenshot-${shot.id}.${extensionForMime(shot.mimeType)}`}
        className="group relative block overflow-hidden rounded-chip border border-line"
        title={`Download screenshot at ${formatDuration(shot.atMs)}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
        <img src={url} alt={`Screenshot at ${formatDuration(shot.atMs)}`} className="aspect-video w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center bg-ink/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Download className="size-4" />
        </span>
        <span className="absolute bottom-1 left-1 rounded bg-ink/70 px-1 text-[10px] text-white tabular-nums">
          {formatDuration(shot.atMs)}
        </span>
      </a>
      <button
        type="button"
        disabled={!blob || opening}
        onClick={async () => {
          if (!blob) return;
          setOpening(true);
          try {
            const sid = await createScreenshotFromBlob(blob, { kind: "recording", recordingId: id }, `${stem} screenshot ${shot.id}`);
            router.push(`/screenshots/edit?id=${encodeURIComponent(sid)}`);
          } catch {
            setOpening(false);
          }
        }}
        className="mt-1 w-full rounded-chip py-1 text-[11px] font-semibold text-primary-strong hover:bg-primary-surface disabled:text-faint"
        aria-label={`Edit screenshot ${shot.id}`}
      >
        {opening ? "Opening…" : "Edit"}
      </button>
    </li>
  );
}

const SURFACE_LABEL: Record<string, string> = {
  monitor: "Entire screen",
  window: "Window",
  browser: "Browser tab",
};
