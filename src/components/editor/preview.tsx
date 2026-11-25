"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PreviewPlayer, type PreviewMode } from "@/engines/editor/player";
import type { CursorBundle } from "@/engines/cursor/path";
import type { Annotation } from "@/engines/annotations/types";
import { clampCrop, type EditProject, type NormRect } from "@/engines/editor/project";
import type { WebcamStyle } from "@/engines/editor/webcam";
import { AnnotationOverlay, WebcamOverlay } from "./overlays";
import type { BackgroundImage } from "@/engines/editor/layout";

interface Props {
  screenUrl: string;
  cameraUrl: string | null;
  project: EditProject;
  mode: PreviewMode;
  onPlayer: (p: PreviewPlayer | null) => void;
  onCrop: (crop: NormRect, transient: boolean) => void;
  onCropCommit: (before: NormRect) => void;
  cursor: CursorBundle | null;
  backgroundImage?: BackgroundImage | null;
  /** When set, clicking the preview picks a point (normalised source coords) instead of play/pause. */
  onPick?: (x: number, y: number) => void;
  /** Drag/resize the webcam on the preview (Webcam tool). */
  webcamEdit?: { onChange: (patch: Partial<WebcamStyle>) => void; onStart: () => void; onEnd: () => void } | null;
  /** Select/move/resize annotations on the preview (Annotate tool). */
  annotationEdit?: {
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onChange: (a: Annotation) => void;
    onStart: () => void;
    onEnd: () => void;
  } | null;
}

/** Canvas preview of the edit, plus the crop overlay in crop mode. */
export function Preview({ screenUrl, cameraUrl, project, mode, onPlayer, onCrop, onCropCommit, cursor, backgroundImage = null, onPick, webcamEdit, annotationEdit }: Props) {
  const screenRef = useRef<HTMLVideoElement>(null);
  const camRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [player, setPlayer] = useState<PreviewPlayer | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  // Size the canvas to the space actually available (the timeline height varies).
  const boxRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cs = getComputedStyle(el);
      setAvail({
        w: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        h: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    const screen = screenRef.current;
    const canvas = canvasRef.current;
    if (!screen || !canvas) return;
    let p: PreviewPlayer | null = null;
    const create = () => {
      if (p) return;
      p = new PreviewPlayer(screen, cameraUrl ? camRef.current : null, canvas, projectRef.current);
      setPlayer(p);
      setCanvasEl(canvas);
      onPlayer(p);
    };
    if (screen.readyState >= 1) create();
    else screen.addEventListener("loadedmetadata", create, { once: true });
    return () => {
      screen.removeEventListener("loadedmetadata", create);
      p?.destroy();
      setPlayer(null);
      onPlayer(null);
    };
    // Player is bound to these media URLs for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenUrl, cameraUrl]);

  useEffect(() => {
    player?.setProject(project);
  }, [player, project]);

  useEffect(() => {
    player?.setMode(mode);
  }, [player, mode]);

  useEffect(() => {
    player?.setCursor(cursor);
  }, [player, cursor]);

  useEffect(() => {
    player?.setBackgroundImage(backgroundImage);
  }, [player, backgroundImage]);

  return (
    <div ref={boxRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 sm:p-6">
      <video ref={screenRef} src={screenUrl} preload="auto" playsInline className="pointer-events-none absolute size-px opacity-0" />
      {cameraUrl && (
        <video ref={camRef} src={cameraUrl} preload="auto" playsInline muted className="pointer-events-none absolute size-px opacity-0" />
      )}
      <div className="relative max-h-full max-w-full leading-[0]">
        <canvas
          ref={canvasRef}
          data-testid="editor-canvas"
          onClick={(e) => {
            if (mode !== "edit" || !player) return;
            if (onPick) {
              const c = e.currentTarget;
              const r = c.getBoundingClientRect();
              const pt = player.canvasToSource(((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height);
              if (pt) onPick(pt.x, pt.y);
            } else player.toggle();
          }}
          className={`max-w-full rounded-control bg-ink shadow-card ${onPick ? "cursor-crosshair" : "cursor-pointer"}`}
          data-picking={onPick ? "true" : undefined}
          style={avail ? { maxWidth: avail.w, maxHeight: avail.h } : { maxHeight: "50vh" }}
          width={1280}
          height={720}
        />
        {mode === "crop" && player && <CropOverlay crop={project.crop} onCrop={onCrop} onCommit={onCropCommit} />}
        {mode === "edit" && player && canvasEl && webcamEdit && project.webcam.visible && (
          <WebcamOverlay player={player} canvas={canvasEl} style={project.webcam} {...webcamEdit} />
        )}
        {mode === "annotate" && player && canvasEl && annotationEdit && (
          <AnnotationOverlay player={player} canvas={canvasEl} annotations={project.annotations} {...annotationEdit} />
        )}
      </div>
    </div>
  );
}

type Handle = "move" | "nw" | "ne" | "sw" | "se";

export function CropOverlay({
  crop,
  onCrop,
  onCommit,
}: {
  crop: NormRect;
  onCrop: (c: NormRect, transient: boolean) => void;
  onCommit: (before: NormRect) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; x: number; y: number; start: NormRect } | null>(null);

  const down = (handle: Handle, e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { handle, x: e.clientX, y: e.clientY, start: crop };
  };

  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    const rect = box.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dx = (e.clientX - d.x) / rect.width;
    const dy = (e.clientY - d.y) / rect.height;
    const s = d.start;
    let next: NormRect;
    switch (d.handle) {
      case "move":
        next = { ...s, x: s.x + dx, y: s.y + dy };
        break;
      case "nw":
        next = { x: Math.min(s.x + dx, s.x + s.w - 0.05), y: Math.min(s.y + dy, s.y + s.h - 0.05), w: s.w - dx, h: s.h - dy };
        break;
      case "ne":
        next = { x: s.x, y: Math.min(s.y + dy, s.y + s.h - 0.05), w: s.w + dx, h: s.h - dy };
        break;
      case "sw":
        next = { x: Math.min(s.x + dx, s.x + s.w - 0.05), y: s.y, w: s.w - dx, h: s.h + dy };
        break;
      case "se":
        next = { x: s.x, y: s.y, w: s.w + dx, h: s.h + dy };
        break;
    }
    if (d.handle !== "move") {
      // Clamp edges to the frame before clampCrop shifts the rectangle.
      const x1 = Math.min(1, next.x + next.w);
      const y1 = Math.min(1, next.y + next.h);
      next.x = Math.max(0, next.x);
      next.y = Math.max(0, next.y);
      next.w = x1 - next.x;
      next.h = y1 - next.y;
    }
    onCrop(clampCrop(next), true);
  };

  const up = () => {
    if (drag.current) onCommit(drag.current.start);
    drag.current = null;
  };

  const pct = (n: number) => `${n * 100}%`;
  const handles: Array<[Exclude<Handle, "move">, string]> = [
    ["nw", "top-0 left-0 cursor-nwse-resize"],
    ["ne", "top-0 right-0 cursor-nesw-resize"],
    ["sw", "bottom-0 left-0 cursor-nesw-resize"],
    ["se", "bottom-0 right-0 cursor-nwse-resize"],
  ];

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden rounded-control" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div
        data-testid="crop-rect"
        onPointerDown={(e) => down("move", e)}
        className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.55)]"
        style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
      >
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="border border-white/25" />
          ))}
        </div>
        {handles.map(([h, cls]) => (
          <div
            key={h}
            data-handle={h}
            onPointerDown={(e) => down(h, e)}
            className={`absolute size-4 rounded-sm border-2 border-primary bg-white shadow ${cls}`}
          />
        ))}
      </div>
    </div>
  );
}
