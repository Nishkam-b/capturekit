import type { CursorKind, CursorTelemetryProvider } from "./types";

/**
 * Talks to the CaptureKit Cursor Tracker extension through its content-script
 * bridge (window.postMessage on this page). See /extension.
 */

const FROM_APP = "capturekit:app";
const FROM_EXT = "capturekit:ext";

type ExtMessage =
  | { type: "hello"; version: string }
  | { type: "armed"; count: number }
  | { type: "tracking"; tabId: number }
  | { type: "events"; events: Array<[number, number, number, number]> }
  | { type: "zoom-marker" }
  | { type: "disconnected" };

function send(msg: Record<string, unknown>) {
  window.postMessage({ [FROM_APP]: true, ...msg }, window.location.origin);
}

function listen(handler: (m: ExtMessage) => void): () => void {
  const onMessage = (e: MessageEvent) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const d = e.data as Record<string, unknown> | null;
    if (!d || d[FROM_EXT] !== true || typeof d.type !== "string") return;
    handler(d as unknown as ExtMessage);
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

/** Calls back when the extension's "zoom here" shortcut is pressed in any tab. */
export function onExtensionZoomMarker(handler: () => void): () => void {
  return listen((m) => {
    if (m.type === "zoom-marker") handler();
  });
}

/** Resolves with the extension version, or null if it isn't installed / enabled for this page. */
export function detectExtension(timeoutMs = 700): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const stop = listen((m) => {
      if (m.type === "hello") {
        clearTimeout(t);
        stop();
        resolve(m.version);
      }
    });
    const t = setTimeout(() => {
      stop();
      resolve(null);
    }, timeoutMs);
    send({ type: "hello" });
  });
}

type CaptureHandleTrack = MediaStreamTrack & { getCaptureHandle?: () => { handle?: string } | null };

export type ExtensionStartFailure = "not-a-tab" | "no-handle-support" | "tab-not-found";

export class ExtensionCursorProvider implements CursorTelemetryProvider {
  readonly source = "extension" as const;
  private unlisten: (() => void) | null = null;
  private track: CaptureHandleTrack | null = null;
  private onHandleChange: (() => void) | null = null;
  /** Why start() returned false, for a helpful message. */
  failure: ExtensionStartFailure | null = null;

  async start(
    mediaTrack: MediaStreamTrack,
    onEvents: (events: Array<{ perfMs: number; x: number; y: number; kind: CursorKind }>) => void,
    timeoutMs = 4000,
  ): Promise<boolean> {
    const track = mediaTrack as CaptureHandleTrack;
    const surface = (track.getSettings() as { displaySurface?: string }).displaySurface;
    if (surface && surface !== "browser") {
      this.failure = "not-a-tab";
      return false;
    }
    if (typeof track.getCaptureHandle !== "function") {
      this.failure = "no-handle-support";
      return false;
    }
    this.track = track;
    const nonce = Math.random().toString(36).slice(2, 12);
    const prefix = `capturekit:${nonce}:`;

    this.unlisten = listen((m) => {
      if (m.type !== "events") return;
      const origin = performance.timeOrigin;
      const out: Array<{ perfMs: number; x: number; y: number; kind: CursorKind }> = [];
      for (const e of m.events) {
        if (!Array.isArray(e) || e.length < 4) continue;
        const [t, x, y, k] = e;
        if (![t, x, y, k].every(Number.isFinite) || k < 0 || k > 3) continue;
        out.push({ perfMs: t - origin, x: clamp01(x), y: clamp01(y), kind: k as CursorKind });
      }
      if (out.length) onEvents(out);
    });

    const tabId = await new Promise<number | null>((resolve) => {
      const check = () => {
        const h = track.getCaptureHandle?.()?.handle;
        if (h && h.startsWith(prefix)) {
          const id = Number(h.slice(prefix.length));
          if (Number.isInteger(id)) {
            done(id);
            return true;
          }
        }
        return false;
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      const onChange = () => void check();
      const done = (v: number | null) => {
        clearTimeout(timer);
        track.removeEventListener("capturehandlechange", onChange);
        resolve(v);
      };
      track.addEventListener("capturehandlechange", onChange);
      this.onHandleChange = onChange;
      send({ type: "arm", nonce });
      check();
    });

    if (tabId === null) {
      this.failure = "tab-not-found";
      this.stop();
      return false;
    }
    send({ type: "track", tabId });
    return true;
  }

  stop(): void {
    send({ type: "stop" });
    this.unlisten?.();
    this.unlisten = null;
    if (this.track && this.onHandleChange) this.track.removeEventListener("capturehandlechange", this.onHandleChange);
    this.track = null;
  }
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}
