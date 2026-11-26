"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AppWindow, Camera, Globe, Info, LoaderCircle, Mic, Monitor, Timer, Volume2 } from "lucide-react";
import { createLevelMeter, type DeviceLists, type RecorderCapabilities } from "@/engines/recorder";
import type { DisplaySurfaceHint, WebcamPosition, WebcamShape, WebcamSize } from "@/engines/shared/types";
import { MediaFrame, WebcamBubble } from "../media-frame";
import { Button, Card, Notice, Select, Toggle, cx } from "../ui";
import { SETUP_BLOCK_MINUTES, SETUP_WARN_MINUTES } from "@/lib/storage-budget";
import type { SetupPrefs } from "./prefs";

const SOURCES: { value: DisplaySurfaceHint; title: string; text: string; icon: typeof Monitor }[] = [
  { value: "monitor", title: "Entire screen", text: "Record everything on a display", icon: Monitor },
  { value: "window", title: "Window", text: "Record one application window", icon: AppWindow },
  { value: "browser", title: "Browser tab", text: "Record a single tab", icon: Globe },
];

export interface SetupPanelProps {
  caps: RecorderCapabilities;
  prefs: SetupPrefs;
  update: (patch: Partial<SetupPrefs>) => void;
  devices: DeviceLists;
  micStream: MediaStream | null;
  camStream: MediaStream | null;
  micStatus: string | null;
  camStatus: string | null;
  micLoading: boolean;
  camLoading: boolean;
  error: string | null;
  starting: boolean;
  onStart: () => void;
  /** Estimated minutes of recording that fit in free browser storage. */
  space: { minutes: number } | null;
}

export function SetupPanel(p: SetupPanelProps) {
  const { caps, prefs, update } = p;
  const spaceBlocked = !!p.space && p.space.minutes < SETUP_BLOCK_MINUTES;
  const spaceLow = !!p.space && p.space.minutes < SETUP_WARN_MINUTES;
  const systemAudioAvailable =
    (prefs.surface === "browser" && caps.tabAudio) || (prefs.surface === "monitor" && caps.screenAudio);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight">What would you like to record?</h1>
      <p className="mt-1 text-sm text-muted">
        {caps.surfaceHint
          ? "Pick a source. Your browser will then ask you to choose exactly which screen, window or tab to share."
          : "Your browser will ask you to choose exactly what to share."}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div role="radiogroup" aria-label="Recording source" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SOURCES.map(({ value, title, text, icon: Icon }) => {
              const selected = prefs.surface === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => update({ surface: value })}
                  className={cx(
                    "flex flex-col items-center rounded-card border-2 bg-white px-4 py-5 text-center transition-colors",
                    selected ? "border-primary bg-primary-surface" : "border-line hover:border-primary/40",
                  )}
                >
                  <Icon className={cx("size-7", selected ? "text-primary" : "text-muted")} strokeWidth={1.75} />
                  <span className="mt-2 text-sm font-semibold">{title}</span>
                  <span className="mt-0.5 text-xs text-muted">{text}</span>
                </button>
              );
            })}
          </div>

          <Card className="divide-y divide-line">
            <OptionRow
              icon={<Camera className="size-5" />}
              title="Webcam"
              text={p.camStatus ?? "Record yourself (saved as a separate track)"}
              control={
                <div className="flex items-center gap-2">
                  {p.camLoading && <LoaderCircle className="size-4 animate-spin text-muted" />}
                  <Toggle label="Webcam" checked={prefs.camera} onChange={(camera) => update({ camera })} disabled={!caps.userMedia} />
                </div>
              }
            >
              {prefs.camera && p.devices.cameras.length > 1 && (
                <Select
                  label="Camera"
                  value={prefs.cameraId || p.camStream?.getVideoTracks()[0]?.getSettings().deviceId || ""}
                  onChange={(cameraId) => update({ cameraId })}
                  options={p.devices.cameras.map((d) => ({ value: d.deviceId, label: d.label }))}
                />
              )}
            </OptionRow>

            <OptionRow
              icon={<Mic className="size-5" />}
              title="Microphone"
              text={p.micStatus ?? "Record your voice"}
              control={
                <div className="flex items-center gap-2">
                  {p.micLoading && <LoaderCircle className="size-4 animate-spin text-muted" />}
                  <Toggle label="Microphone" checked={prefs.mic} onChange={(mic) => update({ mic })} disabled={!caps.userMedia} />
                </div>
              }
            >
              {prefs.mic && (
                <div className="space-y-2">
                  {p.devices.microphones.length > 1 && (
                    <Select
                      label="Microphone device"
                      value={prefs.micId || p.micStream?.getAudioTracks()[0]?.getSettings().deviceId || ""}
                      onChange={(micId) => update({ micId })}
                      options={p.devices.microphones.map((d) => ({ value: d.deviceId, label: d.label }))}
                    />
                  )}
                  {p.micStream && <MicMeter stream={p.micStream} />}
                </div>
              )}
            </OptionRow>

            <OptionRow
              icon={<Volume2 className="size-5" />}
              title="System audio"
              text={
                systemAudioAvailable
                  ? prefs.surface === "browser"
                    ? "Record the tab's sound. Tick “Share tab audio” in the browser dialog."
                    : "Record computer sound. Tick “Share system audio” in the browser dialog."
                  : systemAudioHint(prefs.surface, caps)
              }
              control={
                <Toggle
                  label="System audio"
                  checked={prefs.systemAudio && systemAudioAvailable}
                  onChange={(systemAudio) => update({ systemAudio })}
                  disabled={!systemAudioAvailable}
                />
              }
            />

            <OptionRow
              icon={<Timer className="size-5" />}
              title="3-second countdown"
              text="Gives you a moment to get ready"
              control={<Toggle label="Countdown" checked={prefs.countdown} onChange={(countdown) => update({ countdown })} />}
            />
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold">Camera preview</p>
            <MediaFrame aspect={16 / 9} maxHeight="200px" className="bg-gradient-to-br from-slate-200 to-slate-300">
              <div className="absolute inset-[8%] rounded-lg bg-white/70" />
              {prefs.camera && p.camStream ? (
                <WebcamBubble layout={prefs.webcam} stream={p.camStream} />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-xs text-muted">
                  {prefs.camera ? "Waiting for camera…" : "Webcam is off"}
                </div>
              )}
            </MediaFrame>

            <div className={cx("mt-4 space-y-3", !prefs.camera && "pointer-events-none opacity-50")} aria-disabled={!prefs.camera}>
              <Segmented
                label="Position"
                value={prefs.webcam.position}
                onChange={(position: WebcamPosition) => update({ webcam: { ...prefs.webcam, position } })}
                options={[
                  { value: "top-left", label: "↖" },
                  { value: "top-right", label: "↗" },
                  { value: "bottom-left", label: "↙" },
                  { value: "bottom-right", label: "↘" },
                ]}
              />
              <Segmented
                label="Size"
                value={prefs.webcam.size}
                onChange={(size: WebcamSize) => update({ webcam: { ...prefs.webcam, size } })}
                options={[
                  { value: "small", label: "S" },
                  { value: "medium", label: "M" },
                  { value: "large", label: "L" },
                ]}
              />
              <Segmented
                label="Shape"
                value={prefs.webcam.shape}
                onChange={(shape: WebcamShape) => update({ webcam: { ...prefs.webcam, shape } })}
                options={[
                  { value: "circle", label: "Circle" },
                  { value: "rounded", label: "Rounded" },
                ]}
              />
              <p className="text-xs text-muted">The webcam is saved separately, so you can still change this after recording.</p>
            </div>
          </Card>

          {p.error && <Notice tone="error">{p.error}</Notice>}
          {spaceBlocked && (
            <Notice tone="error" title="Not enough storage space">
              Browser storage has room for less than a minute of recording. Delete old recordings or free up disk space, then
              try again.
            </Notice>
          )}
          {!spaceBlocked && spaceLow && (
            <Notice tone="warn" title="Storage is running low">
              There&apos;s room for about {Math.floor(p.space!.minutes)} minutes of recording. It will stop automatically and
              save before space runs out.
            </Notice>
          )}

          <Button size="lg" className="w-full" onClick={p.onStart} disabled={p.starting || !caps.canRecord || spaceBlocked}>
            {p.starting ? <LoaderCircle className="size-5 animate-spin" /> : <span className="size-3 rounded-full bg-white" />}
            {p.starting ? "Choose what to share…" : "Start recording"}
          </Button>
          <p className="flex gap-2 text-xs text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Nothing is recorded until you pick what to share in your browser&apos;s dialog. Recordings are saved only on this
            device, second by second, so they survive a crash.
          </p>
          {p.space && !spaceLow && (
            <p className="text-xs text-faint" data-testid="space-estimate">
              Space for about {formatMinutes(p.space.minutes)} of recording.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function systemAudioHint(surface: DisplaySurfaceHint, caps: RecorderCapabilities): string {
  if (surface === "window") return "Browsers can't capture audio from a single window. Choose a tab or the entire screen.";
  if (!caps.tabAudio) return "This browser can't capture system or tab audio. Try Chrome or Edge.";
  if (surface === "monitor") return "Whole-screen audio is only available on Windows and ChromeOS. Choose a tab instead.";
  return "Not available in this browser.";
}

function OptionRow({
  icon,
  title,
  text,
  control,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  control: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex items-center gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-control bg-subtle text-muted">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted">{text}</p>
        </div>
        {control}
      </div>
      {children && <div className="mt-3 sm:pl-14">{children}</div>}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-chip bg-subtle p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            aria-label={`${label}: ${o.value}`}
            onClick={() => onChange(o.value)}
            className={cx(
              "min-w-9 rounded-[6px] px-2 py-1 text-xs font-medium",
              value === o.value ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MicMeter({ stream }: { stream: MediaStream }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const meter = createLevelMeter(stream, (level) => {
      if (bar.current) bar.current.style.width = `${Math.round(level * 100)}%`;
    });
    return () => meter.stop();
  }, [stream]);
  return (
    <div className="flex items-center gap-2" aria-label="Microphone level">
      <span className="text-xs text-muted">Level</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div ref={bar} className="h-full w-0 rounded-full bg-primary transition-[width] duration-75" />
      </div>
    </div>
  );
}

function formatMinutes(min: number): string {
  if (min >= 120) return `${Math.floor(min / 60)} hours`;
  return `${Math.floor(min)} minutes`;
}
