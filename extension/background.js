/*
 * CaptureKit Cursor Tracker: background service worker.
 * Routes messages between the CaptureKit app tab and the tab being recorded.
 * State lives in chrome.storage.session so it survives the worker being stopped.
 */
"use strict";

/** Bridge ports by CaptureKit tab id; events go to the tab that started the recording. */
const ports = new Map();
const appPortFor = () => (state.appTabId !== null ? ports.get(state.appTabId) : undefined);
let state = { nonce: null, appTabId: null, targetTabId: null };

const ready = chrome.storage.session.get("state").then((r) => {
  if (r.state) state = r.state;
});
const save = () => chrome.storage.session.set({ state });

const handleFor = (tabId) => `capturekit:${state.nonce}:${tabId}`;

async function allTabs() {
  try {
    return await chrome.tabs.query({});
  } catch {
    return [];
  }
}

async function arm(nonce, appTabId) {
  state = { nonce, appTabId, targetTabId: null };
  await save();
  let armed = 0;
  await Promise.all(
    (await allTabs()).map(async (t) => {
      if (t.id === undefined) return;
      try {
        const r = await chrome.tabs.sendMessage(t.id, { type: "arm", handle: handleFor(t.id) });
        if (r && r.ok) armed++;
      } catch {
        /* tab without our content script (chrome://, store, etc.) */
      }
    }),
  );
  appPortFor()?.postMessage({ type: "armed", count: armed });
}

async function track(tabId) {
  state.targetTabId = tabId;
  await save();
  for (const t of await allTabs()) {
    if (t.id === undefined) continue;
    chrome.tabs.sendMessage(t.id, t.id === tabId ? { type: "track", on: true } : { type: "disarm" }).catch(() => {});
  }
  appPortFor()?.postMessage({ type: "tracking", tabId });
}

async function stopAll() {
  const target = state.targetTabId;
  state = { nonce: null, appTabId: null, targetTabId: null };
  await save();
  for (const t of await allTabs()) {
    if (t.id === undefined) continue;
    chrome.tabs.sendMessage(t.id, { type: "disarm" }).catch(() => {});
  }
  if (target !== null) chrome.tabs.sendMessage(target, { type: "track", on: false }).catch(() => {});
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "capturekit-app" || !port.sender?.tab) return;
  ports.set(port.sender.tab.id, port);
  const appTabId = port.sender.tab.id;
  port.onMessage.addListener(async (msg) => {
    await ready;
    if (msg.type === "arm") await arm(msg.nonce, appTabId);
    else if (msg.type === "track") await track(msg.tabId);
    else if (msg.type === "stop") await stopAll();
  });
  port.onDisconnect.addListener(() => {
    if (ports.get(appTabId) === port) ports.delete(appTabId);
    // Keep state: the app's bridge reconnects if the worker restarts. If the app tab
    // itself closed, tabs.onRemoved below cleans up.
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !sender.tab) return;
  if (msg.type === "events") {
    ready.then(() => {
      const appPort = appPortFor();
      if (sender.tab.id === state.targetTabId && appPort && Array.isArray(msg.events)) {
        appPort.postMessage({ type: "events", events: msg.events });
      }
    });
    return;
  }
  if (msg.type === "ready") {
    ready.then(() =>
      sendResponse({
        track: sender.tab.id === state.targetTabId,
        handle: state.nonce && state.targetTabId === null ? handleFor(sender.tab.id) : null,
      }),
    );
    return true; // async response
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  ready.then(() => {
    if (tabId === state.appTabId) void stopAll();
  });
});
