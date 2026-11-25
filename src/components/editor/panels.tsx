"use client";

import type { ReactNode } from "react";
import { Camera, Crop, MousePointer2, PaintBucket, Scissors, Shapes, Volume2, ZoomIn } from "lucide-react";
import { ASPECT_RATIOS, BACKGROUNDS, FULL_CROP, type AspectPreset, type EditProject } from "@/engines/editor/project";
import { clipDuration, isUntrimmed, totalDuration } from "@/engines/editor/timeline";
import { formatDuration } from "@/engines/shared/format";
import { ZOOM_LEVELS, type ZoomSegment, type ZoomSettings } from "@/engines/zoom/types";
import { ANNOTATION_COLORS, KIND_LABEL, type Annotation, type AnnotationKind } from "@/engines/annotations/types";
import type { WebcamStyle } from "@/engines/editor/webcam";
import { Button, Toggle, cx } from "../ui";

export type Tool = "trim" | "crop" | "background" | "webcam" | "cursor" | "zoom" | "annotate" | "audio";

const TOOLS: { id: Tool; label: string; icon: typeof Scissors }[] = [
  { id: "trim", label: "Trim & cut", icon: Scissors },
  { id: "crop", label: "Crop & size", icon: Crop },
  { id: "background", label: "Background", icon: PaintBucket },
  { id: "webcam", label: "Webcam", icon: Camera },
  { id: "cursor", label: "Cursor", icon: MousePointer2 },
  { id: "zoom", label: "Zoom", icon: ZoomIn },
  { id: "annotate", label: "Annotations", icon: Shapes },
  { id: "audio", label: "Audio", icon: Volume2 },
];

const LATER: { label: string; icon: typeof Shapes; phase: string }[] = [];

export function ToolList({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
  return (
    <nav aria-label="Editor tools" className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-line bg-white p-2 md:w-48 md:flex-col md:border-r md:border-b-0">
      {TOOLS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={tool === id}
          onClick={() => onTool(id)}
          className={cx(
            "flex h-10 shrink-0 items-center gap-2.5 rounded-control px-3 text-sm font-medium",
            tool === id ? "bg-primary-light text-primary-strong" : "text-muted hover:bg-subtle hover:text-ink",
          )}
        >
          <Icon className="size-4" /> {label}
        </button>
      ))}
      {LATER.length > 0 && <p className="mt-4 hidden px-3 text-[10px] font-semibold tracking-wide text-faint uppercase md:block">Coming later</p>}
      {LATER.map(({ label, icon: Icon, phase }) => (
        <div key={label} aria-disabled className="hidden h-9 items-center gap-2 px-3 text-sm whitespace-nowrap text-faint md:flex">
          <Icon className="size-4" />
          <span className="flex-1">{label}</span>
          <span className="shrink-0 text-[10px] whitespace-nowrap">{phase}</span>
        </div>
      ))}
    </nav>
  );
}

interface PanelProps {
  tool: Tool;
  project: EditProject;
  update: (patch: Partial<EditProject>) => void;
  /** Same as update, but for continuous controls: transient while dragging, committed on release. */
  live: (patch: Partial<EditProject>) => void;
  liveStart: () => void;
  liveEnd: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSplit: () => void;
  onDelete: () => void;
  hasCamera: boolean;
  hasAudio: boolean;
  /** Number of recorded cursor events (0 = no telemetry). */
  cursorEvents: number;
  updateZoom: (patch: Partial<ZoomSettings>, opts?: { transient?: boolean; regenerate?: boolean }) => void;
  addZoom: () => void;
  editZoom: (id: string, patch: Partial<ZoomSegment>, transient?: boolean) => void;
  deleteZoom: (id: string) => void;
  selectedZoomId: string | null;
  onSelectZoom: (id: string) => void;
  updateWebcam: (patch: Partial<WebcamStyle>, transient?: boolean) => void;
  addAnnotation: (kind: AnnotationKind) => void;
  editAnnotation: (id: string, patch: Partial<Annotation>, transient?: boolean) => void;
  deleteAnnotation: (id: string) => void;
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string | null) => void;
}

export function PropertiesPanel(p: PanelProps) {
  return (
    <aside className="w-full shrink-0 overflow-y-auto border-l border-line bg-white p-4 md:w-72" aria-label="Properties">
      {p.tool === "trim" && <TrimPanel {...p} />}
      {p.tool === "crop" && <CropPanel {...p} />}
      {p.tool === "background" && <BackgroundPanel {...p} />}
      {p.tool === "webcam" && <WebcamPanel {...p} />}
      {p.tool === "cursor" && <CursorPanel {...p} />}
      {p.tool === "zoom" && <ZoomPanel {...p} />}
      {p.tool === "annotate" && <AnnotationsPanel {...p} />}
      {p.tool === "audio" && <AudioPanel {...p} />}
    </aside>
  );
}

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      {children}
    </section>
  );
}

export function Chips<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          aria-label={`${label}: ${text}`}
          onClick={() => onPick(v)}
          className={cx(
            "h-8 min-w-10 rounded-chip border px-2.5 text-xs font-semibold",
            v === value ? "border-primary bg-primary text-white" : "border-line bg-white text-ink hover:bg-subtle",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onStart,
  onEnd,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onStart: () => void;
  onEnd: () => void;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 flex justify-between text-xs font-medium text-muted">
        {label}
        <span className="text-ink tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onStart}
        onPointerUp={onEnd}
        onKeyDown={onStart}
        onKeyUp={onEnd}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-primary)]"
      />
    </label>
  );
}

function TrimPanel({ project, selectedId, onSelect, onSplit, onDelete, update }: PanelProps) {
  const total = totalDuration(project.clips);
  return (
    <>
      <Section
        title="Trim & cut"
        hint={
          <>
            Drag the green edges of a clip on the timeline to trim it. Move the playhead and press <b>Split</b> (S) to cut, then
            delete the parts you don&apos;t want.
          </>
        }
      >
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onSplit}>
            <Scissors className="size-4" /> Split here
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} disabled={project.clips.length <= 1 || !selectedId}>
            Delete clip
          </Button>
        </div>
      </Section>
      <Section title={`Clips (${project.clips.length})`} hint={`Edited length ${formatDuration(total)} of ${formatDuration(project.sourceDurationMs)}`}>
        <ol className="space-y-1">
          {project.clips.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={cx(
                  "flex w-full items-center justify-between rounded-chip px-2.5 py-1.5 text-left text-xs",
                  c.id === selectedId ? "bg-primary-light text-primary-strong" : "hover:bg-subtle",
                )}
              >
                <span className="font-medium">Clip {i + 1}</span>
                <span className="text-muted tabular-nums">
                  {formatDuration(c.start)}–{formatDuration(c.end)} · {formatDuration(clipDuration(c))}
                </span>
              </button>
            </li>
          ))}
        </ol>
        {!isUntrimmed(project.clips, project.sourceDurationMs) && (
          <button
            type="button"
            className="mt-3 text-xs font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
            onClick={() => update({ clips: [{ id: "c1", start: 0, end: project.sourceDurationMs }] })}
          >
            Reset all cuts
          </button>
        )}
      </Section>
    </>
  );
}

const ASPECTS: [AspectPreset, string][] = [
  ["source", "Original"],
  ...(Object.keys(ASPECT_RATIOS) as Exclude<AspectPreset, "source">[]).map((k) => [k, k] as [AspectPreset, string]),
];

function CropPanel({ project, update }: PanelProps) {
  const c = project.crop;
  const cropped = c.x !== 0 || c.y !== 0 || c.w !== 1 || c.h !== 1;
  return (
    <>
      <Section title="Aspect ratio" hint="Shape of the exported video. 9:16 suits Reels, Shorts and TikTok.">
        <Chips label="Aspect ratio" value={project.aspect} options={ASPECTS} onPick={(aspect) => update({ aspect })} />
      </Section>
      {project.aspect !== "source" && (
        <Section title="Fit" hint="Fit shows the whole picture with background around it. Fill zooms in to fill the frame.">
          <Chips
            label="Fit"
            value={project.fit}
            options={[
              ["contain", "Fit"],
              ["cover", "Fill"],
            ]}
            onPick={(fit) => update({ fit })}
          />
        </Section>
      )}
      <Section title="Crop" hint="Drag the box or its corners on the preview to choose the part of the screen to keep.">
        <p className="text-xs text-muted tabular-nums" data-testid="crop-values">
          {Math.round(c.w * 100)}% × {Math.round(c.h * 100)}% at {Math.round(c.x * 100)}%, {Math.round(c.y * 100)}%
        </p>
        {cropped && (
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => update({ crop: { ...FULL_CROP } })}>
            Reset crop
          </Button>
        )}
      </Section>
    </>
  );
}

function BackgroundPanel({ project, update, live, liveStart, liveEnd }: PanelProps) {
  const visible = project.padding > 0 || project.aspect !== "source";
  return (
    <>
      <Section title="Background" hint={visible ? undefined : "Add padding or change the aspect ratio to see the background."}>
        <div role="radiogroup" aria-label="Background" className="grid grid-cols-4 gap-2">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={project.background === b.id}
              aria-label={`Background: ${b.label}`}
              title={b.label}
              onClick={() => update({ background: b.id })}
              className={cx(
                "aspect-square rounded-chip border-2",
                project.background === b.id ? "border-primary ring-2 ring-primary/30" : "border-line",
              )}
              style={{ background: b.stops.length === 1 ? b.stops[0] : `linear-gradient(135deg, ${b.stops[0]}, ${b.stops[1]})` }}
            />
          ))}
        </div>
      </Section>
      <Section title="Frame">
        <Slider
          label="Padding"
          value={project.padding}
          min={0}
          max={0.15}
          step={0.005}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(padding) => live({ padding })}
          onStart={liveStart}
          onEnd={liveEnd}
        />
        <Slider
          label="Corner radius"
          value={project.radius}
          min={0}
          max={0.06}
          step={0.002}
          format={(v) => `${Math.round(v * 1000) / 10}%`}
          onChange={(radius) => live({ radius })}
          onStart={liveStart}
          onEnd={liveEnd}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Shadow</span>
          <Toggle label="Shadow" checked={project.shadow} onChange={(shadow) => update({ shadow })} />
        </div>
      </Section>
    </>
  );
}

function AudioPanel({ project, update, live, liveStart, liveEnd, hasAudio }: PanelProps) {
  if (!hasAudio) {
    return (
      <Section title="Audio">
        <p className="text-sm text-muted">This recording has no audio.</p>
      </Section>
    );
  }
  return (
    <Section title="Audio" hint="Applies to the whole video (mic and system audio are mixed together).">
      <Slider
        label="Volume"
        value={project.audio.volume}
        min={0}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(volume) => live({ audio: { ...project.audio, volume } })}
        onStart={liveStart}
        onEnd={liveEnd}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">Mute audio</span>
        <Toggle label="Mute audio" checked={project.audio.muted} onChange={(muted) => update({ audio: { ...project.audio, muted } })} />
      </div>
    </Section>
  );
}

const CURSOR_COLORS = ["#facc15", "#10b981", "#38bdf8", "#f472b6", "#ffffff"];

function CursorPanel({ project, update, live, liveStart, liveEnd, cursorEvents }: PanelProps) {
  if (cursorEvents === 0) {
    return (
      <Section title="Cursor">
        <p className="text-sm text-muted">This recording has no cursor data.</p>
        <p className="mt-2 text-xs text-muted">
          Browsers don&apos;t share where the cursor is during screen recording. To get cursor effects, install the CaptureKit
          browser extension and record a <b>browser tab</b>. Screen and window recordings will get cursor data with the planned
          desktop app.
        </p>
        <a href="/help#cursor-extension" className="mt-3 inline-block text-xs font-semibold text-primary-strong hover:underline">
          How to install the extension
        </a>
      </Section>
    );
  }
  const c = project.cursor;
  const set = (patch: Partial<typeof c>) => update({ cursor: { ...c, ...patch } });
  const setLive = (patch: Partial<typeof c>) => live({ cursor: { ...c, ...patch } });
  return (
    <>
      <Section title="Cursor" hint={`${cursorEvents.toLocaleString()} cursor events recorded in the shared tab.`}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Show cursor</span>
          <Toggle label="Show cursor" checked={c.show} onChange={(show) => set({ show })} />
        </div>
        <Slider label="Cursor size" value={c.size} min={0.8} max={3} step={0.1} format={(v) => `${v.toFixed(1)}×`} onChange={(size) => setLive({ size })} onStart={liveStart} onEnd={liveEnd} />
        <Slider label="Smoothing" value={c.smoothing} min={0} max={1} step={0.05} format={(v) => (v === 0 ? "Off" : `${Math.round(v * 100)}%`)} onChange={(smoothing) => setLive({ smoothing })} onStart={liveStart} onEnd={liveEnd} />
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Hide when still</span>
          <Toggle label="Hide when still" checked={c.hideIdle} onChange={(hideIdle) => set({ hideIdle })} />
        </div>
      </Section>
      <Section title="Highlight">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Circle behind cursor</span>
          <Toggle label="Cursor highlight" checked={c.highlight.enabled} onChange={(enabled) => set({ highlight: { ...c.highlight, enabled } })} />
        </div>
        <div className={cx(!c.highlight.enabled && "pointer-events-none opacity-50")}>
          <ColorRow label="Highlight colour" value={c.highlight.color} onPick={(color) => set({ highlight: { ...c.highlight, color } })} />
          <Slider label="Highlight size" value={c.highlight.size} min={1} max={4} step={0.1} format={(v) => `${v.toFixed(1)}×`} onChange={(size) => setLive({ highlight: { ...c.highlight, size } })} onStart={liveStart} onEnd={liveEnd} />
          <Slider label="Highlight opacity" value={c.highlight.opacity} min={0.1} max={0.8} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => setLive({ highlight: { ...c.highlight, opacity } })} onStart={liveStart} onEnd={liveEnd} />
        </div>
      </Section>
      <Section title="Clicks">
        <Chips
          label="Click effect"
          value={c.click.style}
          options={[
            ["ripple", "Ripple"],
            ["none", "None"],
          ]}
          onPick={(style) => set({ click: { ...c.click, style } })}
        />
        <div className={cx("mt-3", c.click.style === "none" && "pointer-events-none opacity-50")}>
          <ColorRow label="Click colour" value={c.click.color} onPick={(color) => set({ click: { ...c.click, color } })} />
        </div>
      </Section>
      <Section title="Sync" hint="Nudge the cursor if it looks slightly ahead of or behind the video.">
        <Slider label="Cursor timing" value={c.offsetMs} min={-500} max={500} step={10} format={(v) => `${v > 0 ? "+" : ""}${v} ms`} onChange={(offsetMs) => setLive({ offsetMs })} onStart={liveStart} onEnd={liveEnd} />
      </Section>
    </>
  );
}

function ColorRow({ label, value, onPick }: { label: string; value: string; onPick: (c: string) => void }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-1.5">
        {CURSOR_COLORS.map((col) => (
          <button
            key={col}
            type="button"
            role="radio"
            aria-checked={value === col}
            aria-label={`${label} ${col}`}
            onClick={() => onPick(col)}
            className={cx("size-6 rounded-full border-2", value === col ? "border-ink" : "border-line")}
            style={{ background: col }}
          />
        ))}
      </div>
    </div>
  );
}

const LEVEL_OPTIONS: [string, string][] = ZOOM_LEVELS.map((l) => [String(l), `${l}×`]);

function ZoomPanel(p: PanelProps) {
  const z = p.project.zoom;
  const hasTelemetry = p.cursorEvents > 0;
  const selected = z.segments.find((s) => s.id === p.selectedZoomId) ?? null;
  const regen = (patch: Partial<ZoomSettings>) => p.updateZoom(patch, { regenerate: true });
  const regenLive = (patch: Partial<ZoomSettings>) => p.updateZoom(patch, { regenerate: true, transient: true });
  return (
    <>
      <Section
        title="Automatic zoom"
        hint={
          hasTelemetry
            ? "Zooms in around clicks (and pauses, if enabled) and follows the cursor. Plain cursor movement never zooms."
            : undefined
        }
      >
        {!hasTelemetry ? (
          <p className="text-xs text-muted">
            Automatic zoom needs cursor data. Record a <b>browser tab</b> with the CaptureKit extension installed. You can still
            add zooms by hand below.
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">Auto zoom</span>
              <Toggle label="Auto zoom" checked={z.auto} onChange={(auto) => regen({ auto })} />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">Also zoom on pauses</span>
              <Toggle label="Zoom on pauses" checked={z.onPauses} onChange={(onPauses) => regen({ onPauses })} disabled={!z.auto} />
            </div>
            <Slider
              label="Hold after interaction"
              value={z.holdMs}
              min={500}
              max={4000}
              step={100}
              format={(v) => `${(v / 1000).toFixed(1)} s`}
              onChange={(holdMs) => regenLive({ holdMs })}
              onStart={p.liveStart}
              onEnd={p.liveEnd}
            />
          </>
        )}
      </Section>

      <Section title="Zoom style">
        <p className="mb-1.5 text-xs font-medium text-muted">Zoom level</p>
        <Chips label="Default zoom level" value={String(z.level)} options={LEVEL_OPTIONS} onPick={(v) => regen({ level: Number(v) })} />
        <div className="mt-3">
          <Slider
            label="Transition"
            value={z.transitionMs}
            min={300}
            max={1500}
            step={50}
            format={(v) => `${(v / 1000).toFixed(2)} s`}
            onChange={(transitionMs) => regenLive({ transitionMs })}
            onStart={p.liveStart}
            onEnd={p.liveEnd}
          />
          {hasTelemetry && (
            <Slider
              label="Follow smoothness"
              value={z.followSmoothing}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(followSmoothing) => p.updateZoom({ followSmoothing }, { transient: true })}
              onStart={p.liveStart}
              onEnd={p.liveEnd}
            />
          )}
        </div>
      </Section>

      <Section title={`Zooms (${z.segments.length})`}>
        <Button size="sm" variant="secondary" onClick={p.addZoom}>
          <ZoomIn className="size-4" /> Add zoom at playhead
        </Button>
        <p className="mt-1.5 text-[11px] text-faint">Shortcut: Z. Drag zooms on the timeline to move or resize them.</p>
        {z.segments.length > 0 && (
          <ol className="mt-3 space-y-1" data-testid="zoom-list">
            {z.segments.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => p.onSelectZoom(s.id)}
                  className={cx(
                    "flex w-full items-center justify-between rounded-chip px-2.5 py-1.5 text-left text-xs",
                    s.id === p.selectedZoomId ? "bg-primary-light text-primary-strong" : "hover:bg-subtle",
                  )}
                >
                  <span className="font-medium tabular-nums">
                    {formatDuration(s.start)}–{formatDuration(s.end)}
                  </span>
                  <span className="flex items-center gap-1.5 text-muted">
                    {s.level}× · {s.mode === "follow" ? "follow" : "fixed"}
                    {s.auto && <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-800">auto</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {selected && (
        <Section title="Selected zoom">
          <p className="mb-1.5 text-xs font-medium text-muted">Level</p>
          <Chips label="Zoom level" value={String(selected.level)} options={LEVEL_OPTIONS} onPick={(v) => p.editZoom(selected.id, { level: Number(v) })} />
          <p className="mt-3 mb-1.5 text-xs font-medium text-muted">Focus</p>
          <Chips
            label="Zoom focus"
            value={selected.mode}
            options={hasTelemetry ? [["follow", "Follow cursor"], ["fixed", "Fixed point"]] : [["fixed", "Fixed point"]]}
            onPick={(mode) => p.editZoom(selected.id, { mode })}
          />
          {selected.mode === "fixed" && (
            <p className="mt-2 text-xs text-primary-strong">
              Click the preview to choose where to zoom ({Math.round(selected.x * 100)}%, {Math.round(selected.y * 100)}%).
            </p>
          )}
          {selected.auto && <p className="mt-2 text-[11px] text-faint">Editing an automatic zoom turns it into a manual one.</p>}
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => p.deleteZoom(selected.id)}>
            Delete zoom
          </Button>
        </Section>
      )}
    </>
  );
}

const WEBCAM_CORNERS: Array<[string, number, number]> = [
  ["↖", 0, 0],
  ["↗", 1, 0],
  ["↙", 0, 1],
  ["↘", 1, 1],
];
const BORDER_COLORS = ["#ffffff", "#111827", "#10b981", "#3b82f6", "#f59e0b"];

function WebcamPanel({ project, updateWebcam, liveStart, liveEnd, hasCamera }: PanelProps) {
  if (!hasCamera) {
    return (
      <Section title="Webcam">
        <p className="text-sm text-muted">This recording has no webcam track. Turn on the webcam before recording to use it here.</p>
      </Section>
    );
  }
  const w = project.webcam;
  return (
    <>
      <Section title="Webcam" hint="Drag the webcam on the preview to place it anywhere; drag its corner to resize.">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Show webcam</span>
          <Toggle label="Show webcam" checked={w.visible} onChange={(visible) => updateWebcam({ visible })} />
        </div>
        <div className={cx("space-y-4", !w.visible && "pointer-events-none opacity-50")}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Snap to corner</span>
            <div className="flex gap-1" role="group" aria-label="Snap webcam to corner">
              {WEBCAM_CORNERS.map(([label, x, y]) => (
                <button
                  key={label}
                  type="button"
                  aria-label={`Webcam corner ${label}`}
                  onClick={() => updateWebcam({ x, y })}
                  className={cx(
                    "grid size-8 place-items-center rounded-chip border text-xs",
                    w.x === x && w.y === y ? "border-primary bg-primary text-white" : "border-line hover:bg-subtle",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Slider label="Webcam size" value={w.size} min={0.1} max={0.5} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(size) => updateWebcam({ size }, true)} onStart={liveStart} onEnd={liveEnd} />
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Shape</p>
            <Chips
              label="Webcam shape"
              value={w.shape}
              options={[
                ["circle", "Circle"],
                ["rounded", "Rounded"],
                ["rect", "Rectangle"],
              ]}
              onPick={(shape) => updateWebcam({ shape })}
            />
          </div>
          <Slider label="Border" value={w.border} min={0} max={0.08} step={0.005} format={(v) => (v === 0 ? "None" : `${Math.round(v * 1000) / 10}%`)} onChange={(border) => updateWebcam({ border }, true)} onStart={liveStart} onEnd={liveEnd} />
          <div className={cx(w.border === 0 && "pointer-events-none opacity-50")}>
            <ColorRowCustom label="Border colour" value={w.borderColor} colors={BORDER_COLORS} onPick={(borderColor) => updateWebcam({ borderColor })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Shadow</span>
            <Toggle label="Webcam shadow" checked={w.shadow} onChange={(shadow) => updateWebcam({ shadow })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Mirror</span>
            <Toggle label="Mirror webcam" checked={w.mirror} onChange={(mirror) => updateWebcam({ mirror })} />
          </div>
        </div>
      </Section>
      <Section title="Background">
        <p className="text-xs text-muted">
          Replacing or blurring the webcam background isn&apos;t available yet. It needs an on-device person-segmentation
          model, which CaptureKit doesn&apos;t include yet (no cloud services are used).
        </p>
      </Section>
    </>
  );
}

export function ColorRowCustom({ label, value, colors, onPick }: { label: string; value: string; colors: string[]; onPick: (c: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap justify-end gap-1.5">
        {colors.map((col) => (
          <button
            key={col}
            type="button"
            role="radio"
            aria-checked={value === col}
            aria-label={`${label} ${col}`}
            onClick={() => onPick(col)}
            className={cx("size-6 rounded-full border-2", value === col ? "border-ink ring-2 ring-primary/30" : "border-line")}
            style={{ background: col }}
          />
        ))}
      </div>
    </div>
  );
}

const ADD_KINDS: AnnotationKind[] = ["text", "arrow", "rect", "ellipse", "highlight", "blur"];

export interface AnnotationEditorProps {
  annotations: Annotation[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (kind: AnnotationKind) => void;
  onEdit: (id: string, patch: Partial<Annotation>, transient?: boolean) => void;
  onDelete: (id: string) => void;
  liveStart: () => void;
  liveEnd: () => void;
  /** Video annotations have a time range; screenshot ones don't. */
  timed: boolean;
}

function AnnotationsPanel(p: PanelProps) {
  return (
    <AnnotationEditor
      annotations={p.project.annotations}
      selectedId={p.selectedAnnotationId}
      onSelect={p.onSelectAnnotation}
      onAdd={p.addAnnotation}
      onEdit={p.editAnnotation}
      onDelete={p.deleteAnnotation}
      liveStart={p.liveStart}
      liveEnd={p.liveEnd}
      timed
    />
  );
}

export function AnnotationEditor(p: AnnotationEditorProps) {
  const list = p.annotations;
  const a = list.find((x) => x.id === p.selectedId) ?? null;
  const edit = (patch: Partial<Annotation>) => a && p.onEdit(a.id, patch);
  const editLive = (patch: Partial<Annotation>) => a && p.onEdit(a.id, patch, true);
  return (
    <>
      <Section title="Add" hint={p.timed ? "Added at the playhead for 3 seconds. Zoom is paused while you edit annotations." : "Drag on the image to move; drag corners to resize."}>
        <div className="grid grid-cols-3 gap-1.5">
          {ADD_KINDS.map((k) => (
            <Button key={k} size="sm" variant="secondary" onClick={() => p.onAdd(k)}>
              {KIND_LABEL[k]}
            </Button>
          ))}
        </div>
      </Section>

      {a ? (
        <Section title={KIND_LABEL[a.kind]}>
          {a.kind === "text" && (
            <>
              <label className="mb-3 block">
                <span className="mb-1 block text-xs font-medium text-muted">Text</span>
                <textarea
                  aria-label="Annotation text"
                  value={a.text}
                  rows={2}
                  maxLength={200}
                  onFocus={p.liveStart}
                  onBlur={p.liveEnd}
                  onChange={(e) => editLive({ text: e.target.value })}
                  className="w-full rounded-chip border border-line px-2.5 py-2 text-sm"
                />
              </label>
              <Slider label="Text size" value={a.fontSize} min={0.02} max={0.12} step={0.005} format={(v) => `${Math.round(v * 1000) / 10}%`} onChange={(fontSize) => editLive({ fontSize })} onStart={p.liveStart} onEnd={p.liveEnd} />
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-muted">Bold</span>
                <Toggle label="Bold text" checked={a.bold} onChange={(bold) => edit({ bold })} />
              </div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-muted">Background</span>
                <Toggle label="Text background" checked={a.background !== null} onChange={(on) => edit({ background: on ? "#111827" : null })} />
              </div>
              {a.background !== null && (
                <div className="mb-3">
                  <ColorRowCustom label="Background colour" value={a.background} colors={ANNOTATION_COLORS} onPick={(background) => edit({ background })} />
                </div>
              )}
            </>
          )}
          {a.kind !== "blur" && (
            <div className="mb-3">
              <ColorRowCustom
                label={a.kind === "text" ? "Text colour" : "Colour"}
                value={a.color}
                colors={a.kind === "highlight" ? ["#facc15", "#86efac", "#93c5fd", "#f9a8d4"] : ANNOTATION_COLORS}
                onPick={(color) => edit({ color })}
              />
            </div>
          )}
          {(a.kind === "arrow" || a.kind === "rect" || a.kind === "ellipse") && (
            <Slider label="Line width" value={a.stroke} min={0.002} max={0.02} step={0.001} format={(v) => `${Math.round(v * 1000) / 10}%`} onChange={(stroke) => editLive({ stroke })} onStart={p.liveStart} onEnd={p.liveEnd} />
          )}
          {a.kind === "blur" && <p className="mb-3 text-xs text-muted">Pixelates whatever is under the box. Drag its corners to cover the sensitive area.</p>}
          {p.timed && (
            <p className="mb-3 text-xs text-muted tabular-nums">
              Shown {formatDuration(a.start)}–{formatDuration(a.end)}. Drag it on the timeline to change when.
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => p.onSelect(null)}>
              Done
            </Button>
            <Button size="sm" variant="ghost" onClick={() => p.onDelete(a.id)}>
              Delete {KIND_LABEL[a.kind].toLowerCase()}
            </Button>
          </div>
        </Section>
      ) : (
        <Section title={`Annotations (${list.length})`}>
          {list.length === 0 ? (
            <p className="text-xs text-muted">Nothing yet. Add text, arrows, shapes, a highlighter or a blur above.</p>
          ) : (
            <ol className="space-y-1" data-testid="annotation-list">
              {list.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => p.onSelect(x.id)} className="flex w-full items-center justify-between rounded-chip px-2.5 py-1.5 text-left text-xs hover:bg-subtle">
                    <span className="truncate font-medium">{x.kind === "text" ? `“${x.text.slice(0, 24)}”` : KIND_LABEL[x.kind]}</span>
                    {p.timed && (
                      <span className="text-muted tabular-nums">
                        {formatDuration(x.start)}–{formatDuration(x.end)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-[11px] text-faint">Click an annotation on the {p.timed ? "preview" : "image"} to select it.</p>
        </Section>
      )}
    </>
  );
}
