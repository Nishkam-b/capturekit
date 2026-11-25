"use client";

/* eslint-disable react-hooks/set-state-in-effect -- loading from IndexedDB */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Crop, Download, Frame, PaintBucket, Redo2, Shapes, Undo2 } from "lucide-react";
import { setAnnotationFont } from "@/engines/annotations/render";
import { createAnnotation, type Annotation, type AnnotationKind } from "@/engines/annotations/types";
import { BACKGROUNDS, FULL_CROP, type NormRect } from "@/engines/editor/project";
import { renderScreenshot, screenshotLayout } from "@/engines/screenshot/layout";
import { STATIC_END, STATIC_START, type CanvasAspect, type FrameKind, type ScreenshotProject } from "@/engines/screenshot/project";
import { createId } from "@/engines/shared/format";
import { getMedia, getScreenshotProject, saveScreenshotProject } from "@/engines/storage/db";
import { Logo } from "../app-shell";
import { AnnotationOverlay, type OverlayHost } from "../editor/overlays";
import { AnnotationEditor, Chips, Section, Slider } from "../editor/panels";
import { CropOverlay } from "../editor/preview";
import { useHistory } from "../editor/use-history";
import { Button, Notice, Toggle, cx } from "../ui";
import { ScreenshotExportDialog } from "./export-dialog";

type Tool = "annotate" | "crop" | "style" | "frame";

export function ScreenshotEditor() {
  const id = useSearchParams().get("id");
  const [state, setState] = useState<{ project: ScreenshotProject; image: HTMLImageElement; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("No screenshot selected.");
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      const [project, blob] = await Promise.all([getScreenshotProject(id), getMedia(id, "image")]);
      if (!project || !blob) throw new Error("Screenshot not found. It may have been deleted.");
      url = URL.createObjectURL(blob);
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!cancelled) setState({ project, image, url });
    })().catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't open the screenshot."));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-10">
        <Notice tone="error" title="Can't open the screenshot">
          {error}
        </Notice>
        <Link href="/screenshots" className="text-sm font-semibold text-primary-strong hover:underline">
          ← All screenshots
        </Link>
      </div>
    );
  }
  if (!state) return <div className="p-10 text-sm text-muted">Opening screenshot…</div>;
  return <Workspace initial={state.project} image={state.image} />;
}

const TOOLS: { id: Tool; label: string; icon: typeof Crop }[] = [
  { id: "annotate", label: "Annotate", icon: Shapes },
  { id: "crop", label: "Crop", icon: Crop },
  { id: "style", label: "Background", icon: PaintBucket },
  { id: "frame", label: "Frame", icon: Frame },
];

const PREVIEW_MAX = 1600;
const noop = () => () => undefined;

function Workspace({ initial, image }: { initial: ScreenshotProject; image: HTMLImageElement }) {
  const history = useHistory<ScreenshotProject>(initial);
  const p = history.value;
  const [tool, setTool] = useState<Tool>("annotate");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState<{ w: number; h: number } | null>(null);

  // ---- layout at preview scale
  const natural = useMemo(() => screenshotLayout(p), [p]);
  const crop = tool === "crop";
  const L = useMemo(() => {
    const k = Math.min(1, PREVIEW_MAX / Math.max(natural.out.w, natural.out.h));
    return screenshotLayout(p, k);
  }, [p, natural]);
  const cropSize = useMemo(() => {
    const k = Math.min(1, PREVIEW_MAX / Math.max(p.imageW, p.imageH));
    return { w: Math.round(p.imageW * k), h: Math.round(p.imageH * k) };
  }, [p.imageW, p.imageH]);

  // ---- draw
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const size = crop ? cropSize : L.out;
    c.width = size.w;
    c.height = size.h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    renderScreenshot(ctx, image, p, crop ? { ...L, out: size } : L, crop ? "crop" : "full");
    setCanvasEl(c);
  }, [p, L, crop, cropSize, image]);

  useEffect(() => {
    setAnnotationFont(getComputedStyle(document.body).fontFamily);
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth - 48, h: el.clientHeight - 48 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- autosave
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(() => {
      saveScreenshotProject(p)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 400);
    return () => clearTimeout(t);
  }, [p]);

  // ---- edits
  const update = useCallback((patch: Partial<ScreenshotProject>, transient = false) => history.set((s) => ({ ...s, ...patch }), { transient }), [history]);
  const gesture = useRef<ScreenshotProject | null>(null);
  const liveStart = useCallback(() => {
    gesture.current ??= p;
  }, [p]);
  const liveEnd = useCallback(() => {
    if (gesture.current) history.commit(gesture.current);
    gesture.current = null;
  }, [history]);

  const addAnnotation = (kind: AnnotationKind) => {
    const id = createId();
    history.set((s) => {
      const a = createAnnotation(kind, id, 0, STATIC_END);
      const step = (s.annotations.length % 5) * 0.04;
      return { ...s, annotations: [...s.annotations, { ...a, start: STATIC_START, end: STATIC_END, x: a.x + step, y: a.y + step }] };
    });
    setSelectedId(id);
    setTool("annotate");
  };
  const editAnnotation = (id: string, patch: Partial<Annotation>, transient = false) =>
    history.set((s) => ({ ...s, annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), { transient });
  const deleteAnnotation = useCallback(
    (id: string) => {
      history.set((s) => ({ ...s, annotations: s.annotations.filter((a) => a.id !== id) }));
      setSelectedId(null);
    },
    [history],
  );

  // ---- keyboard
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
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        deleteAnnotation(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exporting, history, selectedId, deleteAnnotation]);

  // Overlay host for the annotation editor (a still image has no clock).
  const host: OverlayHost = useMemo(
    () => ({
      subscribe: noop,
      getSnapshot: () => 0,
      // `out` sets the size reference for text/line widths: the image area, as in the renderer.
      frame: { out: { w: L.content.w, h: L.content.h }, source: { w: p.imageW, h: p.imageH }, src: L.src, dst: L.content },
      sourceTimeMs: 1_000_000,
    }),
    [L, p.imageW, p.imageH],
  );

  const canvasStyle = avail ? { maxWidth: avail.w, maxHeight: avail.h } : { maxHeight: "60vh" };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-subtle">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-white px-3 sm:px-4">
        <Link href="/screenshots" aria-label="Back to screenshots" className="grid size-9 place-items-center rounded-chip text-muted hover:bg-subtle hover:text-ink">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="hidden sm:block">
          <Logo compact />
        </div>
        <div className="min-w-0">
          <input
            aria-label="Screenshot name"
            value={p.name}
            maxLength={120}
            onFocus={liveStart}
            onBlur={liveEnd}
            onChange={(e) => update({ name: e.target.value }, true)}
            className="w-56 truncate rounded px-1 text-sm font-semibold hover:bg-subtle focus:bg-subtle"
          />
          <p className="px-1 text-[11px] text-muted" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save changes" : "All changes saved on this device"} · {p.imageW}×
            {p.imageH}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo" className="grid size-9 place-items-center rounded-chip text-muted hover:bg-subtle disabled:text-faint">
            <Undo2 className="size-4" />
          </button>
          <button type="button" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo" className="grid size-9 place-items-center rounded-chip text-muted hover:bg-subtle disabled:text-faint">
            <Redo2 className="size-4" />
          </button>
          <Button size="sm" className="ml-2" onClick={() => setExporting(true)}>
            <Download className="size-4" /> Export
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav aria-label="Screenshot tools" className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-line bg-white p-2 md:w-44 md:flex-col md:border-r md:border-b-0">
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
              className={cx(
                "flex h-10 shrink-0 items-center gap-2.5 rounded-control px-3 text-sm font-medium whitespace-nowrap",
                tool === id ? "bg-primary-light text-primary-strong" : "text-muted hover:bg-subtle hover:text-ink",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </nav>

        <main ref={boxRef} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden p-6">
          <div
            className="relative leading-[0]"
            style={{
              background:
                p.background === "none" && !crop ? "repeating-conic-gradient(#e2e8f0 0 25%, #fff 0 50%) 0 0 / 16px 16px" : undefined,
            }}
          >
            <canvas ref={canvasRef} data-testid="shot-canvas" className="max-w-full shadow-card" style={canvasStyle} />
            {crop && <CropOverlay crop={p.crop} onCrop={(c: NormRect, transient: boolean) => update({ crop: c }, transient)} onCommit={(before: NormRect) => history.commit({ ...p, crop: before })} />}
            {tool === "annotate" && canvasEl && (
              <AnnotationOverlay
                player={host}
                canvas={canvasEl}
                annotations={p.annotations}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onChange={(a) => editAnnotation(a.id, a, true)}
                onStart={liveStart}
                onEnd={liveEnd}
              />
            )}
          </div>
        </main>

        <aside className="w-full shrink-0 overflow-y-auto border-l border-line bg-white p-4 md:w-72" aria-label="Properties">
          {tool === "annotate" && (
            <AnnotationEditor
              annotations={p.annotations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAdd={addAnnotation}
              onEdit={editAnnotation}
              onDelete={deleteAnnotation}
              liveStart={liveStart}
              liveEnd={liveEnd}
              timed={false}
            />
          )}
          {tool === "crop" && (
            <Section title="Crop" hint="Drag the box or its corners to keep only part of the image.">
              <p className="text-xs text-muted tabular-nums" data-testid="shot-crop">
                {Math.round(p.crop.w * p.imageW)}×{Math.round(p.crop.h * p.imageH)} px
              </p>
              {(p.crop.w < 1 || p.crop.h < 1) && (
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => update({ crop: { ...FULL_CROP } })}>
                  Reset crop
                </Button>
              )}
            </Section>
          )}
          {tool === "style" && <StylePanel p={p} update={update} liveStart={liveStart} liveEnd={liveEnd} />}
          {tool === "frame" && (
            <Section title="Frame" hint="Wrap the screenshot in a browser window, an app window or a phone/tablet device.">
              <Chips<FrameKind>
                label="Frame"
                value={p.frame}
                options={[
                  ["none", "None"],
                  ["browser", "Browser"],
                  ["browser-dark", "Browser (dark)"],
                  ["window", "Window"],
                  ["phone", "Device"],
                ]}
                onPick={(frame) => update({ frame })}
              />
            </Section>
          )}
        </aside>
      </div>

      {exporting && <ScreenshotExportDialog project={p} image={image} onClose={() => setExporting(false)} />}
    </div>
  );
}

function StylePanel({
  p,
  update,
  liveStart,
  liveEnd,
}: {
  p: ScreenshotProject;
  update: (patch: Partial<ScreenshotProject>, transient?: boolean) => void;
  liveStart: () => void;
  liveEnd: () => void;
}) {
  return (
    <>
      <Section title="Background">
        <div role="radiogroup" aria-label="Background" className="grid grid-cols-5 gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={p.background === "none"}
            aria-label="Background: Transparent"
            title="Transparent"
            onClick={() => update({ background: "none" })}
            className={cx("aspect-square rounded-chip border-2", p.background === "none" ? "border-primary ring-2 ring-primary/30" : "border-line")}
            style={{ background: "repeating-conic-gradient(#e2e8f0 0 25%, #fff 0 50%) 0 0 / 8px 8px" }}
          />
          {BACKGROUNDS.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={p.background === b.id}
              aria-label={`Background: ${b.label}`}
              title={b.label}
              onClick={() => update({ background: b.id })}
              className={cx("aspect-square rounded-chip border-2", p.background === b.id ? "border-primary ring-2 ring-primary/30" : "border-line")}
              style={{ background: b.stops.length === 1 ? b.stops[0] : `linear-gradient(135deg, ${b.stops[0]}, ${b.stops[1]})` }}
            />
          ))}
        </div>
      </Section>
      <Section title="Spacing & corners">
        <Slider label="Padding" value={p.padding} min={0} max={0.25} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(padding) => update({ padding }, true)} onStart={liveStart} onEnd={liveEnd} />
        <Slider label="Corner radius" value={p.radius} min={0} max={0.1} step={0.005} format={(v) => `${Math.round(v * 1000) / 10}%`} onChange={(radius) => update({ radius }, true)} onStart={liveStart} onEnd={liveEnd} />
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Shadow</span>
          <Toggle label="Shadow" checked={p.shadow} onChange={(shadow) => update({ shadow })} />
        </div>
      </Section>
      <Section title="Canvas size" hint="Fixed shapes for social posts add background around the image.">
        <Chips<CanvasAspect>
          label="Canvas aspect"
          value={p.aspect}
          options={[
            ["auto", "Fit"],
            ["16:9", "16:9"],
            ["1:1", "1:1"],
            ["4:5", "4:5"],
            ["9:16", "9:16"],
          ]}
          onPick={(aspect) => update({ aspect })}
        />
      </Section>
    </>
  );
}
