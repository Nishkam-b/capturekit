import { pickMimeType } from "./mime";

export type BrowserFamily = "chromium" | "firefox" | "safari" | "other";

export interface RecorderCapabilities {
  secureContext: boolean;
  screenCapture: boolean;
  userMedia: boolean;
  mediaRecorder: boolean;
  /** Mime type MediaRecorder will use for screen + audio, or null. */
  mimeType: string | null;
  browser: BrowserFamily;
  isMobile: boolean;
  /** Browser honours the displaySurface hint (pre-selects a picker tab). */
  surfaceHint: boolean;
  /** Tab audio can be captured. */
  tabAudio: boolean;
  /** Whole-screen system audio can be captured (Chromium on Windows/ChromeOS). */
  screenAudio: boolean;
  /** Floating pop-out controls via Document Picture-in-Picture. */
  popOutControls: boolean;
  /** Fully able to record. */
  canRecord: boolean;
  /** Human-readable reasons recording is impossible. */
  blockers: string[];
}

export function detectBrowser(ua: string): BrowserFamily {
  if (/Firefox\//.test(ua)) return "firefox";
  if (/(Chrome|Chromium|Edg|OPR)\//.test(ua)) return "chromium";
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}

export function detectCapabilities(): RecorderCapabilities {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const ua = nav?.userAgent ?? "";
  const browser = detectBrowser(ua);
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const isWindowsOrCros = /Windows|CrOS/.test(ua);
  const secureContext = typeof window !== "undefined" && window.isSecureContext;
  const md = nav?.mediaDevices;
  const screenCapture = !!md && typeof md.getDisplayMedia === "function";
  const userMedia = !!md && typeof md.getUserMedia === "function";
  const mediaRecorder = typeof MediaRecorder !== "undefined";
  const mimeType = mediaRecorder ? pickMimeType(true) : null;
  const chromium = browser === "chromium";

  const blockers: string[] = [];
  if (!secureContext) blockers.push("This page must be opened over HTTPS (or localhost) to access screen capture.");
  if (isMobile) blockers.push("Mobile browsers don't support screen recording. Please use a desktop browser.");
  else if (!screenCapture) blockers.push("This browser doesn't support screen capture (getDisplayMedia).");
  if (!mediaRecorder) blockers.push("This browser doesn't support MediaRecorder.");
  else if (!mimeType) blockers.push("This browser can't encode video with MediaRecorder.");

  return {
    secureContext,
    screenCapture,
    userMedia,
    mediaRecorder,
    mimeType,
    browser,
    isMobile,
    surfaceHint: chromium,
    tabAudio: chromium,
    screenAudio: chromium && isWindowsOrCros,
    popOutControls: typeof window !== "undefined" && "documentPictureInPicture" in window,
    canRecord: blockers.length === 0,
    blockers,
  };
}
