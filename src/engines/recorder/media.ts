import type { DisplaySurfaceHint } from "../shared/types";

export interface DeviceOption {
  deviceId: string;
  label: string;
}

export interface DeviceLists {
  microphones: DeviceOption[];
  cameras: DeviceOption[];
}

/** Labels are empty until the user has granted the matching permission once. */
export async function listDevices(): Promise<DeviceLists> {
  const all = await navigator.mediaDevices.enumerateDevices();
  const map = (kind: MediaDeviceKind, fallback: string) =>
    all
      .filter((d) => d.kind === kind && d.deviceId)
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
  return { microphones: map("audioinput", "Microphone"), cameras: map("videoinput", "Camera") };
}

export async function getMicrophoneStream(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
}

export async function getCameraStream(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
  });
}

export interface DisplayRequest {
  surface: DisplaySurfaceHint;
  systemAudio: boolean;
}

/**
 * Opens the browser's screen picker. MUST be called directly from a user
 * gesture (click handler) before awaiting anything else.
 * Non-standard/Chromium-only options are passed through; other browsers ignore them.
 */
export function requestDisplayStream({ surface, systemAudio }: DisplayRequest): Promise<MediaStream> {
  const options: DisplayMediaStreamOptions & Record<string, unknown> = {
    video: {
      displaySurface: surface,
      frameRate: { ideal: 30, max: 60 },
    } as MediaTrackConstraints,
    audio: systemAudio
      ? ({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: false,
        } as MediaTrackConstraints)
      : false,
    // Don't let users record the CaptureKit tab itself (infinite mirror).
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    systemAudio: systemAudio ? "include" : "exclude",
    monitorTypeSurfaces: "include",
  };
  return navigator.mediaDevices.getDisplayMedia(options);
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Map a getUserMedia/getDisplayMedia error to a friendly message. */
export function describeMediaError(err: unknown, what: "screen" | "microphone" | "camera"): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return what === "screen"
        ? "Screen sharing was cancelled or blocked. Click Start Recording and choose what to share."
        : `${cap(what)} access was blocked. Allow it from the icon in the address bar, then try again.`;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return `No ${what} was found. Check that it's connected.`;
    case "NotReadableError":
    case "TrackStartError":
      return `Your ${what} is busy or unavailable. Close other apps using it and try again.`;
    case "OverconstrainedError":
      return `The selected ${what} isn't available any more. Pick another device.`;
    case "AbortError":
      return `Starting the ${what} was interrupted. Please try again.`;
    default:
      return `Couldn't access the ${what}${err instanceof Error && err.message ? `: ${err.message}` : "."}`;
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
