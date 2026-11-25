/*
 * CaptureKit Cursor Tracker: content script (runs in every tab, top frame only).
 *
 * Two roles:
 * 1. In CaptureKit app pages (allow-listed origins only): a bridge between the
 *    page (window.postMessage) and the extension background (runtime port).
 * 2. In every page: when told to, it sets a temporary capture handle (so CaptureKit
 *    can tell which tab the user shared) and, only while that tab is being
 *    recorded, reports pointer positions and clicks. Nothing is ever sent to a server.
 */
(() => {
  "use strict";

  // Pages allowed to talk to the extension: local development and the official site.
  // Self-hosting? Add your exact origin here (never a wildcard domain).
  const APP_ORIGINS = [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/, /^https:\/\/nishtek\.in$/];
  const FROM_APP = "capturekit:app";
  const FROM_EXT = "capturekit:ext";
  const VERSION = chrome.runtime.getManifest().version;

  // ---------------------------------------------------------------- bridge
  const isApp = APP_ORIGINS.some((r) => r.test(location.origin));
  if (isApp) {
    let port = null;
    /** Last arm/track request, replayed if the background restarts (MV3 workers can be stopped). */
    let session = null;

    const toPage = (msg) => window.postMessage({ [FROM_EXT]: true, ...msg }, location.origin);

    const connect = () => {
      if (port) return port;
      port = chrome.runtime.connect({ name: "capturekit-app" });
      port.onMessage.addListener((msg) => toPage(msg));
      port.onDisconnect.addListener(() => {
        port = null;
        // Reconnect straight away if a recording is in progress.
        if (session) {
          try {
            const p = connect();
            for (const m of session) p.postMessage(m);
          } catch {
            toPage({ type: "disconnected" });
          }
        }
      });
      return port;
    };

    window.addEventListener("message", (e) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data;
      if (!d || d[FROM_APP] !== true || typeof d.type !== "string") return;
      if (d.type === "hello") {
        toPage({ type: "hello", version: VERSION });
        return;
      }
      const msg = { type: d.type };
      if (d.type === "arm") msg.nonce = String(d.nonce).slice(0, 64);
      if (d.type === "track") msg.tabId = Number(d.tabId);
      if (d.type === "arm") session = [msg];
      else if (d.type === "track" && session) session = [session[0], msg];
      else if (d.type === "stop") session = null;
      try {
        connect().postMessage(msg);
      } catch {
        port = null;
        toPage({ type: "disconnected" });
      }
    });

    toPage({ type: "hello", version: VERSION });
  }

  // ---------------------------------------------------------------- tracking
  let tracking = false;
  let buffer = [];
  let timer = null;
  let lastMove = 0;
  const now = () => performance.timeOrigin + performance.now();
  const opts = { capture: true, passive: true };

  const flush = () => {
    timer = null;
    if (buffer.length === 0) return;
    const events = buffer;
    buffer = [];
    chrome.runtime.sendMessage({ type: "events", events }).catch(() => {});
  };
  const push = (kind, x, y) => {
    buffer.push([now(), x, y, kind]);
    if (!timer) timer = setTimeout(flush, 50);
  };
  const norm = (e) => [e.clientX / window.innerWidth, e.clientY / window.innerHeight];

  const onMove = (e) => {
    const t = performance.now();
    if (t - lastMove < 8) return; // ~120 Hz max
    lastMove = t;
    push(0, ...norm(e));
  };
  const onDown = (e) => push(1, ...norm(e));
  const onUp = (e) => push(2, ...norm(e));
  const onOut = (e) => {
    if (!e.relatedTarget) {
      push(3, 0, 0);
      flush();
    }
  };

  function setTracking(on) {
    if (on === tracking) return;
    tracking = on;
    const m = on ? "addEventListener" : "removeEventListener";
    window[m]("pointermove", onMove, opts);
    window[m]("pointerdown", onDown, opts);
    window[m]("pointerup", onUp, opts);
    document[m]("mouseout", onOut, opts);
    if (!on) flush();
  }

  function setHandle(handle) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.setCaptureHandleConfig) return false;
      navigator.mediaDevices.setCaptureHandleConfig(
        handle ? { handle, exposeOrigin: false, permittedOrigins: ["*"] } : {},
      );
      return true;
    } catch {
      return false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "arm") sendResponse({ ok: setHandle(msg.handle) });
    else if (msg.type === "disarm") {
      setHandle(null);
      setTracking(false);
    } else if (msg.type === "track") setTracking(!!msg.on);
    else if (msg.type === "zoom-marker" && isApp) window.postMessage({ [FROM_EXT]: true, type: "zoom-marker" }, location.origin);
  });

  // After a navigation in a tab that's being recorded, resume tracking.
  chrome.runtime
    .sendMessage({ type: "ready" })
    .then((r) => {
      if (r && r.handle) setHandle(r.handle);
      if (r && r.track) setTracking(true);
    })
    .catch(() => {});
})();
