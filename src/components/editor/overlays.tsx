"use client";

import { useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { measureText, toOutput, type ViewMapping } from "@/engines/annotations/render";
import { annotationOpacity, dragAnnotation, type Annotation, type Handle } from "@/engines/annotations/types";
import type { PreviewPlayer } from "@/engines/editor/player";
import type { WebcamStyle } from "@/engines/editor/webcam";
import { cx } from "../ui";

/** Canvas CSS pixels per output pixel. */
function cssScale(canvas: HTMLCanvasElement) {
  return canvas.getBoundingClientRect().width / canvas.width;
}

// ---------------------------------------------------------------- webcam

export function WebcamOverlay({
  player,
  canvas,
  style,
  onChange,
  onStart,
  onEnd,
}: {
  player: PreviewPlayer;
  canvas: HTMLCanvasElement;
  style: WebcamStyle;
  onChange: (patch: Partial<WebcamStyle>) => void;
  onStart: () => void;
  onEnd: () => void;
}) {
  useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const drag = useRef<{ kind: "move" | "size"; x: number; y: number; box: { x: number; y: number; w: number; h: number } } | null>(null);
  const frame = player.frame;
  const box = frame?.cam;
  if (!frame || !box) return null;
  const k = cssScale(canvas);
  const { w: outW, h: outH } = frame.out;
  const short = Math.min(outW, outH);

  const down = (kind: "move" | "size", e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, x: e.clientX, y: e.clientY, box: { ...box } };
    onStart();
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / k;
    const dy = (e.clientY - d.y) / k;
    if (d.kind === "move") {
      onChange({ x: (d.box.x + d.box.w / 2 + dx) / outW, y: (d.box.y + d.box.h / 2 + dy) / outH });
    } else {
      const h = Math.max(short * 0.08, d.box.h + Math.max(dx, dy));
      onChange({ size: Math.min(0.5, h / short) });
    }
  };
  const up = () => {
    if (drag.current) onEnd();
    drag.current = null;
  };

  return (
    <div className="pointer-events-none absolute inset-0" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div
        data-testid="webcam-handle"
        title="Drag to move the webcam"
        onPointerDown={(e) => down("move", e)}
        className={cx(
          "pointer-events-auto absolute cursor-move border-2 border-dashed border-primary",
          style.shape === "circle" ? "rounded-full" : "rounded-[18%]",
        )}
        style={{ left: box.x * k, top: box.y * k, width: box.w * k, height: box.h * k }}
      >
        <div
          data-testid="webcam-resize"
          title="Drag to resize"
          onPointerDown={(e) => down("size", e)}
          className="absolute -right-1.5 -bottom-1.5 size-4 cursor-nwse-resize rounded-sm border-2 border-primary bg-white"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- annotations

/** What the annotation overlay needs: a layout to map coordinates and a clock (the video player, or a still-image host). */
export interface OverlayHost {
  subscribe: (l: () => void) => () => void;
  getSnapshot: () => unknown;
  frame: { out: { w: number; h: number }; source: { w: number; h: number }; src: ViewMapping["src"]; dst: ViewMapping["dst"] } | null;
  sourceTimeMs: number;
}

export function AnnotationOverlay({
  player,
  canvas,
  annotations,
  selectedId,
  onSelect,
  onChange,
  onStart,
  onEnd,
}: {
  player: OverlayHost;
  canvas: HTMLCanvasElement;
  annotations: Annotation[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (a: Annotation) => void;
  onStart: () => void;
  onEnd: () => void;
}) {
  useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const drag = useRef<{ handle: Handle; x: number; y: number; start: Annotation } | null>(null);
  const frame = player.frame;
  if (!frame) return null;
  const k = cssScale(canvas);
  const view: ViewMapping = { source: frame.source, src: frame.src, dst: frame.dst };
  const short = Math.min(frame.out.w, frame.out.h);
  const t = player.sourceTimeMs;
  const ctx = canvas.getContext("2d");

  const boxOf = (a: Annotation) => {
    if (a.kind === "text" && ctx) {
      const m = measureText(ctx, a, view, short);
      return { x: m.x, y: m.y, w: m.w, h: m.h };
    }
    const p0 = toOutput(view, a.x, a.y);
    const p1 = toOutput(view, a.x + a.w, a.y + a.h);
    return { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), w: Math.abs(p1.x - p0.x), h: Math.abs(p1.y - p0.y) };
  };

  const down = (a: Annotation, handle: Handle, e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelect(a.id);
    drag.current = { handle, x: e.clientX, y: e.clientY, start: a };
    onStart();
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // CSS px → output px → normalised source units (unzoomed view).
    const dx = ((e.clientX - d.x) / k) * (view.src.w / view.dst.w) / view.source.w;
    const dy = ((e.clientY - d.y) / k) * (view.src.h / view.dst.h) / view.source.h;
    onChange(dragAnnotation(d.start, d.handle, dx, dy));
  };
  const up = () => {
    if (drag.current) onEnd();
    drag.current = null;
  };

  const visible = annotations.filter((a) => annotationOpacity(a, t) > 0 || a.id === selectedId);

  return (
    <div
      className="absolute inset-0"
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerDown={() => onSelect(null)}
      data-testid="annotation-overlay"
    >
      {visible.map((a) => {
        const b = boxOf(a);
        const selected = a.id === selectedId;
        const active = annotationOpacity(a, t) > 0;
        if (a.kind === "arrow") {
          const p0 = toOutput(view, a.x, a.y);
          const p1 = toOutput(view, a.x + a.w, a.y + a.h);
          return (
            <div key={a.id}>
              <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
                <line
                  x1={p0.x * k}
                  y1={p0.y * k}
                  x2={p1.x * k}
                  y2={p1.y * k}
                  stroke="transparent"
                  strokeWidth={18}
                  className="pointer-events-auto cursor-move"
                  data-testid={`annotation-hit-${a.id}`}
                  onPointerDown={(e) => down(a, "move", e as unknown as ReactPointerEvent)}
                />
                {selected && <line x1={p0.x * k} y1={p0.y * k} x2={p1.x * k} y2={p1.y * k} stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 3" />}
              </svg>
              {selected && (
                <>
                  <HandleDot x={p0.x * k} y={p0.y * k} onDown={(e) => down(a, "from", e)} name="from" />
                  <HandleDot x={p1.x * k} y={p1.y * k} onDown={(e) => down(a, "to", e)} name="to" />
                </>
              )}
            </div>
          );
        }
        return (
          <div
            key={a.id}
            data-testid={`annotation-hit-${a.id}`}
            onPointerDown={(e) => down(a, "move", e)}
            className={cx(
              "absolute cursor-move",
              selected ? "outline-2 outline-offset-2 outline-primary outline-dashed" : "hover:outline-1 hover:outline-primary/60 hover:outline-dashed",
              !active && "opacity-40",
            )}
            style={{ left: b.x * k, top: b.y * k, width: Math.max(8, b.w * k), height: Math.max(8, b.h * k) }}
          >
            {selected && a.kind !== "text" && (
              <>
                {(["nw", "ne", "sw", "se"] as const).map((h) => (
                  <HandleDot
                    key={h}
                    name={h}
                    x={h.endsWith("w") ? 0 : b.w * k}
                    y={h.startsWith("n") ? 0 : b.h * k}
                    onDown={(e) => down(a, h, e)}
                  />
                ))}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HandleDot({ x, y, onDown, name }: { x: number; y: number; onDown: (e: ReactPointerEvent) => void; name: string }) {
  return (
    <div
      data-handle={name}
      onPointerDown={onDown}
      className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-primary bg-white shadow"
      style={{ left: x, top: y }}
    />
  );
}
