"use client";

/* eslint-disable react-hooks/set-state-in-effect -- media acquisition is inherently effect-driven */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, LoaderCircle, PictureInPicture2, X } from "lucide-react";
import {
  RecordingSession,
  describeMediaError,
  getCameraStream,
  getMicrophoneStream,
  grabTrackFrame,
  listDevices,
  requestDisplayStream,
  stopStream,
  type DeviceLists,
  type SessionResult,
  type SessionState,
} from "@/engines/recorder";
import { createId, extensionForMime, formatDuration, toFileStem, defaultRecordingName } from "@/engines/shared/format";
import { deleteRecording } from "@/engines/storage/db";
import { StorageSink, lockName } from "@/engines/storage/recording-store";
import { AUTO_STOP_SECONDS, LOW_SPACE_SECONDS, expectedBytesPerSecond, freeBytes, secondsLeft } from "@/lib/storage-budget";
import { ExtensionCursorProvider, detectExtension, onExtensionZoomMarker } from "@/engines/cursor/extension-provider";
import { CursorRecorder } from "@/lib/cursor-recorder";
import { useCapabilities } from "@/hooks/use-capabilities";
import { persistSession, type CapturedScreenshot } from "@/lib/save-recording";
import { Logo } from "../app-shell";
import { LiveVideo, MediaFrame, WebcamBubble } from "../media-frame";
import { Button, Notice } from "../ui";
import { PipPortal, RecordingControls, openPipWindow, useElapsed, type ControlsProps } from "./controls";
import { DEFAULT_PREFS, loadPrefs, permissionState, savePrefs, type SetupPrefs } from "./prefs";
import { SetupPanel } from "./setup-panel";

type Phase = "setup" | "countdown" | "recording" | "saving" | "failed";

export function RecordFlow() {
  const caps = useCapabilities();
  const router = useRouter();
  const mounted = useRef(true);

  const [prefs, setPrefs] = useState<SetupPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [devices, setDevices] = useState<DeviceLists>({ microphones: [], cameras: [] });

  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const [micStatus, setMicStatus] = useState<string | null>(null);
  const [camStatus, setCamStatus] = useState<string | null>(null);
  const [micLoading, setMicLoading] = useState(false);
  const [camLoading, setCamLoading] = useState(false);
  /** Bumped to re-acquire devices after a session consumed (and stopped) them. */
  const [streamEpoch, setStreamEpoch] = useState(0);
  /** Streams owned by a session: setup effects must not stop them. */
  const handedOff = useRef(new Set<MediaStream>());

  const [phase, setPhase] = useState<Phase>("setup");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>("ready");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [micMuted, setMicMuted] = useState(false);
  const [shotCount, setShotCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [unsaved, setUnsaved] = useState<{ result: SessionResult; message: string } | null>(null);
  /** Screenshots that couldn't be written to storage during recording. */
  const shotFallback = useRef<CapturedScreenshot[]>([]);
  const shotCountRef = useRef(0);
  const sinkRef = useRef<StorageSink | null>(null);
  const recIdRef = useRef<string | null>(null);
  const releaseLock = useRef<(() => void) | null>(null);
  const lastQuotaCheck = useRef(0);
  const lowSpaceWarned = useRef(false);
  const [setupSpace, setSetupSpace] = useState<{ minutes: number } | null>(null);
  /** Cursor extension version; undefined while checking, null if not installed. */
  const [extVersion, setExtVersion] = useState<string | null | undefined>(undefined);
  const [cursorStatus, setCursorStatus] = useState<"off" | "connecting" | "on" | "failed" | "unsupported">("off");
  const providerRef = useRef<ExtensionCursorProvider | null>(null);
  const cursorRecRef = useRef<CursorRecorder | null>(null);
  const startedAt = useRef<Date | null>(null);
  const zoomMarkersRef = useRef<number[]>([]);
  const [zoomMarkerCount, setZoomMarkerCount] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ---- Preferences: only re-enable mic/camera automatically if permission is already granted.
  useEffect(() => {
    let cancelled = false;
    const saved = loadPrefs();
    void Promise.all([permissionState("microphone"), permissionState("camera")]).then(([mic, cam]) => {
      if (cancelled) return;
      setPrefs({ ...saved, mic: saved.mic && mic === "granted", camera: saved.camera && cam === "granted" });
      setPrefsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<SetupPrefs>) => {
    if (patch.mic !== undefined) setMicStatus(null);
    if (patch.camera !== undefined) setCamStatus(null);
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  // ---- Device list
  useEffect(() => {
    if (!caps?.userMedia) return;
    const refresh = () => void listDevices().then(setDevices).catch(() => undefined);
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, [caps?.userMedia]);

  // ---- Microphone stream (for the meter and the recording)
  useEffect(() => {
    if (!prefsLoaded || !prefs.mic) {
      setMicStream(null);
      return;
    }
    let cancelled = false;
    let acquired: MediaStream | null = null;
    const owned = handedOff.current;
    setMicLoading(true);
    getMicrophoneStream(prefs.micId || undefined)
      .then((s) => {
        if (cancelled) return stopStream(s);
        acquired = s;
        setMicStream(s);
        void listDevices().then(setDevices).catch(() => undefined);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "OverconstrainedError" && prefs.micId) {
          update({ micId: "" }); // saved device is gone: fall back to default
          return;
        }
        setMicStream(null);
        setMicStatus(describeMediaError(err, "microphone"));
        setPrefs((p) => ({ ...p, mic: false }));
      })
      .finally(() => !cancelled && setMicLoading(false));
    return () => {
      cancelled = true;
      if (acquired && !owned.has(acquired)) stopStream(acquired);
    };
  }, [prefsLoaded, prefs.mic, prefs.micId, streamEpoch, update]);

  // ---- Camera stream (for the preview and the recording)
  useEffect(() => {
    if (!prefsLoaded || !prefs.camera) {
      setCamStream(null);
      return;
    }
    let cancelled = false;
    let acquired: MediaStream | null = null;
    const owned = handedOff.current;
    setCamLoading(true);
    getCameraStream(prefs.cameraId || undefined)
      .then((s) => {
        if (cancelled) return stopStream(s);
        acquired = s;
        setCamStream(s);
        void listDevices().then(setDevices).catch(() => undefined);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "OverconstrainedError" && prefs.cameraId) {
          update({ cameraId: "" });
          return;
        }
        setCamStream(null);
        setCamStatus(describeMediaError(err, "camera"));
        setPrefs((p) => ({ ...p, camera: false }));
      })
      .finally(() => !cancelled && setCamLoading(false));
    return () => {
      cancelled = true;
      if (acquired && !owned.has(acquired)) stopStream(acquired);
    };
  }, [prefsLoaded, prefs.camera, prefs.cameraId, streamEpoch, update]);

  const systemAudioAvailable =
    !!caps && ((prefs.surface === "browser" && caps.tabAudio) || (prefs.surface === "monitor" && caps.screenAudio));

  const closePip = useCallback(() => {
    setPipWindow((w) => {
      w?.close();
      return null;
    });
  }, []);

  const openPip = useCallback(async () => {
    try {
      const w = await openPipWindow();
      if (!w) return;
      w.addEventListener("pagehide", () => setPipWindow((cur) => (cur === w ? null : cur)), { once: true });
      setPipWindow(w);
    } catch {
      // Needs a fresh click; the in-page button stays available.
    }
  }, []);

  const resetToSetup = useCallback(() => {
    closePip();
    handedOff.current.clear();
    shotFallback.current = [];
    shotCountRef.current = 0;
    setShotCount(0);
    setWarnings([]);
    setMicMuted(false);
    setSession(null);
    setSessionState("ready");
    setPhase("setup");
    setStreamEpoch((n) => n + 1); // session stopped our mic/camera: get fresh ones
  }, [closePip]);

  // ---- Start: open the browser picker first, straight from the click.
  const onStart = useCallback(async () => {
    if (starting || !caps?.canRecord) return;
    setError(null);
    setStarting(true);
    const wantSystemAudio = prefs.systemAudio && systemAudioAvailable;
    let display: MediaStream;
    try {
      display = await requestDisplayStream({ surface: prefs.surface, systemAudio: wantSystemAudio });
    } catch (err) {
      setStarting(false);
      setError(describeMediaError(err, "screen"));
      return;
    }

    const mic = prefs.mic ? micStream : null;
    const cam = prefs.camera ? camStream : null;
    const id = createId();
    const now = Date.now();
    const ds = display.getVideoTracks()[0]?.getSettings() ?? {};
    const cs = cam?.getVideoTracks()[0]?.getSettings();
    const sink = new StorageSink({
      id,
      startedAt: now,
      updatedAt: now,
      activeMs: 0,
      screen: { mimeType: "", width: ds.width ?? 0, height: ds.height ?? 0, displaySurface: (ds as { displaySurface?: string }).displaySurface ?? null },
      camera: cs ? { mimeType: "", width: cs.width ?? 0, height: cs.height ?? 0 } : null,
      webcam: prefs.webcam,
      audio: { mic: false, system: false },
      screenshots: [],
      bytes: 0,
    });
    let s: RecordingSession;
    try {
      s = new RecordingSession({ display, microphone: mic, camera: cam }, { sink });
    } catch (err) {
      stopStream(display);
      setStarting(false);
      setError(err instanceof Error ? err.message : "Couldn't start recording.");
      return;
    }
    if (mic) handedOff.current.add(mic);
    if (cam) handedOff.current.add(cam);
    sink.describe({
      screen: { ...{ width: ds.width ?? 0, height: ds.height ?? 0 }, mimeType: s.mimeTypes.screen, displaySurface: (ds as { displaySurface?: string }).displaySurface ?? null },
      camera: s.mimeTypes.camera && cs ? { mimeType: s.mimeTypes.camera, width: cs.width ?? 0, height: cs.height ?? 0 } : null,
      audio: { mic: s.hasMic, system: display.getAudioTracks().length > 0 },
    });
    sinkRef.current = sink;
    recIdRef.current = id;
    shotFallback.current = [];
    lastQuotaCheck.current = 0;
    lowSpaceWarned.current = false;

    const notes: string[] = [];
    if (wantSystemAudio && display.getAudioTracks().length === 0) {
      notes.push("System audio isn't being recorded — “Share audio” wasn't selected, or isn't available for what you picked.");
    }
    if (prefs.mic && !mic) notes.push("The microphone wasn't ready, so this recording has no voice track.");
    if (prefs.camera && !cam) notes.push("The webcam wasn't ready, so this recording has no webcam track.");
    setWarnings(notes);

    shotCountRef.current = 0;
    setShotCount(0);
    setMicMuted(false);
    startedAt.current = new Date();
    zoomMarkersRef.current = [];
    setZoomMarkerCount(0);
    setSession(s);
    setSessionState(s.state);
    setStarting(false);

    if (caps.popOutControls && (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive) {
      void openPip();
    }
    // Hold a Web Lock for the whole recording, so crash recovery in other tabs knows it's live.
    releaseLock.current = holdLock(lockName(id));
    try {
      await sink.begin();
    } catch {
      s.warn("Couldn't save to browser storage while recording, so this recording is kept in memory. Keep this tab open until it's saved.");
    }
    // Cursor telemetry (extension, browser tabs only). Runs alongside; never blocks recording.
    cursorRecRef.current = null;
    providerRef.current = null;
    const pickedSurface = (ds as { displaySurface?: string }).displaySurface;
    if (extVersion && pickedSurface === "browser") {
      const provider = new ExtensionCursorProvider();
      const rec = new CursorRecorder(id, s, "extension");
      providerRef.current = provider;
      cursorRecRef.current = rec;
      setCursorStatus("connecting");
      void provider.start(s.displayTrack, (batch) => rec.add(batch)).then((ok) => {
        if (providerRef.current !== provider) return;
        setCursorStatus(ok ? "on" : "failed");
        if (!ok) {
          s.warn(
            provider.failure === "no-handle-support"
              ? "Cursor tracking needs Chrome or Edge 116 or newer, so this recording has no cursor data."
              : "Cursor tracking couldn't identify the shared tab, so this recording has no cursor data. Try reloading that tab before recording.",
          );
        }
      });
    } else if (extVersion && pickedSurface && pickedSurface !== "browser") {
      setCursorStatus("unsupported");
    } else {
      setCursorStatus("off");
    }
    if (prefs.countdown) {
      setCountdown(3);
      setPhase("countdown");
    } else {
      await s.start();
      setPhase("recording");
    }
  }, [starting, caps, prefs, systemAudioAvailable, micStream, camStream, openPip, extVersion]);

  // ---- Is the cursor-tracking extension installed? (re-checked when returning to setup)
  useEffect(() => {
    if (phase !== "setup") return;
    let cancelled = false;
    void detectExtension().then((v) => !cancelled && setExtVersion(v));
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // ---- Countdown
  useEffect(() => {
    if (phase !== "countdown" || !session) return;
    if (countdown <= 0) {
      void session.start().then(() => {
        if (session.state === "recording") setPhase("recording");
      });
      return;
    }
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, session]);

  // ---- Storage budget while recording: runs on each ~1s chunk (not on a timer, which background tabs throttle).
  const checkSpace = useCallback(async (s: RecordingSession, bytes: number, activeMs: number) => {
    const now = Date.now();
    if (now - lastQuotaCheck.current < 5000) return;
    lastQuotaCheck.current = now;
    const free = await freeBytes();
    if (free === null) return;
    const ds = s.displayTrack.getSettings();
    const left = secondsLeft(free, bytes, activeMs, expectedBytesPerSecond(ds.width ?? 1920, ds.height ?? 1080, s.hasCamera));
    if (left < AUTO_STOP_SECONDS && (s.state === "recording" || s.state === "paused")) {
      s.warn("Recording stopped automatically because browser storage was almost full. Everything up to that point is saved.");
      void s.stop();
    } else if (left < LOW_SPACE_SECONDS && !lowSpaceWarned.current) {
      lowSpaceWarned.current = true;
      s.warn(`Browser storage is almost full: about ${Math.max(1, Math.round(left / 60))} min of recording left. It will stop automatically before it runs out.`);
    }
  }, []);

  // ---- Free space shown on the setup screen.
  useEffect(() => {
    if (phase !== "setup") return;
    let cancelled = false;
    void freeBytes().then((free) => {
      if (cancelled) return;
      if (free === null) return setSetupSpace(null);
      const dpr = window.devicePixelRatio || 1;
      const bps = expectedBytesPerSecond(window.screen.width * dpr, window.screen.height * dpr, prefs.camera);
      setSetupSpace({ minutes: free / bps / 60 });
    });
    return () => {
      cancelled = true;
    };
  }, [phase, prefs.camera]);

  // ---- Session lifecycle: state, warnings, and saving when it ends (any cause).
  useEffect(() => {
    if (!session) return;
    const recId = recIdRef.current;
    const sink = sinkRef.current;
    const unsub = session.subscribe((e) => {
      if (e.type === "state") setSessionState(e.state);
      else if (e.type === "warning") setWarnings((w) => (w.includes(e.message) ? w : [...w, e.message]));
      else if (e.type === "storage-error") {
        session.warn(
          isQuotaError(e.error)
            ? "Browser storage is full. The rest of this recording is kept in memory. Stop soon and download it."
            : "Couldn't save part of the recording to browser storage, so it's kept in memory. Keep this tab open until it's saved.",
        );
      } else if (e.type === "progress") {
        void checkSpace(session, e.bytes, e.activeMs);
      }
    });
    const release = () => {
      releaseLock.current?.();
      releaseLock.current = null;
    };
    const stopCursor = async () => {
      providerRef.current?.stop();
      providerRef.current = null;
      const rec = cursorRecRef.current;
      if (rec) await rec.save();
      return rec && rec.count > 0 ? { source: "extension" as const, events: rec.count } : null;
    };
    session.finished.then(
      async (result) => {
        closePip();
        if (mounted.current) setPhase("saving");
        try {
          const cursor = await stopCursor();
          const id = await persistSession({
            id: recId ?? createId(),
            result,
            sink,
            webcam: prefs.webcam,
            memoryShots: shotFallback.current,
            startedAt: startedAt.current ?? new Date(),
            cursor,
            zoomMarkers: zoomMarkersRef.current,
          });
          release();
          // If the user navigated away mid-recording we still save, but don't redirect them.
          // Straight into the editor: zooms, background and framing are applied automatically.
          if (mounted.current) router.push(`/editor?id=${encodeURIComponent(id)}&new=1`);
        } catch (err) {
          release(); // chunks stay in storage and can be recovered from the dashboard
          if (!mounted.current) return;
          setUnsaved({
            result,
            message: err instanceof Error ? err.message : "Saving to browser storage failed.",
          });
          setPhase("failed");
        }
      },
      (err: unknown) => {
        // Cancelled or failed: nothing to keep.
        providerRef.current?.stop();
        providerRef.current = null;
        cursorRecRef.current = null;
        if (recId) void deleteRecording(recId).catch(() => undefined);
        release();
        if (!mounted.current) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          resetToSetup();
        } else {
          closePip();
          setError(err instanceof Error ? err.message : "Recording failed.");
          resetToSetup();
        }
      },
    );
    return () => {
      unsub();
    };
    // prefs.webcam is read at finish time on purpose; it can't change mid-recording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // If the page unmounts mid-recording (e.g. browser back), stop so the data is saved.
  useEffect(() => {
    return () => {
      if (session && (session.state === "recording" || session.state === "paused")) void session.stop();
      else if (session && session.state === "ready") session.cancel();
    };
  }, [session]);

  // ---- Warn before closing the tab while recording.
  const busy = phase === "countdown" || phase === "recording" || phase === "saving";
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  // ---- Elapsed time (main window) + tab title
  const elapsed = useElapsed(phase === "recording" ? session : null, typeof window === "undefined" ? null : window);
  useEffect(() => {
    if (phase !== "recording") return;
    const prev = document.title;
    document.title = `${sessionState === "paused" ? "❚❚" : "●"} ${formatDuration(elapsed)} · Recording`;
    return () => {
      document.title = prev;
    };
  }, [phase, elapsed, sessionState]);

  const takeScreenshot = useCallback(async () => {
    if (!session) return;
    try {
      const video = stageRef.current?.querySelector<HTMLVideoElement>("video[data-role=screen]") ?? null;
      const frame = await grabTrackFrame(session.displayTrack, video);
      const atMs = Math.round(session.elapsedMs());
      const n = shotCountRef.current + 1;
      shotCountRef.current = n;
      setShotCount(n);
      const sink = sinkRef.current;
      const meta = { id: String(n), atMs, width: frame.width, height: frame.height, mimeType: frame.mimeType };
      if (sink) {
        sink.addScreenshot(meta, frame.blob).catch(() => shotFallback.current.push({ ...frame, atMs }));
      } else {
        shotFallback.current.push({ ...frame, atMs });
      }
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
    } catch {
      setWarnings((w) => [...w, "Couldn't take a screenshot just now. Try again in a moment."]);
    }
  }, [session]);

  /** "Zoom here" marks: become manual zoom segments in the editor. */
  const addZoomMarker = useCallback(() => {
    if (!session || session.state !== "recording") return;
    const atMs = Math.round(session.elapsedMs());
    const list = zoomMarkersRef.current;
    if (list.length && atMs - list[list.length - 1] < 400) return; // same press seen twice (page + extension)
    list.push(atMs);
    setZoomMarkerCount(list.length);
  }, [session]);

  // The extension's browser-wide shortcut (works while another tab has focus).
  useEffect(() => {
    if (phase !== "recording") return;
    return onExtensionZoomMarker(addZoomMarker);
  }, [phase, addZoomMarker]);

  // ---- Keyboard shortcuts (work in this tab and in the pop-out controls window).
  useEffect(() => {
    if (phase !== "recording" || !session) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
      if (e.code === "KeyP") {
        e.preventDefault();
        session.togglePause();
      } else if (e.code === "KeyS") {
        e.preventDefault();
        void session.stop();
      } else if (e.code === "KeyC") {
        e.preventDefault();
        void takeScreenshot();
      } else if (e.code === "KeyZ") {
        e.preventDefault();
        addZoomMarker();
      }
    };
    const targets = [window, pipWindow].filter((w): w is Window => !!w);
    targets.forEach((t) => t.addEventListener("keydown", onKey));
    return () => targets.forEach((t) => t.removeEventListener("keydown", onKey));
  }, [phase, session, pipWindow, takeScreenshot, addZoomMarker]);

  const toggleMic = useCallback(() => {
    if (!session) return;
    session.setMicMuted(!session.micMuted);
    setMicMuted(session.micMuted);
  }, [session]);

  const displayPreview = useMemo(() => (session ? new MediaStream([session.displayTrack]) : null), [session]);
  const displayAspect = useMemo(() => {
    const s = session?.displayTrack.getSettings();
    return s?.width && s?.height ? s.width / s.height : 16 / 9;
  }, [session]);

  const controlProps = useMemo<ControlsProps | null>(
    () =>
      session && {
        state: sessionState,
        elapsedMs: elapsed,
        hasMic: session.hasMic,
        micMuted,
        hasCamera: session.hasCamera,
        screenshots: shotCount,
        onPause: () => session.pause(),
        onResume: () => session.resume(),
        onStop: () => void session.stop(),
        onScreenshot: () => void takeScreenshot(),
        onZoomMarker: addZoomMarker,
        zoomMarkers: zoomMarkerCount,
        onToggleMic: toggleMic,
      },
    [session, sessionState, elapsed, micMuted, shotCount, takeScreenshot, toggleMic, addZoomMarker, zoomMarkerCount],
  );

  if (!caps) return <div className="p-10 text-sm text-muted">Checking your browser…</div>;

  if (phase === "setup") {
    return (
      <SetupPanel
        caps={caps}
        prefs={prefs}
        update={update}
        devices={devices}
        micStream={micStream}
        camStream={camStream}
        micStatus={micStatus}
        camStatus={camStatus}
        micLoading={micLoading}
        camLoading={camLoading}
        error={error}
        starting={starting}
        onStart={onStart}
        space={setupSpace}
        cursorExtension={extVersion}
      />
    );
  }

  if (phase === "failed" && unsaved) {
    return <UnsavedFallback result={unsaved.result} message={unsaved.message} onDone={() => (setUnsaved(null), resetToSetup())} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-subtle" ref={stageRef}>
      <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 sm:px-6">
        <Logo />
        {cursorStatus !== "off" && (phase === "recording" || phase === "countdown") && (
          <span
            data-testid="cursor-status"
            className={
              cursorStatus === "on"
                ? "rounded-full bg-primary-light px-2.5 py-1 text-xs font-medium text-primary-strong"
                : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-muted"
            }
          >
            {cursorStatus === "on" && "Cursor tracking on"}
            {cursorStatus === "connecting" && "Connecting cursor tracking…"}
            {cursorStatus === "failed" && "No cursor tracking"}
            {cursorStatus === "unsupported" && "Cursor tracking: browser tabs only"}
          </span>
        )}
        {phase === "recording" && caps.popOutControls && !pipWindow && (
          <Button variant="secondary" size="sm" onClick={() => void openPip()}>
            <PictureInPicture2 className="size-4" /> Pop out controls
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-auto p-4 sm:p-8">
        {(warnings.length > 0) && (
          <div className="w-full max-w-3xl space-y-2">
            {warnings.map((w) => (
              <Notice key={w} tone="warn">
                {w}
              </Notice>
            ))}
          </div>
        )}

        <div className="relative w-full max-w-5xl">
          <MediaFrame aspect={displayAspect} maxHeight="62vh">
            <LiveVideo stream={displayPreview} dataRole="screen" className="size-full object-contain" />
            {session?.hasCamera && camStream && <WebcamBubble layout={prefs.webcam} stream={camStream} />}
            {flash && <div className="absolute inset-0 bg-white/70" />}
            {phase === "countdown" && (
              <div className="absolute inset-0 grid place-items-center bg-ink/60 text-white">
                <div className="text-center">
                  <p className="text-8xl font-bold tabular-nums" aria-live="assertive">
                    {Math.max(countdown, 1)}
                  </p>
                  <p className="mt-2 text-sm text-white/80">Recording starts soon…</p>
                </div>
              </div>
            )}
            {phase === "saving" && (
              <div className="absolute inset-0 grid place-items-center bg-ink/70 text-white">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <LoaderCircle className="size-5 animate-spin" /> Saving to this device…
                </p>
              </div>
            )}
          </MediaFrame>
          <p className="mt-2 text-center text-xs text-muted">
            Live preview — the webcam is recorded as a separate track and shown here for reference.
          </p>
        </div>

        {phase === "countdown" && (
          <Button variant="secondary" onClick={() => session?.cancel()}>
            <X className="size-4" /> Cancel
          </Button>
        )}
        {/* eslint-disable-next-line react-hooks/refs -- handlers read refs only when clicked */}
        {phase === "recording" && controlProps && <RecordingControls {...controlProps} />}
        {phase === "recording" && (
          <div className="flex flex-col items-center gap-1 text-center text-xs text-muted">
            <p>You can also stop with your browser&apos;s “Stop sharing” button — your recording will be saved.</p>
            <p>
              Shortcuts while this tab or the pop-out is focused: <kbd className="font-semibold">Alt+Shift+P</kbd> pause/resume ·{" "}
              <kbd className="font-semibold">Alt+Shift+S</kbd> stop · <kbd className="font-semibold">Alt+Shift+C</kbd> screenshot
            </p>
            <button
              type="button"
              className="font-medium text-faint underline-offset-2 hover:text-red-700 hover:underline"
              onClick={() => {
                if (window.confirm("Discard this recording? Nothing will be saved.")) session?.cancel();
              }}
            >
              Discard recording
            </button>
          </div>
        )}
      </div>

      {pipWindow && session && phase !== "saving" && (
        <PipPortal win={pipWindow}>
          <PipContent session={session} win={pipWindow} countdown={phase === "countdown" ? countdown : null}>
            {(ms) => controlProps && <RecordingControls {...controlProps} elapsedMs={ms} compact />}
          </PipContent>
        </PipPortal>
      )}
    </div>
  );
}

function PipContent({
  session,
  win,
  countdown,
  children,
}: {
  session: RecordingSession;
  win: Window;
  countdown: number | null;
  children: (elapsedMs: number) => React.ReactNode;
}) {
  const ms = useElapsed(countdown === null ? session : null, win);
  if (countdown !== null) {
    return <p className="text-sm font-semibold">Recording starts in {Math.max(countdown, 1)}…</p>;
  }
  return <>{children(ms)}</>;
}

/** Saving to IndexedDB failed (e.g. storage full): never lose the recording — offer direct downloads. */
function UnsavedFallback({ result, message, onDone }: { result: SessionResult; message: string; onDone: () => void }) {
  const urls = useMemo(
    () => ({
      screen: URL.createObjectURL(result.screen.blob),
      camera: result.camera ? URL.createObjectURL(result.camera.blob) : null,
    }),
    [result],
  );
  useEffect(
    () => () => {
      URL.revokeObjectURL(urls.screen);
      if (urls.camera) URL.revokeObjectURL(urls.camera);
    },
    [urls],
  );
  const stem = toFileStem(defaultRecordingName());
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-10">
      <Notice tone="error" title="Your recording couldn't be saved in the browser">
        {message} Download it now so you don&apos;t lose it — it will be gone when you leave this page.
      </Notice>
      <div className="flex flex-wrap gap-3">
        <a
          href={urls.screen}
          download={`${stem}.${extensionForMime(result.screen.mimeType)}`}
          className="inline-flex h-11 items-center gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-white"
        >
          <Download className="size-4" /> Download screen recording
        </a>
        {urls.camera && result.camera && (
          <a
            href={urls.camera}
            download={`${stem}-webcam.${extensionForMime(result.camera.mimeType)}`}
            className="inline-flex h-11 items-center gap-2 rounded-control border border-line bg-white px-4 text-sm font-semibold"
          >
            <Download className="size-4" /> Download webcam
          </a>
        )}
      </div>
      <Button variant="ghost" onClick={onDone}>
        Back to recording setup
      </Button>
    </div>
  );
}

/** Holds a Web Lock until the returned function is called. No-op without the Locks API. */
function holdLock(name: string): () => void {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks?.request) return () => undefined;
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  void locks.request(name, { mode: "exclusive" }, () => held).catch(() => undefined);
  return () => release();
}

function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
}
