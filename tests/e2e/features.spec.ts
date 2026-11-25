import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_MEDIA, landOnRecording } from "./helpers";

test.use({ launchOptions: { args: [...FAKE_MEDIA, "--auto-select-desktop-capture-source=Entire screen"] } });
test.setTimeout(180_000);

/** Records ~5 s of the entire screen, pressing "Zoom in here" once, and returns on the recording page. */
async function recordWithMarker(page: Page) {
  await page.goto("/record");
  await page.getByRole("radio", { name: /Entire screen/ }).click();
  await page.getByRole("switch", { name: "Countdown" }).click();
  const sys = page.getByRole("switch", { name: "System audio" });
  if ((await sys.getAttribute("aria-checked")) === "true") await sys.click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByTestId("timer").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await page.getByTestId("zoom-marker").first().click();
  await expect(page.getByTestId("zoom-marker").first()).toContainText("1");
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Stop recording" }).first().click();
  await landOnRecording(page);
}

async function storedRecordingScreen(page: Page): Promise<string> {
  const id = new URL(page.url()).searchParams.get("id");
  // Returns the stored screen video as base64 (via FileReader), to write a real file for import.
  return page.evaluate(
    (rid) =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open("capturekit");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("chunks");
          const idx = tx.objectStore("chunks").index("recordingId").getAll(IDBKeyRange.only(rid));
          idx.onsuccess = () => {
            const parts = (idx.result as Array<{ track: string; seq: number; blob: Blob }>).filter((c) => c.track === "screen").sort((a, b) => a.seq - b.seq);
            const finish = (blob: Blob) => {
              const fr = new FileReader();
              fr.onload = () => resolve(String(fr.result).split(",")[1]);
              fr.onerror = () => reject(fr.error);
              fr.readAsDataURL(blob);
            };
            if (parts.length) return finish(new Blob(parts.map((p) => p.blob), { type: "video/webm" }));
            const m = db.transaction("media").objectStore("media").get(`${rid}/screen`);
            m.onsuccess = () => finish(m.result.blob);
            m.onerror = () => reject(m.error);
          };
          idx.onerror = () => reject(idx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    id,
  );
}

test("zoom marker, speed, GIF export, project file and video import", async ({ page }, info) => {
  await recordWithMarker(page);
  const screenB64 = await storedRecordingScreen(page);
  await page.getByRole("link", { name: /Edit & export/ }).click();
  await expect(page.getByTestId("clip-0")).toBeVisible();

  // The "zoom here" mark became a manual zoom.
  await expect(page.getByTestId("zoom-0")).toBeVisible();
  await expect(page.getByTestId("zoom-0")).toHaveAttribute("title", /2× zoom$/);

  // Speed: select the clip and play it at 2×; the edited length halves.
  const before = (await page.getByTestId("edit-duration").textContent())!.split("/")[1].trim();
  await page.getByTestId("clip-0").click({ position: { x: 20, y: 30 } });
  await page.getByRole("button", { name: "Trim & cut", exact: true }).click();
  await page.getByRole("radio", { name: "Clip speed: 2×" }).click();
  await expect(page.getByTestId("edit-duration")).not.toHaveText(new RegExp(`/ ${before}$`));

  // GIF export decodes as an image of the chosen size.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /GIF/ }).click();
  await dialog.getByRole("radio", { name: /^Small/ }).click();
  await dialog.getByRole("radio", { name: "10 fps" }).click();
  await dialog.getByRole("button", { name: "Export GIF" }).click();
  const img = dialog.getByTestId("export-result");
  await expect(img).toBeVisible({ timeout: 120_000 });
  await page.waitForFunction(() => (document.querySelector<HTMLImageElement>("[data-testid=export-result]")?.naturalWidth ?? 0) > 0);
  expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(480);
  const [gifDl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("link", { name: /^Download GIF/ }).click()]);
  expect((await readFile(await gifDl.path())).subarray(0, 6).toString()).toBe("GIF89a");
  await dialog.getByRole("button", { name: "Close" }).click();

  // Save the project as one file, then open it again: a new copy with the same edits.
  await page.waitForTimeout(800);
  const [projDl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save project file" }).click()]);
  expect(projDl.suggestedFilename()).toMatch(/\.capturekit$/);
  const projPath = info.outputPath("project.capturekit");
  await projDl.saveAs(projPath);
  const firstId = new URL(page.url()).searchParams.get("id");

  await page.goto("/recordings");
  await page.getByTestId("import-project").setInputFiles(projPath);
  await page.waitForURL(/\/editor\?id=/, { timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get("id")).not.toBe(firstId);
  await expect(page.getByTestId("clip-0")).toBeVisible();
  await page.getByRole("button", { name: "Trim & cut", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Clip speed: 2×" })).toHaveAttribute("aria-checked", "true");

  // Import a plain video file.
  const videoPath = path.join(info.outputDir, "imported clip.webm");
  await writeFile(videoPath, Buffer.from(screenB64, "base64"));
  await page.goto("/recordings");
  await page.getByTestId("import-video").setInputFiles(videoPath);
  await page.waitForURL(/\/editor\?id=/, { timeout: 30_000 });
  await expect(page.getByTestId("clip-0")).toBeVisible();
  await expect(page.getByText("imported clip")).toBeVisible();
});

test("help, FAQ, privacy and terms pages, footer credit, and the extension download", async ({ page, request }) => {
  await page.goto("/");
  const footer = page.getByTestId("site-footer");
  await expect(footer).toContainText("Vibecoded by Nishkam");
  await expect(footer.getByRole("link", { name: /Instagram/ })).toHaveAttribute("href", "https://www.instagram.com/nishkambhatia/");
  for (const [link, heading] of [
    ["FAQ", "Frequently asked questions"],
    ["Privacy policy", "Privacy policy"],
    ["Terms & conditions", "Terms & conditions"],
  ] as const) {
    await footer.getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }

  await page.goto("/help");
  await page.getByText(/Advanced: cursor for browser-tab recordings/).click();
  const dl = page.getByRole("link", { name: "Download the extension" });
  await expect(dl).toBeVisible();
  const href = (await dl.getAttribute("href"))!;
  const res = await request.get(href);
  expect(res.ok()).toBe(true);
  const zip = await res.body();
  expect(zip.subarray(0, 2).toString()).toBe("PK");
  expect(zip.includes(Buffer.from("capturekit-extension/manifest.json"))).toBe(true);
});

/** A 2-second 440 Hz mono WAV. */
function sineWav(seconds = 2, rate = 22050): Buffer {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), 44 + i * 2);
  return buf;
}

test("image annotation and a music track: shown in the preview and mixed into the export", async ({ page }, info) => {
  await page.goto("/record");
  await page.getByRole("radio", { name: /Entire screen/ }).click();
  await page.getByRole("switch", { name: "Countdown" }).click();
  const sys = page.getByRole("switch", { name: "System audio" });
  if ((await sys.getAttribute("aria-checked")) === "true") await sys.click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByTestId("timer").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Stop recording" }).first().click();
  await landOnRecording(page);
  await page.getByRole("link", { name: /Edit & export/ }).click();
  await expect(page.getByTestId("clip-0")).toBeVisible();

  // Image annotation: the frame at the playhead changes once the image is added.
  const ruler = (await page.getByTestId("timeline-ruler").boundingBox())!;
  await page.mouse.click(ruler.x + ruler.width * 0.4, ruler.y + ruler.height / 2);
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  await page.waitForTimeout(500);
  const frame = () => page.getByTestId("editor-canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png"));
  const before = await frame();
  await page.getByTestId("add-image-annotation").setInputFiles(path.resolve("extension/icons/icon-128.png"));
  await expect(page.getByTestId("annotation-list").or(page.getByText("Drag it on the preview to move it"))).toBeVisible();
  await page.waitForTimeout(500);
  expect(await frame()).not.toBe(before);

  // Music track at the start.
  const wav = path.join(info.outputDir, "beep.wav");
  await mkdir(info.outputDir, { recursive: true });
  await writeFile(wav, sineWav());
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await page.getByTestId("add-audio-track").setInputFiles(wav);
  await expect(page.getByTestId("audio-tracks").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("audio-tracks")).toContainText("beep");

  // Export WebM: the recording itself has no audio, so any sound comes from the music track.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "WebM" }).click();
  await dialog.getByRole("radio", { name: /^720p/ }).click();
  await dialog.getByRole("button", { name: "Export WebM" }).click();
  await expect(dialog.getByTestId("export-result")).toBeVisible({ timeout: 60_000 });
  const hasAudio = await dialog.getByTestId("export-result").evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play();
    await new Promise((r) => setTimeout(r, 1200));
    v.pause();
    return (v as HTMLVideoElement & { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount ?? -1;
  });
  expect(hasAudio).toBeGreaterThan(0);
});

test("auto zoom finds the cursor and click in a real encoded video and zooms in before the click", async ({ page }, info) => {
  await page.goto("/recordings");
  // Make a 6 s "screen recording": desktop-like UI, an OS-style cursor that moves to a button,
  // stops, and a menu opens next to it (the click), then moves away. Encoded by the browser like a real recording.
  const b64 = await page.evaluate(async () => {
    const W = 1280;
    const H = 720;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const arrow = (x: number, y: number, h: number) => {
      const pts = [[0, 0], [0, 0.8], [0.2, 0.62], [0.33, 0.92], [0.45, 0.86], [0.33, 0.58], [0.58, 0.58]];
      g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(x + px * h, y + py * h) : g.moveTo(x + px * h, y + py * h)));
      g.closePath();
      g.fillStyle = "#fff";
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = "#000";
      g.stroke();
    };
    const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, Math.max(0, k));
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: "video/webm;codecs=vp8", videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start(500);
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const frame = () => {
        const t = performance.now() - t0;
        g.fillStyle = "#eef2f7";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#dde3ea";
        g.fillRect(0, 0, 240, H);
        g.fillStyle = "#8a96a6";
        for (let k = 0; k < 16; k++) g.fillRect(300, 60 + k * 36, 380 + ((k * 97) % 400), 10);
        g.fillStyle = "#10b981";
        g.fillRect(780, 380, 140, 40); // the button
        if (t >= 1900) {
          g.fillStyle = "#ffffff";
          g.fillRect(800, 430, 260, 200); // menu
          g.fillStyle = "#334155";
          for (let k = 0; k < 5; k++) g.fillRect(820, 450 + k * 34, 180, 10);
        }
        const [x, y] =
          t < 1500 ? [lerp(200, 830, t / 1500), lerp(150, 395, t / 1500)] : t < 3500 ? [830, 395] : [lerp(830, 350, (t - 3500) / 1000), lerp(395, 560, (t - 3500) / 1000)];
        arrow(x, y, 22);
        if (t < 6000) requestAnimationFrame(frame);
        else resolve();
      };
      frame();
    });
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: "video/webm" });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  await mkdir(info.outputDir, { recursive: true });
  const file = path.join(info.outputDir, "click demo.webm");
  await writeFile(file, Buffer.from(b64, "base64"));

  await page.getByTestId("import-video").setInputFiles(file);
  await page.waitForURL(/\/editor\?id=/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  await expect(page.getByTestId("activity-analysis")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText(/Based on your cursor/)).toBeVisible();
  await expect(page.getByTestId("zoom-0")).toBeVisible();
  await expect(page.getByTestId("zoom-1")).toHaveCount(0); // one meaningful zoom, not several

  // The zoom is fully in before the click (~1.5–1.9 s) and starts during the approach.
  await page.waitForTimeout(800);
  const id = new URL(page.url()).searchParams.get("id");
  const seg = await page.evaluate(
    (rid) =>
      new Promise<{ start: number; end: number; x: number; y: number; mode: string }>((resolve, reject) => {
        const req = indexedDB.open("capturekit");
        req.onsuccess = () => {
          const g = req.result.transaction("projects").objectStore("projects").get(rid!);
          g.onsuccess = () => resolve(g.result.zoom.segments[0]);
          g.onerror = () => reject(g.error);
        };
      }),
    id,
  );
  expect(seg.start + 700).toBeLessThanOrEqual(1950);
  expect(seg.start).toBeGreaterThan(0);
  expect(seg.end).toBeGreaterThan(2500);
  // Steady on the click spot (the button at ~830, 395 of 1280×720), not following the cursor.
  expect((seg as { mode?: string }).mode).toBe("fixed");
  expect(seg.x).toBeCloseTo(830 / 1280, 1);
  expect(seg.y).toBeCloseTo(395 / 720, 1);
  // Cursor panel: no extension prompt; the cursor was found in the video.
  await page.getByRole("button", { name: "Cursor", exact: true }).click();
  await expect(page.getByText(/Found in your video/)).toBeVisible();
  await expect(page.getByText(/extension/i)).toHaveCount(0);
});
