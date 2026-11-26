"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Columns2, Minus, Plus, Scissors, Shapes, Trash2, Volume2, ZoomIn } from "lucide-react";
import type { FilmFrame, Waveform } from "@/engines/editor/analysis";
import { SCENE_LABEL, type Clip, type SceneCut, type SceneLayout } from "@/engines/editor/project";
import { clipDuration, clipOffsets, clipSpeed, sourceToOutputClamped, totalDuration } from "@/engines/editor/timeline";
import type { ZoomSegment } from "@/engines/zoom/types";
import { formatDuration } from "@/engines/shared/format";
import { cx } from "../ui";

interface Props {
  clips: Clip[];
  timeMs: number;
  frames: FilmFrame[];
  frameSpacingMs: number;
  waveform: Waveform | null | "loading";
  hasAudio: boolean;
  hasCamera: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeek: (outMs: number) => void;
  onTrim: (id: string, edge: "start" | "end", sourceMs: number) => void;
  onTrimStart: () => void;
  onTrimEnd: () => void;
  onSplit: () => void;
  onDelete: () => void;
  canDelete: boolean;
  /** Output times of recorded clicks; null when the recording has no cursor data. */
  /** Multicam layout switches (null = no webcam in this recording). */
  scenes: SceneCut[] | null;
  onSelectScenes: () => void;
  zoom: { segments: ZoomSegment[]; transitionMs: number; sourceDurationMs: number };
  selectedZoomId: string | null;
  onSelectZoom: (id: string) => void;
  onZoomEdit: (id: string, patch: { start: number; end: number }) => void;
  onZoomEditStart: () => void;
  onZoomEditEnd: () => void;
  annotations: Array<{ id: string; start: number; end: number; label: string; kind: string }>;
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string) => void;
  onAnnotationEdit: (id: string, patch: { start: number; end: number }) => void;
}

const LABEL_W = 92;
const TICK_STEPS = [100, 250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000];

export function Timeline(p: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(800);
  const [zoom, setZoom] = useState(1); // 1 = fit to width
  const total = Math.max(1, totalDuration(p.clips));
  const pxPerMs = ((viewW - LABEL_W - 24) / total) * zoom;
  const width = total * pxPerMs;
  const offsets = clipOffsets(p.clips);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Keep the playhead visible while playing when zoomed in.
  useEffect(() => {
    const el = scroller.current;
    if (!el || zoom <= 1) return;
    const x = LABEL_W + p.timeMs * pxPerMs;
    if (x < el.scrollLeft + LABEL_W || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - LABEL_W - 40;
  }, [p.timeMs, pxPerMs, zoom]);

  // ---- scrubbing
  const scrub = useRef(false);
  const seekFromEvent = (e: ReactPointerEvent) => {
    const el = scroller.current;
    if (!el) return;
    const x = e.clientX - el.getBoundingClientRect().left + el.scrollLeft - LABEL_W;
    p.onSeek(Math.min(total, Math.max(0, x / pxPerMs)));
  };

  // ---- trimming
  const trim = useRef<{ id: string; edge: "start" | "end"; x: number; startMs: number; speed: number } | null>(null);
  const trimDown = (clip: Clip, edge: "start" | "end") => (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    trim.current = { id: clip.id, edge, x: e.clientX, startMs: edge === "start" ? clip.start : clip.end, speed: clipSpeed(clip) };
    p.onSelect(clip.id);
    p.onTrimStart();
  };
  // ---- zoom segment dragging (move / resize)
  const zdrag = useRef<{ lane: "zoom" | "annotation"; id: string; mode: "start" | "end" | "move"; x: number; start: number; end: number } | null>(null);
  const zoomDown = (s: { id: string; start: number; end: number }, mode: "start" | "end" | "move", e: ReactPointerEvent, lane: "zoom" | "annotation" = "zoom") => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    zdrag.current = { lane, id: s.id, mode, x: e.clientX, start: s.start, end: s.end };
    if (lane === "zoom") p.onSelectZoom(s.id);
    else p.onSelectAnnotation(s.id);
    p.onZoomEditStart();
  };

  const trimMove = (e: ReactPointerEvent) => {
    const z = zdrag.current;
    if (z) {
      const d = (e.clientX - z.x) / pxPerMs;
      const maxEnd = p.zoom.sourceDurationMs;
      const MIN = 300;
      let start = z.start;
      let end = z.end;
      if (z.mode === "move") {
        const shift = Math.min(Math.max(d, -z.start), maxEnd - z.end);
        start += shift;
        end += shift;
      } else if (z.mode === "start") start = Math.min(Math.max(0, z.start + d), z.end - MIN);
      else end = Math.max(Math.min(maxEnd, z.end + d), z.start + MIN);
      const patch = { start: Math.round(start), end: Math.round(end) };
      if (z.lane === "zoom") p.onZoomEdit(z.id, patch);
      else p.onAnnotationEdit(z.id, patch);
      return;
    }
    const t = trim.current;
    if (!t) return;
    p.onTrim(t.id, t.edge, t.startMs + ((e.clientX - t.x) / pxPerMs) * t.speed);
  };
  const trimUp = () => {
    if (zdrag.current) p.onZoomEditEnd();
    zdrag.current = null;
    if (trim.current) p.onTrimEnd();
    trim.current = null;
  };

  // Overlapping annotations stack into rows so each stays reachable.
  const noteRows = stackRows(p.annotations);

  const step = TICK_STEPS.find((s) => s * pxPerMs >= 70) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const ticks: number[] = [];
  for (let t = 0; t <= total; t += step) ticks.push(t);

  return (
    <div className="flex h-full flex-col border-t border-line bg-white">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <button
          type="button"
          onClick={p.onSplit}
          className="inline-flex h-8 items-center gap-1.5 rounded-chip px-2.5 text-xs font-semibold text-ink hover:bg-subtle"
          title="Split at playhead (S)"
        >
          <Scissors className="size-4" /> Split
        </button>
        <button
          type="button"
          onClick={p.onDelete}
          disabled={!p.canDelete}
          className="inline-flex h-8 items-center gap-1.5 rounded-chip px-2.5 text-xs font-semibold text-ink hover:bg-subtle disabled:text-faint disabled:hover:bg-transparent"
          title="Delete selected clip (Delete)"
        >
          <Trash2 className="size-4" /> Delete clip
        </button>
        <span className="ml-2 text-xs text-muted tabular-nums" data-testid="edit-duration">
          {formatDuration(p.timeMs)} / {formatDuration(total)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label="Zoom out timeline" onClick={() => setZoom((z) => Math.max(1, z / 1.5))} className="grid size-8 place-items-center rounded-chip text-muted hover:bg-subtle">
            <Minus className="size-4" />
          </button>
          <button type="button" aria-label="Zoom in timeline" onClick={() => setZoom((z) => Math.min(40, z * 1.5))} className="grid size-8 place-items-center rounded-chip text-muted hover:bg-subtle">
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto select-none" onPointerMove={trimMove} onPointerUp={trimUp}>
        <div className="relative" style={{ width: width + LABEL_W + 24 }}>
          {/* Ruler */}
          <div
            className="sticky top-0 h-6 cursor-ew-resize border-b border-line bg-subtle"
            style={{ marginLeft: LABEL_W }}
            onPointerDown={(e) => {
              scrub.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              seekFromEvent(e);
            }}
            onPointerMove={(e) => scrub.current && seekFromEvent(e)}
            onPointerUp={() => (scrub.current = false)}
            data-testid="timeline-ruler"
          >
            {ticks.map((t) => (
              <span key={t} className="absolute top-0 h-full border-l border-line pl-1 text-[10px] leading-6 text-muted tabular-nums" style={{ left: t * pxPerMs }}>
                {formatTick(t, step)}
              </span>
            ))}
          </div>

          <Track label="Video" icon={null}>
            {p.clips.map((c, i) => (
              <ClipBlock
                key={c.id}
                clip={c}
                left={offsets[i] * pxPerMs}
                width={clipDuration(c) * pxPerMs}
                pxPerMs={pxPerMs}
                selected={c.id === p.selectedId}
                onSelect={(e) => {
                  p.onSelect(c.id);
                  seekFromEvent(e);
                }}
                onTrimStart={trimDown(c, "start")}
                onTrimEnd={trimDown(c, "end")}
                index={i}
              >
                <Filmstrip clip={c} frames={p.frames} spacingMs={p.frameSpacingMs} pxPerMs={pxPerMs} />
              </ClipBlock>
            ))}
          </Track>

          <Track label="Audio" icon={<Volume2 className="size-3.5" />} short>
            {!p.hasAudio ? (
              <span className="absolute inset-y-0 left-2 flex items-center text-[11px] text-faint">No audio in this recording</span>
            ) : (
              p.clips.map((c, i) => (
                <div
                  key={c.id}
                  className={cx("absolute inset-y-1 overflow-hidden rounded-md bg-primary-light", c.id === p.selectedId && "ring-2 ring-primary")}
                  style={{ left: offsets[i] * pxPerMs + 1, width: Math.max(2, clipDuration(c) * pxPerMs - 2) }}
                >
                  {p.waveform === "loading" ? null : p.waveform ? (
                    <WaveCanvas waveform={p.waveform} clip={c} width={Math.max(2, clipDuration(c) * pxPerMs - 2)} />
                  ) : (
                    <span className="flex h-full items-center px-2 text-[10px] text-primary-strong/70">Waveform unavailable</span>
                  )}
                </div>
              ))
            )}
          </Track>

          <Track label="Zoom" icon={<ZoomIn className="size-3.5" />} short>
            {p.zoom.segments.length === 0 && (
              <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[10px] text-faint">
                No zooms. Press Z to add one at the playhead.
              </span>
            )}
            {p.zoom.segments.map((s, i) => {
              const a = sourceToOutputClamped(p.clips, s.start);
              const b = sourceToOutputClamped(p.clips, s.end);
              const tail = sourceToOutputClamped(p.clips, s.end + p.zoom.transitionMs) - b;
              const ramp = Math.min(p.zoom.transitionMs, b - a);
              const selected = s.id === p.selectedZoomId;
              if (b <= a && tail <= 0) return null; // entirely cut out
              return (
                <div
                  key={s.id}
                  data-testid={`zoom-${i}`}
                  onPointerDown={(e) => zoomDown(s, "move", e)}
                  title={`${s.level.toFixed(2)}× zoom`}
                  className={cx(
                    "group absolute inset-y-1 cursor-grab overflow-hidden rounded-md border-2 active:cursor-grabbing",
                    "bg-indigo-300",
                    selected ? "border-indigo-600" : "border-transparent hover:border-indigo-400",
                  )}
                  style={{ left: a * pxPerMs + 1, width: Math.max(8, (b - a + tail) * pxPerMs - 2) }}
                >
                  {/* ramp-in / ramp-out shading */}
                  <span className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-white/70 to-transparent" style={{ width: ramp * pxPerMs }} />
                  <span className="pointer-events-none absolute inset-y-0 right-0 bg-gradient-to-l from-white/70 to-transparent" style={{ width: tail * pxPerMs }} />
                  <span className="pointer-events-none relative flex h-full items-center gap-1 px-2 text-[10px] font-semibold text-indigo-900">
                    {s.level.toFixed(2).replace(/.?0+$/, "")}×
                  </span>
                  <div
                    role="slider"
                    aria-label="Zoom start"
                    aria-valuenow={s.start}
                    data-testid={`zoom-start-${i}`}
                    onPointerDown={(e) => zoomDown(s, "start", e)}
                    className={cx("absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-indigo-600", selected ? "opacity-100" : "opacity-0 group-hover:opacity-70")}
                  />
                  <div
                    role="slider"
                    aria-label="Zoom end"
                    aria-valuenow={s.end}
                    data-testid={`zoom-end-${i}`}
                    onPointerDown={(e) => zoomDown(s, "end", e)}
                    className={cx("absolute inset-y-0 w-2 cursor-ew-resize bg-indigo-600", selected ? "opacity-100" : "opacity-0 group-hover:opacity-70")}
                    style={{ left: Math.max(0, (b - a) * pxPerMs - 10) }}
                  />
                </div>
              );
            })}
          </Track>

          {p.annotations.length > 0 && (
            <Track label="Notes" icon={<Shapes className="size-3.5" />} height={Math.max(40, noteRows.count * NOTE_ROW + 8)}>
              {p.annotations.map((a, i) => {
                const s = sourceToOutputClamped(p.clips, a.start);
                const e = sourceToOutputClamped(p.clips, a.end);
                if (e <= s) return null;
                const selected = a.id === p.selectedAnnotationId;
                const row = noteRows.rows.get(a.id) ?? 0;
                return (
                  <div
                    key={a.id}
                    data-testid={`annotation-${i}`}
                    onPointerDown={(ev) => zoomDown(a, "move", ev, "annotation")}
                    title={a.label}
                    className={cx(
                      "group absolute cursor-grab overflow-hidden rounded-md border-2 bg-rose-200 active:cursor-grabbing",
                      selected ? "border-rose-600" : "border-transparent hover:border-rose-400",
                    )}
                    style={{ left: s * pxPerMs + 1, width: Math.max(8, (e - s) * pxPerMs - 2), top: 4 + row * NOTE_ROW, height: NOTE_ROW - 3 }}
                  >
                    <span className="pointer-events-none flex h-full items-center truncate px-2 text-[10px] font-semibold text-rose-900">{a.label}</span>
                    <div
                      role="slider"
                      aria-label="Annotation start"
                      aria-valuenow={a.start}
                      onPointerDown={(ev) => zoomDown(a, "start", ev, "annotation")}
                      className={cx("absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-rose-600", selected ? "opacity-100" : "opacity-0 group-hover:opacity-70")}
                    />
                    <div
                      role="slider"
                      aria-label="Annotation end"
                      aria-valuenow={a.end}
                      data-testid={`annotation-end-${i}`}
                      onPointerDown={(ev) => zoomDown(a, "end", ev, "annotation")}
                      className={cx("absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-rose-600", selected ? "opacity-100" : "opacity-0 group-hover:opacity-70")}
                    />
                  </div>
                );
              })}
            </Track>
          )}

          {p.scenes && (
            <Track label="Layout" icon={<Columns2 className="size-3.5" />} short>
              {sceneBlocks(p.scenes, p.clips, total).map((blk) => (
                <button
                  key={blk.key}
                  type="button"
                  data-testid={`scene-${blk.layout}`}
                  title={`${SCENE_LABEL[blk.layout]} from ${formatDuration(blk.from)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onSelectScenes();
                  }}
                  className={cx("absolute inset-y-1 overflow-hidden rounded-md border border-white text-left", SCENE_COLOR[blk.layout])}
                  style={{ left: blk.from * pxPerMs + 1, width: Math.max(4, (blk.to - blk.from) * pxPerMs - 2) }}
                >
                  <span className="flex h-full items-center truncate px-2 text-[10px] font-semibold">{SCENE_LABEL[blk.layout]}</span>
                </button>
              ))}
            </Track>
          )}

          {/* Playhead */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-danger"
            style={{ left: LABEL_W + p.timeMs * pxPerMs }}
            data-testid="playhead"
          >
            <div className="absolute -top-0.5 -left-[5px] size-3 rounded-full bg-danger" />
          </div>
        </div>
      </div>
    </div>
  );
}

const NOTE_ROW = 20;

/** Greedy interval stacking: each item goes in the first row where it doesn't overlap. */
function stackRows(items: ReadonlyArray<{ id: string; start: number; end: number }>): { rows: Map<string, number>; count: number } {
  const rows = new Map<string, number>();
  const ends: number[] = [];
  for (const it of [...items].sort((a, b) => a.start - b.start)) {
    let r = ends.findIndex((end) => end <= it.start);
    if (r === -1) {
      r = ends.length;
      ends.push(it.end);
    } else ends[r] = it.end;
    rows.set(it.id, r);
  }
  return { rows, count: Math.max(1, ends.length) };
}

function Track({ label, icon, short, height, children }: { label: string; icon: React.ReactNode; short?: boolean; height?: number; children: React.ReactNode }) {
  return (
    <div className={cx("flex border-b border-line/70", height ? "" : short ? "h-10" : "h-16")} style={height ? { height } : undefined}>
      <div className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-line bg-white px-3 text-[11px] font-semibold text-muted" style={{ width: LABEL_W }}>
        {icon}
        {label}
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}

function ClipBlock({
  clip,
  left,
  width,
  selected,
  onSelect,
  onTrimStart,
  onTrimEnd,
  index,
  children,
}: {
  clip: Clip;
  left: number;
  width: number;
  pxPerMs: number;
  selected: boolean;
  onSelect: (e: ReactPointerEvent) => void;
  onTrimStart: (e: ReactPointerEvent) => void;
  onTrimEnd: (e: ReactPointerEvent) => void;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={`clip-${index}`}
      data-clip-id={clip.id}
      onPointerDown={onSelect}
      className={cx(
        "group absolute inset-y-1 cursor-pointer overflow-hidden rounded-md border-2 bg-slate-800",
        selected ? "border-primary" : "border-transparent hover:border-primary/50",
      )}
      style={{ left: left + 1, width: Math.max(4, width - 2) }}
    >
      {children}
      <span className="pointer-events-none absolute top-0.5 left-3 rounded bg-ink/60 px-1 text-[10px] text-white tabular-nums">
        {formatDuration(clip.end - clip.start)}
      </span>
      <div
        role="slider"
        aria-label="Trim clip start"
        aria-valuenow={clip.start}
        data-testid={`trim-start-${index}`}
        onPointerDown={onTrimStart}
        className={cx("absolute inset-y-0 left-0 w-2.5 cursor-ew-resize bg-primary", selected ? "opacity-100" : "opacity-0 group-hover:opacity-80")}
      />
      <div
        role="slider"
        aria-label="Trim clip end"
        aria-valuenow={clip.end}
        data-testid={`trim-end-${index}`}
        onPointerDown={onTrimEnd}
        className={cx("absolute inset-y-0 right-0 w-2.5 cursor-ew-resize bg-primary", selected ? "opacity-100" : "opacity-0 group-hover:opacity-80")}
      />
    </div>
  );
}

function Filmstrip({ clip, frames, spacingMs, pxPerMs }: { clip: Clip; frames: FilmFrame[]; spacingMs: number; pxPerMs: number }) {
  const speed = clipSpeed(clip);
  const w = Math.max(8, (spacingMs * pxPerMs) / speed);
  return (
    <>
      {frames
        .filter((f) => f.timeMs + spacingMs / 2 >= clip.start && f.timeMs - spacingMs / 2 <= clip.end)
        .map((f) => (
          // eslint-disable-next-line @next/next/no-img-element -- local blob URL
          <img
            key={f.timeMs}
            src={f.url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-y-0 h-full object-cover opacity-90"
            style={{ left: ((f.timeMs - spacingMs / 2 - clip.start) * pxPerMs) / speed, width: w }}
          />
        ))}
    </>
  );
}

function WaveCanvas({ waveform, clip, width }: { waveform: Waveform; clip: Clip; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const h = c.clientHeight || 32;
    c.width = Math.max(1, Math.round(width * dpr));
    c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#059669";
    const { peaks, bucketMs } = waveform;
    const cols = c.width;
    const msPerCol = (clip.end - clip.start) / cols;
    for (let x = 0; x < cols; x++) {
      const from = Math.floor((clip.start + x * msPerCol) / bucketMs);
      const to = Math.max(from + 1, Math.floor((clip.start + (x + 1) * msPerCol) / bucketMs));
      let v = 0;
      for (let b = from; b < to && b < peaks.length; b++) v = Math.max(v, peaks[b]);
      const bar = Math.max(1, v * c.height * 0.9);
      ctx.fillRect(x, (c.height - bar) / 2, 1, bar);
    }
  }, [waveform, clip, width]);
  return <canvas ref={ref} className="h-full" style={{ width }} />;
}

function formatTick(ms: number, step: number): string {
  if (step < 1000) return `${(ms / 1000).toFixed(step < 500 ? 2 : 1)}s`;
  return formatDuration(ms);
}

const SCENE_COLOR: Record<SceneLayout, string> = {
  pip: "bg-sky-100 text-sky-800",
  camera: "bg-amber-100 text-amber-800",
  screen: "bg-slate-100 text-slate-600",
};

/** Layout blocks on the output timeline. */
function sceneBlocks(scenes: readonly SceneCut[], clips: readonly Clip[], total: number) {
  const cuts = [...scenes].sort((a, b) => a.at - b.at);
  const points = [{ at: 0, layout: "pip" as SceneLayout, key: "start" }, ...cuts.map((c) => ({ at: sourceToOutputClamped(clips, c.at), layout: c.layout, key: c.id }))];
  const out: Array<{ key: string; layout: SceneLayout; from: number; to: number }> = [];
  for (let i = 0; i < points.length; i++) {
    const from = points[i].at;
    const to = i + 1 < points.length ? points[i + 1].at : total;
    if (to > from) out.push({ key: points[i].key, layout: points[i].layout, from, to });
  }
  return out;
}
