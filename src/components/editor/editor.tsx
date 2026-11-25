"use client";

/* eslint-disable react-hooks/set-state-in-effect -- loading from IndexedDB and media analysis */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, FileDown, Keyboard, LoaderCircle, Pause, Play, Redo2, Undo2, Upload } from "lucide-react";
import { exportProjectFile } from "@/lib/import";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { computeWaveform, generateFilmstrip, type FilmFrame, type Waveform } from "@/engines/editor/analysis";
import type { PreviewPlayer, PlayerSnapshot } from "@/engines/editor/player";
import { buildCursorPath, pressedRanges, type CursorBundle } from "@/engines/cursor/path";
import { withAutoSegments } from "@/engines/zoom/detect";
import { markerSegments } from "@/engines/zoom/markers";
import { setAnnotationFont } from "@/engines/annotations/render";
import { KIND_LABEL, createAnnotation, type Annotation, type AnnotationKind } from "@/engines/annotations/types";
import type { WebcamStyle } from "@/engines/editor/webcam";
import { DEFAULT_ZOOM, type ZoomSegment, type ZoomSettings } from "@/engines/zoom/types";
import { packEvents, unpackEvents, type CursorEvent, type TelemetrySource } from "@/engines/cursor/types";
import { analyzeRecording } from "@/engines/zoom/sampler";
import { BG_IMAGE, createProject, normalizeProject, type EditProject, type NormRect } from "@/engines/editor/project";
import { locate, removeClip, sourceToOutput, splitAt, totalDuration, trimClip } from "@/engines/editor/timeline";
import { createId, formatDuration } from "@/engines/shared/format";
import type { RecordingMeta } from "@/engines/shared/types";
import { getCursorTrack, getMedia, getProject, getRecording, saveCursorTrack, saveMedia, saveProject } from "@/engines/storage/db";
import { Logo } from "../app-shell";
import { Button, Notice, cx } from "../ui";
import { ExportDialog } from "./export-dialog";
import { PropertiesPanel, ToolList, type Tool } from "./panels";
import { Preview } from "./preview";
import { Timeline } from "./timeline";
import { useHistory } from "./use-history";

interface Loaded {
  meta: RecordingMeta;
  screen: Blob;
  camera: Blob | null;
  project: EditProject;
  /** Stored telemetry: precise (extension) or estimated from on-screen activity (video). */
  cursorEvents: CursorEvent[];
  telemetrySource: TelemetrySource | null;
}

export function Editor() {
  const id = useSearchParams().get("id");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("No recording selected.");
      return;
    }
    let cancelled = false;
    (async () => {
      const meta = await getRecording(id);
      if (!meta) throw new Error("Recording not found. It may have been deleted.");
      const [screen, camera, saved, cursorTrack] = await Promise.all([
        getMedia(id, "screen"),
        meta.camera ? getMedia(id, "camera") : Promise.resolve(null),
        getProject(id),
        getCursorTrack(id).catch(() => null),
      ]);
      if (!screen) throw new Error("This recording's video data is missing.");
      if (!cancelled)
        setLoaded({
          meta,
          screen,
          camera,
          project: saved ? normalizeProject(saved) : initialProject(meta, cursorTrack ? unpackEvents(cursorTrack.events) : []),
          cursorEvents: cursorTrack ? unpackEvents(cursorTrack.events) : [],
          telemetrySource: cursorTrack?.source ?? null,
        });
    })().catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't open the editor."));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-10">
        <Notice tone="error" title="Can't open the editor">
          {error}
        </Notice>
        <Link href="/recordings" className="text-sm font-semibold text-primary-strong hover:underline">
          ← All recordings
        </Link>
      </div>
    );
  }
  if (!loaded) return <div className="p-10 text-sm text-muted">Opening editor…</div>;
  return <Workspace {...loaded} />;
}

const IDLE: PlayerSnapshot = { timeMs: 0, playing: false, durationMs: 0 };
const noopSubscribe = () => () => undefined;

function Workspace({ meta, screen, camera, project: initial, cursorEvents: storedEvents, telemetrySource }: Loaded) {
  const history = useHistory<EditProject>(initial);
  const project = history.value;
  const smoothing = project.cursor.smoothing;
  const followSmoothing = project.zoom.followSmoothing;

  // Events that drive zoom: precise cursor data, or activity estimated from the video.
  const [zoomEvents, setZoomEvents] = useState<CursorEvent[]>(storedEvents);
  const [zoomSource, setZoomSource] = useState<TelemetrySource | null>(telemetrySource);
  const [analysis, setAnalysis] = useState<{ progress: number; error?: string } | null>(null);
  /** Only precise data draws a cursor; estimated activity is not where the pointer was. */
  const cursorEvents = useMemo(() => (zoomSource === "video" ? [] : zoomEvents), [zoomEvents, zoomSource]);

  const cursor = useMemo<CursorBundle | null>(() => {
    const path = cursorEvents.length ? buildCursorPath(cursorEvents, smoothing) : null;
    // The zoom camera follows a much calmer version of the path.
    const follow = buildCursorPath(zoomEvents, 0.75 + 0.24 * followSmoothing);
    return follow ? { path, pressed: pressedRanges(cursorEvents), follow } : null;
  }, [cursorEvents, zoomEvents, smoothing, followSmoothing]);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const clickTimes = useMemo(
    () => cursorEvents.filter((e) => e.kind === 1).map((e) => sourceToOutput(project.clips, e.t)).filter((t): t is number => t !== null),
    [cursorEvents, project.clips],
  );

  // Uploaded background image: stored with the recording, decoded once for drawing.
  const [bgImage, setBgImage] = useState<{ url: string; bitmap: ImageBitmap } | null>(null);
  const showBackground = useCallback(async (blob: Blob) => {
    const bitmap = await createImageBitmap(blob);
    const url = URL.createObjectURL(blob);
    setBgImage((old) => {
      if (old) {
        URL.revokeObjectURL(old.url);
        old.bitmap.close();
      }
      return { url, bitmap };
    });
  }, []);
  useEffect(() => {
    let live = true;
    getMedia(meta.id, "background")
      .then((b) => (b && live ? showBackground(b) : undefined))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [meta.id, showBackground]);
  useEffect(
    () => () =>
      setBgImage((old) => {
        if (old) {
          URL.revokeObjectURL(old.url);
          old.bitmap.close();
        }
        return null;
      }),
    [],
  );
  const onBackgroundImage = useCallback(
    async (file: File) => {
      try {
        await showBackground(file);
        await saveMedia(meta.id, "background", file);
        history.set((p) => ({ ...p, background: BG_IMAGE }));
      } catch {
        /* not a decodable image: ignore */
      }
    },
    [meta.id, showBackground, history],
  );

  // No cursor data: estimate activity from the video once, then auto-zoom from it.
  useEffect(() => {
    if (telemetrySource) return;
    const ctrl = new AbortController();
    setAnalysis({ progress: 0 });
    analyzeRecording(screen, initial.sourceDurationMs, { signal: ctrl.signal, onProgress: (progress) => setAnalysis({ progress }) })
      .then(async (events) => {
        await saveCursorTrack({ recordingId: meta.id, source: "video", surface: "monitor", events: packEvents(events) }).catch(() => undefined);
        setZoomEvents(events);
        setZoomSource("video");
        setAnalysis(null);
        // Fill in automatic zooms (not an undo step: it's the starting point, not a user edit).
        if (events.length) {
          history.set((p) => (p.zoom.auto ? { ...p, zoom: withAutoSegments(p.zoom, events, p.sourceDurationMs) } : p), { transient: true });
        }
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setAnalysis({ progress: 0, error: e instanceof Error ? e.message : "Couldn't analyse the recording." });
      });
    return () => ctrl.abort();
    // Runs once per opened recording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tool, setTool] = useState<Tool>("trim");
  const [player, setPlayer] = useState<PreviewPlayer | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initial.clips[0]?.id ?? null);
  const [exporting, setExporting] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [packing, setPacking] = useState(false);
  /** Downloads the recording + edits as one .capturekit file (saves the latest edits first). */
  const saveProjectFile = async () => {
    setPacking(true);
    try {
      await saveProject(history.value);
      const { blob, filename } = await exportProjectFile(meta.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setSaveState("error");
    } finally {
      setPacking(false);
    }
  };

  const snap = useSyncExternalStore(
    player?.subscribe ?? noopSubscribe,
    player?.getSnapshot ?? (() => IDLE),
    () => IDLE,
  );

  // ---- media URLs
  const urls = useMemo(
    () => ({ screen: URL.createObjectURL(screen), camera: camera ? URL.createObjectURL(camera) : null }),
    [screen, camera],
  );
  useEffect(
    () => () => {
      URL.revokeObjectURL(urls.screen);
      if (urls.camera) URL.revokeObjectURL(urls.camera);
    },
    [urls],
  );

  // ---- filmstrip + waveform
  const [frames, setFrames] = useState<FilmFrame[]>([]);
  const [waveform, setWaveform] = useState<Waveform | null | "loading">("loading");
  const hasAudio = meta.audio.mic || meta.audio.system;
  const frameCount = 24;
  useEffect(() => {
    setFrames([]);
    return generateFilmstrip(screen, project.sourceDurationMs, (f) => setFrames((fs) => [...fs, f]), { count: frameCount });
    // Source never changes for a project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);
  useEffect(() => {
    if (!hasAudio) return;
    let cancelled = false;
    void computeWaveform(screen, project.sourceDurationMs).then((w) => !cancelled && setWaveform(w));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, hasAudio]);
  const frameSpacingMs = project.sourceDurationMs / Math.max(2, Math.min(frameCount, Math.ceil(project.sourceDurationMs / 500)));

  // ---- autosave
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(() => {
      saveProject(project)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 400);
    return () => clearTimeout(t);
  }, [project]);

  // ---- edits
  const update = useCallback((patch: Partial<EditProject>) => history.set((p) => ({ ...p, ...patch })), [history]);
  const gestureStart = useRef<EditProject | null>(null);
  const live = useCallback((patch: Partial<EditProject>) => history.set((p) => ({ ...p, ...patch }), { transient: true }), [history]);
  const liveStart = useCallback(() => {
    gestureStart.current ??= project;
  }, [project]);
  const liveEnd = useCallback(() => {
    if (gestureStart.current) history.commit(gestureStart.current);
    gestureStart.current = null;
  }, [history]);

  const split = useCallback(() => {
    const newId = createId();
    const next = splitAt(project.clips, snap.timeMs, newId);
    if (next.length === project.clips.length) return;
    update({ clips: next });
    setSelectedId(newId);
  }, [project.clips, snap.timeMs, update]);

  const del = useCallback(() => {
    if (!selectedId || project.clips.length <= 1) return;
    const idx = project.clips.findIndex((c) => c.id === selectedId);
    const next = removeClip(project.clips, selectedId);
    update({ clips: next });
    setSelectedId(next[Math.min(idx, next.length - 1)]?.id ?? null);
  }, [selectedId, project.clips, update]);

  const seek = useCallback((ms: number) => player?.seek(ms), [player]);

  const onTrim = useCallback(
    (clipId: string, edge: "start" | "end", sourceMs: number) => {
      live({ clips: trimClip(project.clips, clipId, edge, sourceMs, project.sourceDurationMs) });
    },
    [live, project.clips, project.sourceDurationMs],
  );

  const onCrop = useCallback((crop: NormRect, transient: boolean) => {
    history.set((p) => ({ ...p, crop }), { transient });
  }, [history]);
  const onCropCommit = useCallback(
    (before: NormRect) => {
      history.commit({ ...project, crop: before });
    },
    // Only the crop changed during the gesture, so "before" = current project with the old crop.
    [history, project],
  );

  // ---- smart zoom
  /** Changes zoom settings; auto zooms are regenerated when auto-zoom settings change. */
  const updateZoom = useCallback(
    (patch: Partial<ZoomSettings>, opts?: { transient?: boolean; regenerate?: boolean }) => {
      history.set(
        (p) => {
          let zoom = { ...p.zoom, ...patch };
          if (opts?.regenerate) zoom = withAutoSegments(zoom, zoomEvents, p.sourceDurationMs);
          return { ...p, zoom };
        },
        { transient: opts?.transient },
      );
    },
    [history, zoomEvents],
  );

  const addZoom = useCallback(() => {
    const at = locate(project.clips, snap.timeMs).sourceMs;
    const id = createId();
    const seg: ZoomSegment = {
      id,
      start: Math.round(at),
      end: Math.round(Math.min(project.sourceDurationMs, at + 2500)),
      level: project.zoom.level,
      // Follow the pointer only with precise cursor data; estimated activity is too jumpy for a hand-placed zoom.
      mode: cursorEvents.length ? "follow" : "fixed",
      x: 0.5,
      y: 0.5,
      auto: false,
    };
    updateZoom({ segments: [...project.zoom.segments, seg].sort((a, b) => a.start - b.start) });
    setSelectedZoomId(id);
    setTool("zoom");
  }, [project.clips, project.sourceDurationMs, project.zoom, snap.timeMs, cursorEvents.length, updateZoom]);

  /** Edits a segment. Editing an auto zoom makes it manual, so regenerating never overwrites it. */
  const editZoom = useCallback(
    (id: string, patch: Partial<ZoomSegment>, transient = false) => {
      history.set(
        (p) => ({
          ...p,
          zoom: {
            ...p.zoom,
            segments: p.zoom.segments.map((s) => (s.id === id ? { ...s, ...patch, auto: false } : s)).sort((a, b) => a.start - b.start),
          },
        }),
        { transient },
      );
    },
    [history],
  );

  const deleteZoom = useCallback(
    (id: string) => {
      const seg = project.zoom.segments.find((s) => s.id === id);
      if (!seg) return;
      updateZoom({
        segments: project.zoom.segments.filter((s) => s.id !== id),
        dismissed: seg.auto && seg.key ? [...project.zoom.dismissed, seg.key] : project.zoom.dismissed,
      });
      setSelectedZoomId(null);
    },
    [project.zoom, updateZoom],
  );

  // ---- webcam & annotations
  const updateWebcam = useCallback(
    (patch: Partial<WebcamStyle>, transient = false) => history.set((p) => ({ ...p, webcam: { ...p.webcam, ...patch } }), { transient }),
    [history],
  );

  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const addAnnotation = useCallback(
    (kind: AnnotationKind) => {
      const id = createId();
      const at = locate(project.clips, snap.timeMs).sourceMs;
      history.set((p) => {
        // Offset each new annotation a little so several added in a row don't pile up exactly.
        const a = createAnnotation(kind, id, at, p.sourceDurationMs);
        const step = (p.annotations.length % 5) * 0.04;
        return { ...p, annotations: [...p.annotations, { ...a, x: a.x + step, y: a.y + step }] };
      });
      setSelectedAnnotationId(id);
      setTool("annotate");
    },
    [history, project.clips, snap.timeMs],
  );
  const editAnnotation = useCallback(
    (id: string, patch: Partial<Annotation>, transient = false) =>
      history.set((p) => ({ ...p, annotations: p.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), { transient }),
    [history],
  );
  const deleteAnnotation = useCallback(
    (id: string) => {
      history.set((p) => ({ ...p, annotations: p.annotations.filter((a) => a.id !== id) }));
      setSelectedAnnotationId(null);
    },
    [history],
  );

  // Canvas text uses the page's loaded UI font (next/font gives it a generated name).
  useEffect(() => {
    setAnnotationFont(getComputedStyle(document.body).fontFamily);
  }, []);

  const selectedZoom = project.zoom.segments.find((s) => s.id === selectedZoomId) ?? null;
  const pickFocus = tool === "zoom" && selectedZoom?.mode === "fixed";

  // Keep selection valid after undo/redo.
  useEffect(() => {
    if (!project.clips.some((c) => c.id === selectedId)) setSelectedId(project.clips[0]?.id ?? null);
  }, [project.clips, selectedId]);

  // ---- keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (exporting || target.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        history.redo();
      } else if (e.key === "?") {
        setShowShortcuts(true);
      } else if (e.key === " " && !target.closest("button")) {
        e.preventDefault();
        player?.toggle();
      } else if (e.key.toLowerCase() === "z" && !mod) {
        addZoom();
      } else if (e.key.toLowerCase() === "s" && !mod) {
        split();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (tool === "zoom" && selectedZoomId) deleteZoom(selectedZoomId);
        else if (tool === "annotate" && selectedAnnotationId) deleteAnnotation(selectedAnnotationId);
        else del();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const step = e.shiftKey ? 1000 : 1000 / 30;
        player?.seek(snap.timeMs + (e.key === "ArrowLeft" ? -step : step), false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exporting, history, player, split, del, snap.timeMs, addZoom, deleteZoom, tool, selectedZoomId, selectedAnnotationId, deleteAnnotation]);

  const total = totalDuration(project.clips);
  const srcSize = player?.sourceSize ?? { w: meta.screen.width, h: meta.screen.height };
  const selectedLoc = useMemo(() => (project.clips.length ? locate(project.clips, snap.timeMs) : null), [project.clips, snap.timeMs]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-subtle">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-white px-3 sm:px-4">
        <Link href={`/recordings/view?id=${encodeURIComponent(meta.id)}`} aria-label="Back to recording" className="grid size-9 place-items-center rounded-chip text-muted hover:bg-subtle hover:text-ink">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="hidden sm:block">
          <Logo compact />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{meta.name}</p>
          <p className="text-[11px] text-muted" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save changes" : "All changes saved on this device"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" className="hidden size-9 place-items-center rounded-chip text-muted hover:bg-subtle sm:grid">
            <Keyboard className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => void saveProjectFile()}
            disabled={packing}
            aria-label="Save project file"
            title="Save project file (.capturekit): the recording and your edits in one file, to open in another browser"
            className="grid size-9 place-items-center rounded-chip text-muted hover:bg-subtle disabled:text-faint"
          >
            {packing ? <LoaderCircle className="size-4 animate-spin" /> : <FileDown className="size-4" />}
          </button>
          <button type="button" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)" className="grid size-9 place-items-center rounded-chip text-muted hover:bg-subtle disabled:text-faint disabled:hover:bg-transparent">
            <Undo2 className="size-4" />
          </button>
          <button type="button" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className="grid size-9 place-items-center rounded-chip text-muted hover:bg-subtle disabled:text-faint disabled:hover:bg-transparent">
            <Redo2 className="size-4" />
          </button>
          <Button
            size="sm"
            className="ml-2"
            disabled={!player}
            onClick={() => {
              player?.pause();
              setExporting(true);
            }}
          >
            <Upload className="size-4" /> Export
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <ToolList tool={tool} onTool={setTool} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Preview
            screenUrl={urls.screen}
            cameraUrl={urls.camera}
            project={project}
            mode={tool === "crop" ? "crop" : tool === "annotate" ? "annotate" : "edit"}
            onPlayer={setPlayer}
            onCrop={onCrop}
            onCropCommit={onCropCommit}
            cursor={cursor}
            backgroundImage={bgImage?.bitmap ?? null}
            onPick={pickFocus && selectedZoom ? (x: number, y: number) => editZoom(selectedZoom.id, { x, y }) : undefined}
            webcamEdit={tool === "webcam" && camera ? { onChange: (patch) => updateWebcam(patch, true), onStart: liveStart, onEnd: liveEnd } : null}
            annotationEdit={
              tool === "annotate"
                ? {
                    selectedId: selectedAnnotationId,
                    onSelect: setSelectedAnnotationId,
                    onChange: (a) => editAnnotation(a.id, a, true),
                    onStart: liveStart,
                    onEnd: liveEnd,
                  }
                : null
            }
          />
          <div className="flex shrink-0 items-center justify-center gap-3 pb-3">
            <button
              type="button"
              onClick={() => player?.toggle()}
              disabled={!player}
              aria-label={snap.playing ? "Pause" : "Play"}
              className="grid size-10 place-items-center rounded-full bg-primary text-white shadow-sm hover:bg-primary-hover disabled:opacity-50"
            >
              {snap.playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
            </button>
            <span className="text-sm text-muted tabular-nums">
              {formatDuration(snap.timeMs)} / {formatDuration(total)}
            </span>
            {tool === "crop" && <span className="text-xs text-muted">Showing the full recording while cropping</span>}
          </div>
        </main>
        <PropertiesPanel
          tool={tool}
          project={project}
          update={update}
          live={live}
          liveStart={liveStart}
          liveEnd={liveEnd}
          selectedId={selectedId}
          onSelect={(cid) => {
            setSelectedId(cid);
            const idx = project.clips.findIndex((c) => c.id === cid);
            if (idx >= 0 && selectedLoc?.index !== idx) {
              const start = project.clips.slice(0, idx).reduce((s, c) => s + c.end - c.start, 0);
              seek(start);
            }
          }}
          onSplit={split}
          onDelete={del}
          hasCamera={!!camera}
          hasAudio={hasAudio}
          cursorEvents={cursorEvents.length}
          zoomEvents={zoomEvents.length}
          backgroundImageUrl={bgImage?.url ?? null}
          onBackgroundImage={onBackgroundImage}
          zoomSource={zoomSource}
          analysis={analysis}
          updateZoom={updateZoom}
          updateWebcam={updateWebcam}
          addAnnotation={addAnnotation}
          editAnnotation={editAnnotation}
          deleteAnnotation={deleteAnnotation}
          selectedAnnotationId={selectedAnnotationId}
          onSelectAnnotation={setSelectedAnnotationId}
          addZoom={addZoom}
          editZoom={editZoom}
          deleteZoom={deleteZoom}
          selectedZoomId={selectedZoomId}
          onSelectZoom={(zid) => {
            setSelectedZoomId(zid);
            const s = project.zoom.segments.find((x) => x.id === zid);
            const out = s ? sourceToOutput(project.clips, s.start + project.zoom.transitionMs) : null;
            if (out !== null) seek(out);
          }}
        />
      </div>

      <div className={cx("shrink-0", cursorEvents.length && project.annotations.length ? "h-80" : cursorEvents.length || project.annotations.length ? "h-72" : "h-60")}>
        <Timeline
          clips={project.clips}
          timeMs={snap.timeMs}
          frames={frames}
          frameSpacingMs={frameSpacingMs}
          waveform={hasAudio ? waveform : null}
          hasAudio={hasAudio}
          hasCamera={!!camera}
          webcamVisible={project.webcam.visible}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSeek={seek}
          onTrim={onTrim}
          onTrimStart={liveStart}
          onTrimEnd={liveEnd}
          onSplit={split}
          onDelete={del}
          canDelete={project.clips.length > 1 && !!selectedId}
          clickTimes={cursorEvents.length ? clickTimes : null}
          zoom={{ segments: project.zoom.segments, transitionMs: project.zoom.transitionMs, sourceDurationMs: project.sourceDurationMs }}
          selectedZoomId={selectedZoomId}
          onSelectZoom={(zid) => {
            setSelectedZoomId(zid);
            setTool("zoom");
          }}
          onZoomEdit={(zid, patch) => editZoom(zid, patch, true)}
          onZoomEditStart={liveStart}
          onZoomEditEnd={liveEnd}
          annotations={project.annotations.map((a) => ({ id: a.id, start: a.start, end: a.end, kind: a.kind, label: a.kind === "text" ? a.text || "Text" : KIND_LABEL[a.kind] }))}
          selectedAnnotationId={selectedAnnotationId}
          onSelectAnnotation={(aid) => {
            setSelectedAnnotationId(aid);
            setTool("annotate");
          }}
          onAnnotationEdit={(aid, patch) => editAnnotation(aid, patch, true)}
        />
      </div>

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      {exporting && (
        <ExportDialog
          project={project}
          name={meta.name}
          screen={screen}
          camera={camera}
          hasAudio={hasAudio}
          srcW={srcSize.w || meta.screen.width}
          srcH={srcSize.h || meta.screen.height}
          cursor={cursor}
          backgroundImage={bgImage?.bitmap ?? null}
          onClose={() => setExporting(false)}
        />
      )}
    </div>
  );
}

/** New projects: automatic zoom is on when the recording has cursor data. */
function initialProject(meta: RecordingMeta, events: CursorEvent[]): EditProject {
  const p = createProject(meta);
  // Automatic zoom is on by default; segments appear once cursor data or screen activity is available.
  const base: ZoomSettings = { ...DEFAULT_ZOOM, auto: true, segments: markerSegments(meta.zoomMarkers ?? [], p.sourceDurationMs) };
  return { ...p, zoom: events.length ? withAutoSegments(base, events, p.sourceDurationMs) : base };
}
