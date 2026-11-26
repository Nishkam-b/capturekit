"use client";

import type { ReactNode } from "react";
import { Camera, Columns2, Crop, Monitor, PaintBucket, Scissors, Shapes, Volume2, ZoomIn } from "lucide-react";
import {
  ASPECT_RATIOS,
  BACKGROUNDS,
  BG_BLURRED,
  BG_IMAGE,
  DEFAULT_SCREEN,
  FULL_CROP,
  SCENE_LABEL,
  SPEEDS,
  type AspectPreset,
  type BackgroundPreset,
  type EditProject,
  type LayerTransform,
  type SceneLayout,
} from "@/engines/editor/project";
import { clipDuration, clipSpeed, isUntrimmed, setClipSpeed, totalDuration } from "@/engines/editor/timeline";
import { formatDuration } from "@/engines/shared/format";
import { ZOOM_MAX, ZOOM_MIN, type ZoomSegment, type ZoomSettings } from "@/engines/zoom/types";
import { ANNOTATION_COLORS, KIND_LABEL, type Annotation, type AnnotationKind } from "@/engines/annotations/types";
import type { WebcamStyle } from "@/engines/editor/webcam";
import { Droplets, ImagePlus, Music } from "lucide-react";
import type { AudioTrack } from "@/engines/editor/audio-tracks";
import { Button, Toggle, cx } from "../ui";

export type Tool = "trim" | "crop" | "screen" | "background" | "webcam" | "layout" | "zoom" | "annotate" | "audio";

const TOOLS: { id: Tool; label: string; icon: typeof Scissors }[] = [
  { id: "trim", label: "Trim & cut", icon: Scissors },
  { id: "crop", label: "Crop & size", icon: Crop },
  { id: "screen", label: "Screen", icon: Monitor },
  { id: "background", label: "Background", icon: PaintBucket },
  { id: "webcam", label: "Webcam", icon: Camera },
  { id: "layout", label: "Layout", icon: Columns2 },
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
  updateZoom: (patch: Partial<ZoomSettings>, opts?: { transient?: boolean }) => void;
  addZoom: () => void;
  editZoom: (id: string, patch: Partial<ZoomSegment>, transient?: boolean) => void;
  deleteZoom: (id: string) => void;
  selectedZoomId: string | null;
  onSelectZoom: (id: string) => void;
  updateWebcam: (patch: Partial<WebcamStyle>, transient?: boolean) => void;
  updateScreen: (patch: Partial<LayerTransform>, transient?: boolean) => void;
  /** Multicam: set the layout from the playhead on; remove a switch; layout at the playhead. */
  switchScene: (layout: SceneLayout) => void;
  removeScene: (id: string) => void;
  sceneNow: SceneLayout;
  /** Moves the playhead to a source time. */
  onSeekSource: (sourceMs: number) => void;
  /** Object URL of the uploaded background image, if any. */
  backgroundImageUrl: string | null;
  onBackgroundImage: (file: File) => void;
  addAnnotation: (kind: AnnotationKind) => void;
  editAnnotation: (id: string, patch: Partial<Annotation>, transient?: boolean) => void;
  deleteAnnotation: (id: string) => void;
  addImageAnnotation: (file: File) => void;
  /** Adds a music / voice-over file at the playhead. */
  addAudioTrack: (file: File) => void;
  /** Current playhead (output ms). */
  playheadMs: number;
  audioError: string | null;
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string | null) => void;
}

export function PropertiesPanel(p: PanelProps) {
  return (
    <aside className="w-full shrink-0 overflow-y-auto border-l border-line bg-white p-4 md:w-72" aria-label="Properties">
      {p.tool === "trim" && <TrimPanel {...p} />}
      {p.tool === "crop" && <CropPanel {...p} />}
      {p.tool === "background" && <BackgroundPanel {...p} />}
      {p.tool === "screen" && <ScreenPanel {...p} />}
      {p.tool === "webcam" && <WebcamPanel {...p} />}
      {p.tool === "layout" && <LayoutPanel {...p} />}
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

export function Chips<T extends string>({
  label,
  value,
  options,
  onPick,
  disabled = false,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onPick: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          aria-label={`${label}: ${text}`}
          disabled={disabled}
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
  const selectedClip = project.clips.find((c) => c.id === selectedId) ?? null;
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
      <Section
        title="Speed"
        hint={selectedClip ? "Speeds up or slows down the selected clip. Voices keep their pitch." : "Select a clip (or split one first) to change its speed."}
      >
        <Chips
          label="Clip speed"
          value={String(selectedClip ? clipSpeed(selectedClip) : 1)}
          options={SPEEDS.map((v) => [String(v), `${v}×`] as [string, string])}
          onPick={(v) => selectedClip && update({ clips: setClipSpeed(project.clips, selectedClip.id, Number(v)) })}
          disabled={!selectedClip}
        />
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
                  {clipSpeed(c) !== 1 && <b className="mr-1 text-primary-strong">{clipSpeed(c)}×</b>}
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

function BackgroundPanel({ project, update, live, liveStart, liveEnd, backgroundImageUrl, onBackgroundImage }: PanelProps) {
  const visible = project.padding > 0 || project.aspect !== "source";
  const tile = (selected: boolean) =>
    cx("aspect-square rounded-chip border-2", selected ? "border-primary ring-2 ring-primary/30" : "border-line");
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
              style={{ background: swatchCss(b) }}
            />
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={project.background === BG_BLURRED}
            aria-label="Background: Blurred video"
            title="Blurred video"
            onClick={() => update({ background: BG_BLURRED })}
            className={cx(tile(project.background === BG_BLURRED), "grid place-items-center bg-gradient-to-br from-slate-300 to-slate-500 text-white")}
          >
            <Droplets className="size-4" />
          </button>
          <label
            role="radio"
            aria-checked={project.background === BG_IMAGE}
            aria-label="Background: Your image"
            title={backgroundImageUrl ? "Your image (click to replace)" : "Upload an image"}
            className={cx(tile(project.background === BG_IMAGE), "grid cursor-pointer place-items-center overflow-hidden bg-subtle bg-cover bg-center text-muted")}
            style={backgroundImageUrl ? { backgroundImage: `url(${backgroundImageUrl})` } : undefined}
            onClick={(e) => {
              if (backgroundImageUrl && project.background !== BG_IMAGE) {
                e.preventDefault();
                update({ background: BG_IMAGE });
              }
            }}
          >
            {!backgroundImageUrl && <ImagePlus className="size-4" />}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              data-testid="background-upload"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onBackgroundImage(f);
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-faint">Your image stays on this device with the recording.</p>
        <div className="mt-3">
          <Slider
            label="Background blur"
            value={project.backgroundBlur ?? 0}
            min={0}
            max={1}
            step={0.05}
            format={(v) => (v === 0 ? "Off" : `${Math.round(v * 100)}%`)}
            onChange={(backgroundBlur) => live({ backgroundBlur })}
            onStart={liveStart}
            onEnd={liveEnd}
          />
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

function AudioPanel({ project, update, live, liveStart, liveEnd, hasAudio, addAudioTrack, playheadMs, audioError }: PanelProps) {
  const tracks = project.audioTracks ?? [];
  const editTrack = (id: string, patch: Partial<AudioTrack>, transient = false) =>
    (transient ? live : update)({ audioTracks: tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  return (
    <>
      <Section title="Recording audio" hint={hasAudio ? "Mic and system audio, mixed together." : undefined}>
        {hasAudio ? (
          <>
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
          </>
        ) : (
          <p className="text-sm text-muted">This recording has no audio.</p>
        )}
      </Section>
      <Section title={`Music & voice-over (${tracks.length})`} hint="Added at the playhead. Plays over the edited video, across cuts.">
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-subtle">
          <Music className="size-3.5" /> Add audio file
          <input
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.webm"
            className="sr-only"
            data-testid="add-audio-track"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) addAudioTrack(f);
            }}
          />
        </label>
        {audioError && <p className="mt-2 text-xs text-danger">{audioError}</p>}
        <ol className="mt-3 space-y-3" data-testid="audio-tracks">
          {tracks.map((t) => (
            <li key={t.id} className="rounded-control border border-line p-3">
              <p className="mb-1 truncate text-xs font-semibold" title={t.name}>
                {t.name}
              </p>
              <p className="mb-2 text-[11px] text-muted tabular-nums">
                Starts at {formatDuration(t.start)} · {formatDuration(t.durationMs)} long{t.loop ? ", repeating" : ""}
              </p>
              <Slider
                label={`Volume: ${t.name}`}
                value={t.volume}
                min={0}
                max={1}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(volume) => editTrack(t.id, { volume }, true)}
                onStart={liveStart}
                onEnd={liveEnd}
              />
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted">Repeat to the end</span>
                <Toggle label={`Repeat ${t.name}`} checked={t.loop} onChange={(loop) => editTrack(t.id, { loop })} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => editTrack(t.id, { start: Math.round(playheadMs) })}>
                  Start at playhead
                </Button>
                <Button size="sm" variant="ghost" onClick={() => update({ audioTracks: tracks.filter((x) => x.id !== t.id) })}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ol>
        {tracks.length === 0 && <p className="text-xs text-muted">MP3, M4A, WAV or OGG. The file stays on this device.</p>}
      </Section>
    </>
  );
}

function ZoomPanel(p: PanelProps) {
  const z = p.project.zoom;
  const selected = z.segments.find((s) => s.id === p.selectedZoomId) ?? null;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <>
      <Section title="Zoom" hint="Zooms are added by you, at the playhead. Each one holds a steady view.">
        <Button size="sm" variant="secondary" onClick={p.addZoom}>
          <ZoomIn className="size-4" /> Add zoom at playhead
        </Button>
        <p className="mt-1.5 text-[11px] text-faint">Shortcut: Z. Drag a zoom on the timeline to move it; drag its edges to change how long it lasts.</p>
      </Section>

      {selected && (
        <Section title="Selected zoom" hint="Tip: click the preview to centre the zoom on that spot.">
          <div data-testid="zoom-controls">
            <Slider
              label="Zoom amount"
              value={selected.level}
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.05}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(level) => p.editZoom(selected.id, { level }, true)}
              onStart={p.liveStart}
              onEnd={p.liveEnd}
            />
            <Slider
              label="Horizontal position"
              value={selected.x}
              min={0}
              max={1}
              step={0.005}
              format={pct}
              onChange={(x) => p.editZoom(selected.id, { x }, true)}
              onStart={p.liveStart}
              onEnd={p.liveEnd}
            />
            <Slider
              label="Vertical position"
              value={selected.y}
              min={0}
              max={1}
              step={0.005}
              format={pct}
              onChange={(y) => p.editZoom(selected.id, { y }, true)}
              onStart={p.liveStart}
              onEnd={p.liveEnd}
            />
            <p className="mb-3 text-xs text-muted tabular-nums">
              {formatDuration(selected.start)}–{formatDuration(selected.end)} of the recording
            </p>
            <Button size="sm" variant="ghost" onClick={() => p.deleteZoom(selected.id)}>
              Delete zoom
            </Button>
          </div>
        </Section>
      )}

      <Section title="Zoom style">
        <Slider
          label="Default amount for new zooms"
          value={z.level}
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={0.05}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(level) => p.updateZoom({ level }, { transient: true })}
          onStart={p.liveStart}
          onEnd={p.liveEnd}
        />
        <Slider
          label="Transition"
          value={z.transitionMs}
          min={0}
          max={1500}
          step={50}
          format={(v) => (v === 0 ? "Cut" : `${(v / 1000).toFixed(2)} s`)}
          onChange={(transitionMs) => p.updateZoom({ transitionMs }, { transient: true })}
          onStart={p.liveStart}
          onEnd={p.liveEnd}
        />
      </Section>

      <Section title={`Zooms (${z.segments.length})`}>
        {z.segments.length === 0 ? (
          <p className="text-xs text-muted">No zooms yet.</p>
        ) : (
          <ol className="space-y-1" data-testid="zoom-list">
            {z.segments.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => p.onSelectZoom(s.id)}
                  className={cx(
                    "flex w-full items-center justify-between rounded-chip px-2.5 py-1.5 text-left text-xs",
                    s.id === p.selectedZoomId ? "bg-primary-light text-primary-strong" : "hover:bg-subtle",
                  )}
                >
                  <span className="font-medium">
                    Zoom {i + 1} · {s.level.toFixed(2)}×
                  </span>
                  <span className="text-muted tabular-nums">
                    {formatDuration(s.start)}–{formatDuration(s.end)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

function ScreenPanel({ project, update, live, liveStart, liveEnd, updateScreen }: PanelProps) {
  const t = { ...DEFAULT_SCREEN, ...project.screen };
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const signedPct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
  return (
    <>
      <Section title="Screen" hint="Size, position, opacity, rotation and corners of the screen recording.">
        <Slider label="Size" value={t.scale} min={0.3} max={1.5} step={0.01} format={pct} onChange={(scale) => updateScreen({ scale }, true)} onStart={liveStart} onEnd={liveEnd} />
        <Slider label="Horizontal position" value={t.x} min={-0.5} max={0.5} step={0.005} format={signedPct} onChange={(x) => updateScreen({ x }, true)} onStart={liveStart} onEnd={liveEnd} />
        <Slider label="Vertical position" value={t.y} min={-0.5} max={0.5} step={0.005} format={signedPct} onChange={(y) => updateScreen({ y }, true)} onStart={liveStart} onEnd={liveEnd} />
        <Slider label="Opacity" value={t.opacity} min={0} max={1} step={0.01} format={pct} onChange={(opacity) => updateScreen({ opacity }, true)} onStart={liveStart} onEnd={liveEnd} />
        <Slider label="Rotation" value={t.rotation} min={-180} max={180} step={1} format={(v) => `${v}°`} onChange={(rotation) => updateScreen({ rotation }, true)} onStart={liveStart} onEnd={liveEnd} />
        <Slider
          label="Corner curve"
          value={project.radius}
          min={0}
          max={0.06}
          step={0.002}
          format={(v) => `${Math.round((v / 0.06) * 100)}%`}
          onChange={(radius) => live({ radius })}
          onStart={liveStart}
          onEnd={liveEnd}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Shadow</span>
          <Toggle label="Screen shadow" checked={project.shadow} onChange={(shadow) => update({ shadow })} />
        </div>
        <Button size="sm" variant="ghost" className="mt-3" onClick={() => update({ screen: { ...DEFAULT_SCREEN } })}>
          Reset screen
        </Button>
      </Section>
    </>
  );
}

const SCENE_KEYS: Record<SceneLayout, string> = { pip: "1", camera: "2", screen: "3" };

function LayoutPanel({ project, hasCamera, switchScene, removeScene, sceneNow, onSeekSource }: PanelProps) {
  if (!hasCamera) {
    return (
      <Section title="Layout">
        <p className="text-sm text-muted">This recording has no webcam track, so there is only the screen. Turn on the webcam before recording to switch between screen and webcam here.</p>
      </Section>
    );
  }
  const cuts = project.scenes ?? [];
  return (
    <>
      <Section title="Layout" hint="Switch what's on screen from the playhead onwards, like a multicam edit. Shortcuts: 1, 2, 3.">
        <div className="grid gap-2" role="radiogroup" aria-label="Layout at the playhead">
          {(["pip", "camera", "screen"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={sceneNow === l}
              onClick={() => switchScene(l)}
              className={cx(
                "flex items-center justify-between rounded-control border-2 px-3 py-2.5 text-left text-sm font-semibold",
                sceneNow === l ? "border-primary bg-primary-surface text-primary-strong" : "border-line hover:bg-subtle",
              )}
            >
              <span className="flex items-center gap-2">
                <SceneIcon layout={l} /> {SCENE_LABEL[l]}
              </span>
              <kbd className="rounded border border-line bg-white px-1.5 text-[11px] font-medium text-muted">{SCENE_KEYS[l]}</kbd>
            </button>
          ))}
        </div>
      </Section>
      <Section title={`Switches (${cuts.length})`}>
        {cuts.length === 0 ? (
          <p className="text-xs text-muted">The whole video shows {SCENE_LABEL.pip.toLowerCase()}. Move the playhead and pick a layout to switch.</p>
        ) : (
          <ol className="space-y-1" data-testid="scene-list">
            {cuts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-chip px-2.5 py-1.5 text-xs hover:bg-subtle">
                <button type="button" className="flex-1 text-left" onClick={() => onSeekSource(c.at)}>
                  <span className="font-medium">{SCENE_LABEL[c.layout]}</span>
                  <span className="ml-2 text-muted tabular-nums">from {formatDuration(c.at)}</span>
                </button>
                <button type="button" onClick={() => removeScene(c.id)} aria-label={`Remove switch at ${formatDuration(c.at)}`} className="text-muted hover:text-ink">
                  Remove
                </button>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

function SceneIcon({ layout }: { layout: SceneLayout }) {
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6" aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="15" rx="2" fill="none" stroke="currentColor" />
      {layout !== "camera" && <rect x="3" y="3" width="18" height="10" rx="1" fill="currentColor" opacity="0.25" />}
      {layout === "pip" && <circle cx="18" cy="11" r="3" fill="currentColor" />}
      {layout === "camera" && <circle cx="12" cy="8" r="4.5" fill="currentColor" />}
    </svg>
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
      <Section title="Webcam" hint="Its own shape, size, position, opacity, rotation and corners. You can also drag it on the preview.">
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
          <Slider label="Horizontal position" value={w.x} min={0} max={1} step={0.005} format={(v) => `${Math.round(v * 100)}%`} onChange={(x) => updateWebcam({ x }, true)} onStart={liveStart} onEnd={liveEnd} />
          <Slider label="Vertical position" value={w.y} min={0} max={1} step={0.005} format={(v) => `${Math.round(v * 100)}%`} onChange={(y) => updateWebcam({ y }, true)} onStart={liveStart} onEnd={liveEnd} />
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
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Mirror</span>
            <Toggle label="Mirror webcam" checked={w.mirror} onChange={(mirror) => updateWebcam({ mirror })} />
          </div>
          <Slider label="Webcam opacity" value={w.opacity ?? 1} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => updateWebcam({ opacity }, true)} onStart={liveStart} onEnd={liveEnd} />
          <Slider label="Webcam rotation" value={w.rotation ?? 0} min={-180} max={180} step={1} format={(v) => `${v}°`} onChange={(rotation) => updateWebcam({ rotation }, true)} onStart={liveStart} onEnd={liveEnd} />
          <div className={cx(w.shape === "circle" && "pointer-events-none opacity-50")}>
            <Slider label="Corner curve" value={w.roundness} min={0} max={0.5} step={0.01} format={(v) => `${Math.round(v * 200)}%`} onChange={(roundness) => updateWebcam({ roundness }, true)} onStart={liveStart} onEnd={liveEnd} />
          </div>
          <Slider label="Edge margin" value={w.margin} min={0} max={0.12} step={0.005} format={(v) => `${Math.round(v * 1000) / 10}%`} onChange={(margin) => updateWebcam({ margin }, true)} onStart={liveStart} onEnd={liveEnd} />
        </div>
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
  /** Adds an image annotation from a file (logo, sticker, screenshot). Hidden when not provided. */
  onAddImage?: (file: File) => void;
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
      onAddImage={p.addImageAnnotation}
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
          {p.onAddImage && (
            <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-subtle">
              <ImagePlus className="size-3.5" /> Image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                className="sr-only"
                data-testid="add-image-annotation"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) p.onAddImage?.(f);
                }}
              />
            </label>
          )}
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
          {a.kind === "image" && <p className="mb-3 text-xs text-muted">Drag it on the preview to move it; drag a corner to resize. The image stays on this device.</p>}
          {a.kind !== "blur" && a.kind !== "image" && (
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

/** CSS approximation of a background preset, for its swatch. */
function swatchCss(b: BackgroundPreset): string {
  const base = b.stops.length === 1 ? b.stops[0] : `linear-gradient(135deg, ${b.stops[0]}, ${b.stops[1]})`;
  if (!b.blobs) return base;
  const blobs = b.blobs.map(([x, y, r, c]) => `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${c} 0, transparent ${Math.round(r * 140)}%)`);
  return [...blobs, base].join(", ");
}
