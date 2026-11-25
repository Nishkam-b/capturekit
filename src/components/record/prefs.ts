import type { DisplaySurfaceHint, WebcamLayout } from "@/engines/shared/types";

export interface SetupPrefs {
  surface: DisplaySurfaceHint;
  mic: boolean;
  micId: string;
  camera: boolean;
  cameraId: string;
  systemAudio: boolean;
  webcam: WebcamLayout;
  countdown: boolean;
}

export const DEFAULT_PREFS: SetupPrefs = {
  surface: "monitor",
  mic: false,
  micId: "",
  camera: false,
  cameraId: "",
  systemAudio: true,
  webcam: { position: "bottom-right", size: "medium", shape: "circle" },
  countdown: true,
};

const KEY = "capturekit:setup-prefs:v1";

export function loadPrefs(): SetupPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<SetupPrefs>;
    return { ...DEFAULT_PREFS, ...parsed, webcam: { ...DEFAULT_PREFS.webcam, ...parsed.webcam } };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: SetupPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // storage blocked: preferences just won't be remembered
  }
}

/** 'granted' | 'denied' | 'prompt' | 'unknown' — never triggers a prompt. */
export async function permissionState(name: "camera" | "microphone"): Promise<PermissionState | "unknown"> {
  try {
    const status = await navigator.permissions.query({ name: name as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}
